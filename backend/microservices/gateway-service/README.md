# Gateway Service

This service preserves the current frontend contract while routing requests to
the underlying microservices.

Default local service mapping:
- auth -> http://127.0.0.1:8001
- docs -> http://127.0.0.1:8002
- websocket -> ws://127.0.0.1:8003
- prediction -> http://127.0.0.1:8004

Run on port 8000 so the existing frontend can keep using one base URL.
