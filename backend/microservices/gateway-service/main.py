import asyncio
import os
from typing import Optional

import httpx  # type: ignore[import]
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response


def env_url(name: str, default: str) -> str:
    return os.getenv(name, default).rstrip("/")


def service_url(prefix: str, default_url: str, scheme: str) -> str:
    hostport = os.getenv(f"{prefix}_HOSTPORT", "").strip()
    if hostport:
        if hostport.startswith("http://") or hostport.startswith("https://") or hostport.startswith("ws://") or hostport.startswith("wss://"):
            return hostport.rstrip("/")
        return f"{scheme}://{hostport}".rstrip("/")
    return env_url(f"{prefix}_URL", default_url)


AUTH_SERVICE_URL = service_url("AUTH_SERVICE", "http://127.0.0.1:8001", "http")
DOCS_SERVICE_URL = service_url("DOCS_SERVICE", "http://127.0.0.1:8002", "http")
WS_SERVICE_URL = service_url("WS_SERVICE", "ws://127.0.0.1:8003", "ws")
PREDICTION_SERVICE_URL = service_url("PREDICTION_SERVICE", "http://127.0.0.1:8004", "http")


def get_allowed_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)
    return origins or ["http://localhost:3000"]


app = FastAPI(title="Gateway Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_auth_header(request: Request) -> dict:
    auth = request.headers.get("authorization")
    return {"Authorization": auth} if auth else {}


async def proxy_json_or_form(
    request: Request,
    target_base: str,
    target_path: str,
    *,
    form_encoded: bool = False,
) -> Response:
    headers = extract_auth_header(request)
    async with httpx.AsyncClient(timeout=60.0) as client:
        if form_encoded:
            form = await request.form()
            response = await client.request(
                request.method,
                f"{target_base}{target_path}",
                data=dict(form),
                params=request.query_params,
                headers=headers,
            )
        else:
            body: Optional[dict] = None
            if request.method not in {"GET", "DELETE"}:
                body = await request.json()
            response = await client.request(
                request.method,
                f"{target_base}{target_path}",
                json=body,
                params=request.query_params,
                headers=headers,
            )

    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return JSONResponse(status_code=response.status_code, content=response.json())
    return Response(status_code=response.status_code, content=response.content, media_type=content_type or None)


@app.get("/health")
def health():
    return {"service": "gateway", "status": "ok"}


@app.post("/create_user")
async def create_user(request: Request):
    return await proxy_json_or_form(request, AUTH_SERVICE_URL, "/create_user")


@app.post("/login_user")
async def login_user(request: Request):
    return await proxy_json_or_form(request, AUTH_SERVICE_URL, "/login_user", form_encoded=True)


@app.post("/logout")
async def logout(request: Request):
    return await proxy_json_or_form(request, AUTH_SERVICE_URL, "/logout")


@app.post("/create_docs")
async def create_docs(request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, "/create_docs")


@app.post("/get_doc/{docs_id}")
async def get_doc(docs_id: str, request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, f"/get_doc/{docs_id}")


@app.post("/user_docs")
async def user_docs(request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, "/user_docs")


@app.put("/update_docs/{docs_id}")
async def update_docs(docs_id: str, request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, f"/update_docs/{docs_id}")


@app.delete("/delete_docs/{docs_id}")
async def delete_docs(docs_id: str, request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, f"/delete_docs/{docs_id}")


@app.post("/join_docs/{doc_id}")
async def join_docs(doc_id: str, request: Request):
    return await proxy_json_or_form(request, DOCS_SERVICE_URL, f"/join_docs/{doc_id}")


@app.get("/predict")
async def predict(request: Request):
    return await proxy_json_or_form(request, PREDICTION_SERVICE_URL, "/predict")


@app.get("/predict/status")
async def predict_status(request: Request):
    return await proxy_json_or_form(request, PREDICTION_SERVICE_URL, "/predict/status")


@app.websocket("/ws/{doc_id}")
async def websocket_proxy(websocket: WebSocket, doc_id: str, token: str):
    await websocket.accept()
    downstream_url = f"{WS_SERVICE_URL}/ws/{doc_id}?token={token}"

    async with websockets.connect(downstream_url) as downstream:
        async def client_to_service():
            while True:
                message = await websocket.receive_text()
                await downstream.send(message)

        async def service_to_client():
            async for message in downstream:
                await websocket.send_text(message)

        tasks = [
            asyncio.create_task(client_to_service()),
            asyncio.create_task(service_to_client()),
        ]

        try:
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc:
                    raise exc
        except WebSocketDisconnect:
            pass
