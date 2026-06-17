# Low Level Design (LLD) - Your Docs

## 1. Purpose

Ye LLD document Your Docs project ke low-level technical design ko explain karta hai. Iska focus hai ki system ke modules, services, APIs, database models, functions, request flows, WebSocket messages, prediction logic, aur deployment components internally kaise kaam karte hain.

Project ek collaborative document editor hai jisme:

- user authentication
- document management
- live collaboration
- next-word prediction
- Dockerized backend deployment
- gateway-based microservice routing

implemented hai.

## 2. Technology Stack

### Frontend

- React
- React Router
- Axios
- Lexical editor
- WebSocket browser API

### Backend

- Python
- FastAPI
- SQLAlchemy
- Pydantic
- python-jose JWT
- passlib/bcrypt style password hashing
- httpx for internal HTTP proxying and external API calls
- websockets package for gateway WebSocket proxying

### Database

- PostgreSQL-compatible relational database
- SQLAlchemy ORM models

### Deployment

- Docker
- Docker Compose
- AWS EC2 deployment path
- Render deployment path
- Nginx reverse proxy design
- Jenkins CI/CD pipeline

## 3. Architectural Style

Project me **microservice-style architecture with API Gateway pattern** use hoti hai.

Backend services:

- `gateway-service`
- `auth-service`
- `docs-service`
- `websocket-service`
- `prediction-service`

Important design note:

Ye services separately deployable containers ki tarah defined hain, lekin common `Database`, `Models`, `Schemas`, aur `Utils` modules share karti hain. Isliye practical term me ye **shared-code microservice architecture** hai.

## 4. Folder-Level Design

```text
backend/
  Database/
    DataBase.py
  Models/
    User_Model.py
    User_Session.py
    Docs_Model.py
    Block_Model.py
    User_Document.py
    Collabration_Model.py
    Participating_Model.py
  Schemas/
    User_Schema.py
    Docs_Schema.py
  Utils/
    dependency.py
    hashing.py
    jwt.py
  microservices/
    gateway-service/
    auth-service/
    docs-service/
    websocket-service/
    prediction-service/
  docker-compose.yml
  docker-compose.aws.yml
  Jenkinsfile

docs-react/
  src/
    Auth/
      axios.js
    pages/
      updatedocs.js
      BlockEditor.jsx
    config.js
```

## 5. Backend Service Design

## 5.1 Gateway Service

Location:

- `backend/microservices/gateway-service/main.py`

### Responsibility

Gateway service public backend entrypoint hai. Ye frontend se aane wale requests ko receive karta hai aur internal service ko forward karta hai.

### Key Configuration

Gateway service env variables se internal services locate karta hai:

- `AUTH_SERVICE_HOSTPORT`
- `DOCS_SERVICE_HOSTPORT`
- `WS_SERVICE_HOSTPORT`
- `PREDICTION_SERVICE_HOSTPORT`
- `FRONTEND_URL`
- `CORS_ORIGINS`

### Main Functions

`normalize_service_url(raw_url, scheme)`

- raw host/URL ko valid HTTP ya WebSocket URL me convert karta hai
- `host:port` ko `http://host:port` ya `ws://host:port` banata hai
- `https` ko WebSocket case me `wss` me convert karta hai

`service_url(prefix, default_url, scheme)`

- env variable se service URL resolve karta hai
- pehle `{PREFIX}_HOSTPORT`
- phir `{PREFIX}_URL`
- phir default URL

`get_allowed_origins()`

- CORS origins env se parse karta hai
- `FRONTEND_URL` ko allowed list me add karta hai

`proxy_json_or_form(...)`

- incoming request ka method, query params, authorization header aur body read karta hai
- target internal service endpoint ko HTTP request bhejta hai
- response ko frontend ke liye return karta hai

### Gateway Routes

