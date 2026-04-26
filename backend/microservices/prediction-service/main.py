import sys
from pathlib import Path

from fastapi import FastAPI

SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from service import prediction_service

app = FastAPI(title="Prediction Service")


@app.on_event("startup")
def warm_prediction_model():
    prediction_service.start_background_loading()


@app.get("/health")
def health():
    return {"service": "prediction", "status": "ok"}


@app.get("/predict/status")
def prediction_status():
    return prediction_service.status_payload()


@app.get("/predict")
def predict(text: str):
    return prediction_service.predict_next_word(text)
