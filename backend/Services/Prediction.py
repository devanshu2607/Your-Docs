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
        self._base_dir = Path(__file__).resolve().parent.parent
        self._services_dir = Path(__file__).resolve().parent
        self._model_path = self._resolve_asset_path("lstm_model.h5")
        self._tokenizer_path = self._resolve_asset_path("lstm_tokenizer.pkl")

    def _resolve_asset_path(self, filename: str) -> Path:
        candidates = [
            self._base_dir / filename,
            self._services_dir / filename,
            self._base_dir / "next_word_prediction" / filename,
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    def start_background_loading(self):
        with self._lock:
            if self._loaded or self._loading:
                return

            self._loading = True
            thread = threading.Thread(target=self._load_assets, daemon=True)
            thread.start()

    def _load_assets(self):
        try:
            import tensorflow as tf

            model = tf.keras.models.load_model(self._model_path)
            with open(self._tokenizer_path, "rb") as file_obj:
                tokenizer = pickle.load(file_obj)

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

    def status(self):
        with self._lock:
            if self._loaded:
                return "ready"
            if self._loading:
                return "loading"
            if self.load_error is not None:
                return "error"
            return "idle"

    def predict_next_word(self, text: str) -> str:
        if not self._loaded:
            self.start_background_loading()
            return ""

        cleaned = re.sub(r"[^a-zA-Z0-9']+", " ", (text or "").lower()).strip()
        if not cleaned:
            return ""

        seq = self.tokenizer.texts_to_sequences([cleaned])[0]
        if not seq:
            return ""

        seq = self.tf.keras.preprocessing.sequence.pad_sequences(
            [seq],
            maxlen=self.max_len - 1,
            padding="pre",
        )
        pred = self.model.predict(seq, verbose=0)
        index = int(np.argmax(pred))

        word = self.tokenizer.index_word.get(index) or self.tokenizer.index_word.get(index + 1, "")
        if word:
            return word

        for candidate in np.argsort(pred[0])[::-1]:
            candidate = int(candidate)
            word = self.tokenizer.index_word.get(candidate) or self.tokenizer.index_word.get(candidate + 1, "")
            if word:
                return word

        return ""


prediction_service = PredictionService()