| Public Endpoint | Internal Target | Purpose |
| --- | --- | --- |
| `GET /health` | gateway local | health check |
| `POST /create_user` | auth-service | signup |
| `POST /login_user` | auth-service | login |
| `POST /logout` | auth-service | logout |
| `POST /create_docs` | docs-service | create document |
| `POST /get_doc/{docs_id}` | docs-service | fetch document |
| `POST /user_docs` | docs-service | list user docs |
| `PUT /update_docs/{docs_id}` | docs-service | update document |
| `DELETE /delete_docs/{docs_id}` | docs-service | delete document |
| `POST /join_docs/{doc_id}` | docs-service | join shared doc |
| `GET /predict` | prediction-service | next-word prediction |
| `GET /predict/status` | prediction-service | prediction status |
| `WS /ws/{doc_id}` | websocket-service | live collaboration |

### WebSocket Proxy Logic

Gateway WebSocket flow:

1. Frontend connects to `/ws/{doc_id}?token=...`.
2. Gateway accepts frontend socket.
3. Gateway opens downstream socket to websocket-service.
4. `client_to_service()` frontend messages downstream bhejta hai.
5. `service_to_client()` downstream messages frontend ko bhejta hai.
6. Agar downstream unavailable ho to gateway error payload send karke socket close karta hai.

## 5.2 Auth Service

Location:

- `backend/microservices/auth-service/main.py`
- `backend/microservices/auth-service/service.py`

### Responsibility

Auth service user identity and session management handle karta hai.

### Routes

| Endpoint | Method | Auth Required | Purpose |
| --- | --- | --- | --- |
| `/health` | GET | No | health check |
| `/create_user` | POST | No | new user create |
| `/login_user` | POST | No | login and token issue |
| `/logout` | POST | Yes | active session remove |
| `/verify_user` | GET | Yes | token verify and user return |

### Data Contracts

`User_SignUp`

- `name`
- `gender`
- `email`
- `age`
- `address`
- `password`

Validation:

- email domain only `gmail.com` or `yahoo.com`
- age must be greater than 0
- gender must be `male`, `female`, or `other`

### Core Functions

`create_user(data, db)`

Logic:

1. email duplicate check
2. password hash
3. `User` record create
4. DB commit
5. created user return

Failure:

- duplicate user par HTTP 401

`login_user(form_data, db)`

Logic:

1. email se user find
2. password verify
3. active sessions count check
4. max 3 active sessions allow
5. JWT token create
6. `UserSession` record create with 30 minute expiry
7. token return

Failure:

- user missing par HTTP 404
- password mismatch par HTTP 402
- more than 3 active sessions par HTTP 401

`logout(token, db)`

Logic:

1. token ke basis par session delete
2. DB commit
3. success message return

## 5.3 Docs Service

Location:

- `backend/microservices/docs-service/main.py`
- `backend/microservices/docs-service/service.py`

### Responsibility

Docs service document lifecycle and access control manage karta hai.

### Routes

| Endpoint | Method | Auth Required | Purpose |
| --- | --- | --- | --- |
| `/health` | GET | No | health check |
| `/create_docs` | POST | Yes | document create |
| `/user_docs` | POST | Yes | logged-in user docs |
| `/get_doc/{docs_id}` | POST | Yes | one document read |
| `/update_docs/{docs_id}` | PUT | Yes | title/content update |
| `/delete_docs/{docs_id}` | DELETE | Yes | soft delete |
| `/join_docs/{doc_id}` | POST | Yes | join shared document |

### Data Contracts

`Create_Docs`

- `title`
- `content`

Current implementation creates document with empty content and an initial empty block.

`Update_Docs`

- optional `title`
- optional `content`

### Core Functions

`creating_docs(data, db, user)`

Logic:

1. `Document` create with title and created_by user
2. `UserDocument` mapping create with role `owner`
3. first `DocBlock` create with block_index `0`
4. commit and return document

`view_docs(docs_id, db, user)`

Logic:

1. access check via `UserDocument`
2. document fetch
3. ordered blocks fetch
4. response returns document id, title, role, and blocks

`docs(db, user)`

Logic:

1. `Document` and `UserDocument` join
2. filter current user's non-deleted documents
3. return list of docs

`update_docs(docs_id, user, db, data)`

Logic:

1. access check
2. document existence check
3. title update if present
4. content update if present
5. content split into blocks using `LINES_PER_BLOCK = 5`
6. existing blocks update
7. extra blocks create/delete as needed
8. commit and return updated document

`delete_docs(docs_id, user, db)`

Logic:

1. document fetch
2. verify owner role
3. mark all active `UserDocument` rows for doc as deleted
4. commit

