# WebSocket Service

This service owns live collaboration over WebSockets.

Suggested next step:
- add a `Dockerfile`
- run with `uvicorn main:app --host 0.0.0.0 --port 8000`

Connection idea:
- frontend opens WebSocket connections here
- docs data still lives in the shared database
