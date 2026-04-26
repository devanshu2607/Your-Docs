# Auth Service

This service owns signup, login, logout, and token verification endpoints.

Suggested next step:
- add a `Dockerfile`
- run with `uvicorn main:app --host 0.0.0.0 --port 8000`

Current design note:
- this first cut reuses shared modules from `backend/` so you can learn service boundaries before extracting a shared package.