`join_doc(docs_id, user, db)`

Logic:

1. check whether user already has active mapping
2. if deleted non-owner mapping exists, reactivate it
3. otherwise create new `UserDocument` role `editor`
4. commit and return mapping

## 5.4 WebSocket Service

Location:

- `backend/microservices/websocket-service/main.py`
- `backend/microservices/websocket-service/service.py`

### Responsibility

WebSocket service live collaboration session manage karta hai.

### ConnectionManager

```python
class ConnectionManager:
    room: dict
```

Internal structure:

```text
room = {
  doc_id: [websocket1, websocket2, ...]
}
```

Methods:

- `connect(doc_id, websocket)`
- `disconnect(doc_id, websocket)`
- `broadcast(doc_id, message, exclude=None)`

### WebSocket Endpoint

Endpoint:

```text
/ws/{doc_id}?token=<jwt>
```

Connection flow:

1. DB session open
2. socket accept
3. JWT token verify
4. user joins doc
5. collaboration session create or reuse
6. participant record create
7. connection added to room
8. initial blocks sent as `INIT_BLOCKS`
9. incoming messages processed in loop

### Supported Message Types

`INIT_BLOCKS`

Server to client message.

```json
{
  "type": "INIT_BLOCKS",
  "blocks": []
}
```

`BLOCK_UPDATE`

Client to server and server to other clients.

```json
{
  "type": "BLOCK_UPDATE",
  "block_id": "uuid",
  "content": "serialized editor content"
}
```

`END_SESSION`

Client to server.

```json
{
  "type": "END_SESSION"
}
```

### WebSocket Service Functions

`get_doc_blocks(docs_id, db)`

- doc blocks fetch karta hai
- block_index ke order me return karta hai

`update_single_block(block_id, content, db)`

- single block content update karta hai
- DB commit karta hai

`get_or_create_session(docs_id, user_id, db)`

- active session find karta hai
- agar nahi mile to new `CollaborationSession` create karta hai

`add_participant(session_id, user_id, db)`

- `SessionParticipant` row create karta hai

`user_disconnect(participant_id, db)`

- participant disconnected_at set karta hai

`empty_session(session_id, db)`

- active participants count check karta hai
- agar zero ho to session ended_at set karta hai

`end_session(session_id, db)`

- session close karta hai
- active participants disconnect mark karta hai

## 5.5 Prediction Service

Location:

- `backend/microservices/prediction-service/main.py`
- `backend/microservices/prediction-service/service.py`

### Responsibility

Prediction service editor ke current text ke basis par next likely word return karta hai.

### Routes

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | service health |
| `/predict/status` | GET | provider/model status |
| `/predict?text=...` | GET | next-word prediction |

### PredictionService Class

Fields:

- `provider`
- `api_key`
- `model`
- `base_url`
- `_last_error`

Default values:

- provider: `openrouter`
- model: `qwen/qwen3-next-80b-a3b-instruct:free`
- base_url: `https://openrouter.ai/api/v1`

### Core Methods

`start_background_loading()`

- current external API mode me no-op
- local ML warmup required nahi hai

`status_payload()`

Returns:

- status `ready` if API key configured
- status `degraded` if API key missing
- provider, model, configured flag, last error

`_clean_text(text)`

- lowercase
- non-alphanumeric punctuation remove
- spaces normalize

`_fallback_word(text)`

- simple suffix map based fallback
- example: `thank` -> `you`

`_normalize_word(raw_text)`

- model response clean karta hai
- first usable word return karta hai

`_predict_with_openrouter(text)`

Logic:

1. API key check
2. OpenRouter chat completion payload create
3. system prompt model ko one lowercase word return karne ko bolta hai
4. HTTP POST to `/chat/completions`
5. response parse
6. one word normalize
7. return `{status, word}`

`predict_next_word(text)`

Logic:

1. text clean
2. empty text par empty word return
3. provider `openrouter` ho to external API call
4. unsupported provider par fallback

### Legacy Model Note

Prediction service folder me LSTM model files present hain:

- `lstm_model.h5`
- `lstm_model.keras`
- tokenizer files

Current code in files ko runtime me load nahi karta. Current implementation external API based hai.

