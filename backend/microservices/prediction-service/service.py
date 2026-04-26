import pickle
import re
import threading
from pathlib import Path

import numpy as np


class PredictionService:
    def __init__(self):
        self.max_len = 20
        self.tf = None
        self.model = None
        self.tokenizer = None
        self.load_error = None
        self._lock = threading.Lock()
        self._loading = False
        self._loaded = False
        self._backend_dir = Path(__file__).resolve().parents[2]
        self._service_dir = Path(__file__).resolve().parent
        self._asset_paths = {
            "keras_model": self._resolve_asset_path("lstm_model.keras"),
            "h5_model": self._resolve_asset_path("lstm_model.h5"),
            "tokens_tokenizer": self._resolve_asset_path("tokens.pkl"),
            "lstm_tokenizer": self._resolve_asset_path("lstm_tokenizer.pkl"),
        }
        self._model_path = self._asset_paths["keras_model"]
        self._tokenizer_path = self._asset_paths["tokens_tokenizer"]

    def _resolve_asset_path(self, *filenames: str) -> Path:
        candidates = []
        for filename in filenames:
            candidates.extend([
                self._service_dir / "models" / filename,
                self._backend_dir / filename,
                self._backend_dir / "Services" / filename,
                self._backend_dir / "next_word_prediction" / filename,
            ])
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    def _load_tokenizer(self):
        tokenizer_candidates = [
            self._asset_paths["tokens_tokenizer"],
            self._asset_paths["lstm_tokenizer"],
        ]
        last_error = None
        for tokenizer_path in tokenizer_candidates:
            try:
                with open(tokenizer_path, "rb") as file_obj:
                    tokenizer = pickle.load(file_obj)
                self._tokenizer_path = tokenizer_path
                return tokenizer
            except Exception as exc:
                last_error = exc
        raise last_error

    def _load_model_file(self, tf):
        model_candidates = [
            self._asset_paths["keras_model"],
            self._asset_paths["h5_model"],
        ]
        last_error = None
        for model_path in model_candidates:
            try:
                model = tf.keras.models.load_model(model_path)
                self._model_path = model_path
                return model
            except Exception as exc:
                last_error = exc
        raise last_error

    def start_background_loading(self):
        with self._lock:
            if self._loaded or self._loading:
                return
            self._loading = True
            threading.Thread(target=self._load_assets, daemon=True).start()

    def _load_assets(self):
        try:
            import tensorflow as tf

            model = self._load_model_file(tf)
            tokenizer = self._load_tokenizer()

            with self._lock:
                self.tf = tf
                self.model = model
                self.tokenizer = tokenizer
                self.load_error = None
                self._loaded = True
        except Exception as exc:
            with self._lock:
                self.load_error = exc
        finally:
            with self._lock:
                self._loading = False

    def status_payload(self):
        with self._lock:
            if self._loaded:
                status = "ready"
            elif self._loading:
                status = "loading"
            elif self.load_error is not None:
                status = "error"
            else:
                status = "idle"
            return {
                "status": status,
                "model_path": str(self._model_path),
                "tokenizer_path": str(self._tokenizer_path),
                "available_assets": {key: str(path) for key, path in self._asset_paths.items()},
                "error": str(self.load_error) if self.load_error else None,
            }

    def predict_next_word(self, text: str):
        if not self._loaded:
            self.start_background_loading()
            return {"status": self.status_payload()["status"], "word": ""}

        cleaned = re.sub(r"[^a-zA-Z0-9']+", " ", (text or "").lower()).strip()
        if not cleaned:
            return {"status": "ready", "word": ""}

        seq = self.tokenizer.texts_to_sequences([cleaned])[0]
        if not seq:
            return {"status": "ready", "word": ""}

        seq = self.tf.keras.preprocessing.sequence.pad_sequences(
            [seq],
            maxlen=self.max_len - 1,
            padding="pre",
        )
        pred = self.model.predict(seq, verbose=0)
        index = int(np.argmax(pred))
        word = self.tokenizer.index_word.get(index) or self.tokenizer.index_word.get(index + 1, "")
        if word:
            return {"status": "ready", "word": word}

        for candidate in np.argsort(pred[0])[::-1]:
            candidate = int(candidate)
            word = self.tokenizer.index_word.get(candidate) or self.tokenizer.index_word.get(candidate + 1, "")
            if word:
                return {"status": "ready", "word": word}

        return {"status": "ready", "word": ""}


prediction_service = PredictionService()
