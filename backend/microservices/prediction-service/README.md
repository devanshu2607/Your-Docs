# Prediction Service

This service owns TensorFlow autocomplete and background model warm-up.

Suggested next step:
- add a `Dockerfile`
- run with `uvicorn main:app --host 0.0.0.0 --port 8000`

Connection idea:
- docs or gateway service can call `GET /predict?text=...`
- `GET /predict/status` is useful for warm-up checks