## 6. Database Low Level Design

## 6.1 Database Connection

Location:

- `backend/Database/DataBase.py`

Design:

- `.env` load hota hai
- `SQL_DATABASE_URL` read hota hai
- SQLAlchemy engine create hota hai with `pool_pre_ping=True`
- `SessionLocal` request-level DB sessions create karta hai
- `get_db()` dependency session lifecycle manage karti hai

## 6.2 Tables and Fields

### User_Table

Model:

- `User`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `name` | String | indexed |
| `gender` | Enum | male/female/other |
| `email` | String | unique, indexed |
| `age` | Integer | indexed |
| `address` | String | required |
| `password` | String | hashed password |

### User_Session_Table

Model:

- `UserSession`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `user_id` | UUID | FK to User_Table |
| `token` | String | JWT token |
| `expire` | DateTime | session expiry |

### Docs_table

Model:

- `Document`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `title` | String | document title |
| `content` | String | document content |
| `created_by` | UUID | FK to User_Table |

### Doc_Blocks

Model:

- `DocBlock`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `doc_id` | UUID | FK to Docs_table |
| `block_index` | Integer | order |
| `content` | Text | block content / Lexical JSON |

### User_Docs

Model:

- `UserDocument`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `user_id` | UUID | FK to User_Table |
| `doc_id` | UUID | FK to Docs_table |
| `is_deleted` | Boolean | soft delete/access flag |
| `role` | String | owner/editor/viewer |

### Collab_Session_Table

Model:

- `CollaborationSession`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `doc_id` | UUID | FK to Docs_table |
| `token` | String | unique session token |
| `created_by` | UUID | FK to User_Table |
| `created_at` | DateTime | default UTC now |
| `ended_at` | DateTime | nullable |

### Session_Participants_Table

Model:

- `SessionParticipant`

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | primary key |
| `session_id` | UUID | FK to Collab_Session_Table |
| `user_id` | UUID | FK to User_Table |
| `connected_at` | DateTime | default UTC now |
| `disconnected_at` | DateTime | nullable |

## 7. Frontend Low Level Design

## 7.1 API Client

Location:

- `docs-react/src/Auth/axios.js`

Design:

- `getApiBaseUrl()` se base URL resolve hota hai
- Axios instance create hota hai
- request interceptor `localStorage` se token read karta hai
- token present ho to `Authorization: Bearer <token>` header add hota hai

## 7.2 Runtime Config

Location:

- `docs-react/src/config.js`

Functions:

`getApiBaseUrl()`

- `REACT_APP_API_URL` read karta hai
- fallback `http://127.0.0.1:8000`

`getWsBaseUrl()`

- explicit `REACT_APP_WS_URL` use karta hai if present
- otherwise API URL se WebSocket URL derive karta hai

`getDocWsUrl(docId, token)`

- final WebSocket URL create karta hai:

```text
<wsBase>/ws/<docId>?token=<encodedToken>
```

## 7.3 UpdateDocs Page

Location:

- `docs-react/src/pages/updatedocs.js`

Responsibilities:

- document fetch
- title state manage
- block state manage
- live WebSocket session start/end
- reconnect handling
- save/update
- delete if owner

Important state:

- `title`
- `blocks`
- `role`
- `connected`
- `showCode`
- `error`
- `saved`
- `loading`

Important refs:

- `wsRef`: active socket
- `liveRef`: incoming live update queue
- `blocksRef`: latest blocks snapshot
- `reconnectAttemptsRef`: reconnect count
- `manualCloseRef`: user-triggered close tracking
- `loadedRef`: avoid reloading initial content repeatedly

## 7.4 BlockEditor Component

Location:

- `docs-react/src/pages/BlockEditor.jsx`

Responsibilities:

- Lexical editor initialize
- editor content load
- rich text toolbar
- editor state serialize
- block updates send over WebSocket
- remote updates apply
- next-word prediction suggestion show

### Internal Plugins

`LoadPlugin`

- initial saved content editor me load karta hai
- `loadedRef` use karta hai taaki repeated reload na ho

`LiveUpdatePlugin`

- `liveRef.current` queue drain karta hai
- latest update apply karta hai
- last-write-wins behavior use hota hai

