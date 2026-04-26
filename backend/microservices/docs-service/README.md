# Docs Service

This service owns document CRUD and membership endpoints.

Suggested next step:
- add a `Dockerfile`
- run with `uvicorn main:app --host 0.0.0.0 --port 8000`

Connection idea:
- frontend talks to this service for create/list/view/update/delete doc flows
- websocket collaboration can stay in a separate service
