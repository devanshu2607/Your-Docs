# Prediction Service

This service now uses an external prediction API for autocomplete.

Legacy TensorFlow model artifacts are intentionally still stored in
`microservices/prediction-service/models/` for portfolio/reference purposes,
but deployment images do not include them and the running service does not load
them anymore.

Suggested next step:
- add a `Dockerfile`
- run with `uvicorn main:app --host 0.0.0.0 --port 8000`

Connection idea:
- docs or gateway service can call `GET /predict?text=...`
- `GET /predict/status` is useful for provider/config checks

Provider mode:
- default provider: `openrouter`
- default model: `openrouter/free`
- env vars: `PREDICTION_PROVIDER`, `PREDICTION_API_KEY`, `PREDICTION_MODEL`, `PREDICTION_BASE_URL`