`SuggestionPlugin`

- editor text se recent words extract karta hai
- `/predict` API call karta hai
- stale responses guard karta hai using request id
- suggestion show karta hai
- Tab key par word insert karta hai

`Toolbar`

- bold, italic, underline, strikethrough
- heading, quote, code, paragraph block commands

### Editor Change Flow

1. user types
2. Lexical editor state changes
3. `OnChangePlugin` `handleChange()` call karta hai
4. debounce after 250ms
5. editor state JSON stringify hoti hai
6. first block content update hota hai
7. if WebSocket open, `BLOCK_UPDATE` message send hota hai
8. parent state update hota hai

## 8. API Contract Summary

### Auth APIs

`POST /create_user`

Request:

```json
{
  "name": "User Name",
  "gender": "male",
  "email": "user@gmail.com",
  "age": 21,
  "address": "Address",
  "password": "password"
}
```

Response:

```json
{
  "id": "uuid",
  "name": "User Name",
  "email": "user@gmail.com"
}
```

`POST /login_user`

Request:

```text
application/x-www-form-urlencoded
username=user@gmail.com
password=password
```

Response:

```json
{
  "access_token": "jwt",
  "token_type": "bearer"
}
```

### Docs APIs

`POST /create_docs`

Request:

```json
{
  "title": "Document Title",
  "content": ""
}
```

`POST /get_doc/{docs_id}`

Response:

```json
{
  "id": "doc_uuid",
  "title": "Document Title",
  "role": "owner",
  "blocks": [
    {
      "id": "block_uuid",
      "index": 0,
      "content": "serialized_content"
    }
  ]
}
```

`PUT /update_docs/{docs_id}`

Request:

```json
{
  "title": "Updated Title",
  "content": "serialized_content"
}
```

### Prediction APIs

`GET /predict?text=<context>`

Response:

```json
{
  "status": "ready",
  "word": "next"
}
```

`GET /predict/status`

Response:

```json
{
  "status": "ready",
  "provider": "openrouter",
  "model": "qwen/qwen3-next-80b-a3b-instruct:free",
  "configured": true,
  "error": null
}
```

## 9. Sequence Designs

## 9.1 Login Sequence

```text
User
  -> Frontend Login Page
  -> Axios POST /login_user
  -> Gateway Service
  -> Auth Service
  -> Database User_Table lookup
  -> Password verification
  -> User_Session_Table insert
  -> JWT returned
  -> Frontend stores token in localStorage
```

## 9.2 Create Document Sequence

```text
User
  -> Frontend Create Docs Page
  -> POST /create_docs with token
  -> Gateway Service
  -> Docs Service
  -> Jwt_Token_Checker
  -> Document insert
  -> UserDocument owner insert
  -> DocBlock initial block insert
  -> Response returned
```

## 9.3 Live Collaboration Sequence

```text
User opens document
  -> Frontend fetches /get_doc/{id}
  -> User starts live session
  -> Frontend opens WebSocket /ws/{doc_id}?token=...
  -> Gateway opens downstream WebSocket to websocket-service
  -> WebSocket service verifies token
  -> join_doc
  -> get_or_create_session
  -> add_participant
  -> INIT_BLOCKS sent
  -> User edits text
  -> BLOCK_UPDATE sent
  -> update_single_block
  -> broadcast to other users
```

## 9.4 Prediction Sequence

```text
User types in editor
  -> SuggestionPlugin extracts last words
  -> debounce
  -> GET /predict?text=...
  -> Gateway
  -> Prediction Service
  -> OpenRouter API call
  -> one word response
  -> frontend overlay displays suggestion
  -> user presses Tab
  -> suggestion inserted in editor
```

## 10. Error Handling Design

### Gateway

- internal HTTP failure par 502 response
- response body me service name, target URL, aur error detail
- WebSocket downstream failure par error message then close code 1011

### Auth Service

- duplicate user: 401
- missing user: 404
- wrong password: 402
- too many sessions: 401

### Docs Service

- no access: 403/404 depending flow
- missing document: 404
- only owner delete: 403

### WebSocket Service

- invalid token: close code 4401
- session bootstrap failure: close code 1011
- session ended by host: normal close code 1000

### Prediction Service

- missing API key: degraded fallback
- external API error: error status with fallback word
- unsupported provider: error status with fallback word

## 11. Security Design

### Authentication

- JWT token based authentication
- token passed in `Authorization` header for HTTP APIs
- token passed as query param for WebSocket connection

### Password Security

- password stored as hash
- raw password not stored

### Authorization

- docs access is checked using `UserDocument`
- owner role required for delete
- editor role allowed for joined docs

### CORS

- gateway and docs service use env-driven CORS origins
- frontend URL included through `FRONTEND_URL`

### Secrets

Expected secrets:

- `SECRET_KEY`
- `SQL_DATABASE_URL`
- `PREDICTION_API_KEY`
- database credentials

These should be supplied through environment variables or CI/CD credentials.

## 12. Deployment Low Level Design

## 12.1 Docker Compose Services

AWS compose defines:

- `postgres`
- `gateway-service`
- `auth-service`
- `docs-service`
- `websocket-service`
- `prediction-service`

Gateway exposes:

```text
8000:8000
```

Internal services use Docker networking and are referenced by service names:

- `auth-service:8000`
- `docs-service:8000`
- `websocket-service:8000`
- `prediction-service:8000`

## 12.2 Nginx Layer

Nginx intended role:

- public traffic receive
- SSL termination
- proxy HTTP to gateway
- proxy WebSocket upgrade to gateway

Expected public flow:

```text
Browser -> Nginx :443 -> Gateway :8000 -> Internal services
```

Repo note:

Concrete Nginx config file is not currently tracked in the repository.

## 12.3 Jenkins Pipeline

Pipeline stages:

- Checkout
- Prepare AWS Env or Render Env
- Validate Compose
- Build Backend Images
- Deploy To Render or AWS EC2
- Health Check

AWS deploy low-level flow:

1. create `.env.aws`
2. validate compose
3. build images
4. SSH to EC2
5. create remote app directory
6. `rsync` backend files
7. copy `.env.aws`
8. run remote Docker Compose
9. poll public health endpoint

## 13. Important Design Constraints

### Collaboration Constraint

Current live editing is not CRDT/OT based. It uses full serialized editor state per block and last-write-wins update behavior.

Impact:

- simple and understandable
- works for low/moderate collaboration
- simultaneous heavy edits can overwrite each other

### Scaling Constraint

WebSocket rooms are stored in memory.

Impact:

- single instance works cleanly
- multiple websocket-service replicas need shared pub/sub layer like Redis

### Prediction Constraint

Prediction depends on external OpenRouter API.

Impact:

- low local compute requirement
- API key required
- network/provider availability matters

### Database Constraint

Database URL is environment-driven.

Impact:

- can use local Docker Postgres
- can use external hosted PostgreSQL
- deployment team must keep one clear production source of truth

## 14. Future Improvements

Recommended technical improvements:

- add Alembic migrations for DB schema control
- add tracked Nginx config
- move WebSocket fanout to Redis pub/sub for horizontal scaling
- add refresh token/session cleanup job
- add DB indexes for frequently queried document/session fields
- add OpenAPI export for service contracts
- add integration tests for gateway routing
- add automated WebSocket collaboration tests
- decide final production DB strategy and document it

## 15. Conclusion

Your Docs ka low-level design modular and deployment-ready hai. Gateway service public routing handle karta hai, auth service identity manage karta hai, docs service document lifecycle handle karta hai, websocket service live collaboration chalata hai, aur prediction service AI suggestion provide karta hai.

System ka current design learning, portfolio, and small production-style deployment ke liye strong hai. Larger scale ke liye main upgrades WebSocket scaling, DB migrations, stronger conflict handling, and tracked infrastructure configs honge.

## 16. Low Level Flow Diagrams

Detailed low-level flow diagrams are available in:

- [LOW_LEVEL_FLOW_DIAGRAMS.md](/C:/Your%20Docs/backend/LOW_LEVEL_FLOW_DIAGRAMS.md:1)

This linked document includes Mermaid diagrams for:

- complete system flow
- login flow
- authenticated API request flow
- create/open/save document flows
- live collaboration flow
- WebSocket message handling
- prediction and fallback flows
- database relationship diagram
- deployment and runtime container flow
