# Low Level Flow Diagrams - Your Docs

Ye document Your Docs project ke low-level flows ko diagram form me explain karta hai. Diagrams Mermaid syntax me hain, isliye GitHub/Markdown viewers me render ho sakte hain.

## 0. Ready Image Version

![Your Docs Low Level Flow Diagram](/C:/Your%20Docs/backend/diagrams/low_level_flow.svg)

Image file:

- [backend/diagrams/low_level_flow.svg](/C:/Your%20Docs/backend/diagrams/low_level_flow.svg:1)

## 1. Complete System Flow

```mermaid
flowchart TD
    U["User / Browser"] --> FE["React Frontend<br/>docs-react"]

    FE --> AX["Axios API Client<br/>Authorization Header"]
    FE --> WSCLIENT["Browser WebSocket Client"]
    FE --> EDITOR["Lexical Block Editor"]

    AX --> GW["Gateway Service<br/>FastAPI :8000"]
    WSCLIENT --> GWWS["Gateway WebSocket Endpoint<br/>/ws/{doc_id}"]

    GW --> AUTH["Auth Service"]
    GW --> DOCS["Docs Service"]
    GW --> PRED["Prediction Service"]
    GWWS --> WSSVC["WebSocket Service"]

    AUTH --> DB[("PostgreSQL Database")]
    DOCS --> DB
    WSSVC --> DB

    PRED --> OR["OpenRouter API<br/>External AI Model"]

    EDITOR --> AX
    EDITOR --> WSCLIENT
    EDITOR --> PREDREQ["Prediction Request<br/>/predict?text=..."]
    PREDREQ --> GW
```

## 2. Login Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as React Login Page
    participant API as Axios Client
    participant GW as Gateway Service
    participant AUTH as Auth Service
    participant DB as PostgreSQL

    User->>FE: Enter email and password
    FE->>API: Submit login form
    API->>GW: POST /login_user
    GW->>AUTH: Proxy form data
    AUTH->>DB: Find user by email
    DB-->>AUTH: User row
    AUTH->>AUTH: Verify hashed password
    AUTH->>DB: Count active sessions
    AUTH->>AUTH: Create JWT token
    AUTH->>DB: Insert UserSession
    AUTH-->>GW: access_token
    GW-->>API: access_token
    API-->>FE: Login success
    FE->>FE: Store token in localStorage
```

## 3. Authenticated API Request Flow

```mermaid
sequenceDiagram
    participant FE as React Frontend
    participant API as Axios Interceptor
    participant GW as Gateway Service
    participant SVC as Internal Service
    participant DEP as Jwt_Token_Checker
    participant DB as PostgreSQL

    FE->>API: Call protected API
    API->>API: Read token from localStorage
    API->>GW: Request with Authorization header
    GW->>SVC: Forward request and auth header
    SVC->>DEP: Validate JWT dependency
    DEP->>DB: Fetch user by token user_id
    DB-->>DEP: User row
    DEP-->>SVC: Authenticated user
    SVC->>DB: Execute business query
    DB-->>SVC: Data
    SVC-->>GW: JSON response
    GW-->>FE: JSON response
```

## 4. Create Document Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Create Docs Page
    participant GW as Gateway Service
    participant DOCS as Docs Service
    participant AUTH as JWT Dependency
    participant DB as PostgreSQL

    User->>FE: Enter title and create document
    FE->>GW: POST /create_docs with JWT
    GW->>DOCS: Proxy request
    DOCS->>AUTH: Validate token
    AUTH->>DB: Fetch User
    DB-->>AUTH: User
    AUTH-->>DOCS: Current user
    DOCS->>DB: Insert Document
    DOCS->>DB: Insert UserDocument role=owner
    DOCS->>DB: Insert initial DocBlock index=0
    DOCS->>DB: Commit transaction
    DOCS-->>GW: Created document
    GW-->>FE: Created document response
```

## 5. Open Document Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as UpdateDocs Page
    participant GW as Gateway Service
    participant DOCS as Docs Service
    participant DB as PostgreSQL
    participant EDITOR as BlockEditor

    User->>FE: Open document URL
    FE->>GW: POST /get_doc/{docs_id}
    GW->>DOCS: Proxy request
    DOCS->>DB: Check UserDocument access
    DOCS->>DB: Fetch Document
    DOCS->>DB: Fetch DocBlocks ordered by block_index
    DOCS-->>GW: title, role, blocks
    GW-->>FE: document payload
    FE->>EDITOR: Pass blocks and title
    EDITOR->>EDITOR: Load Lexical editor state
```

## 6. Save Document Flow

```mermaid
sequenceDiagram
    actor User
    participant EDITOR as Lexical BlockEditor
    participant FE as UpdateDocs Page
    participant GW as Gateway Service
    participant DOCS as Docs Service
    participant DB as PostgreSQL

    User->>EDITOR: Edit rich text
    EDITOR->>EDITOR: Serialize Lexical state as JSON
    EDITOR->>FE: Update blocks state
    User->>FE: Click Save
    FE->>GW: PUT /update_docs/{docs_id}
    GW->>DOCS: Proxy title and content
    DOCS->>DB: Verify document access
    DOCS->>DB: Update Document title/content
    DOCS->>DB: Split content into DocBlocks
    DOCS->>DB: Update/create/delete blocks
    DOCS->>DB: Commit
    DOCS-->>GW: Updated document
    GW-->>FE: Save success
```

## 7. Live Collaboration Flow

```mermaid
sequenceDiagram
    actor UserA as User A
    actor UserB as User B
    participant FE_A as Frontend A
    participant FE_B as Frontend B
    participant GW as Gateway WS Proxy
    participant WS as WebSocket Service
    participant DB as PostgreSQL

    UserA->>FE_A: Start live session
    FE_A->>GW: WS /ws/{doc_id}?token=jwt
    GW->>WS: Connect downstream WS
    WS->>DB: Verify token and user
    WS->>DB: join_doc
    WS->>DB: get_or_create_session
    WS->>DB: add_participant
    WS-->>FE_A: INIT_BLOCKS

    UserB->>FE_B: Join same document
    FE_B->>GW: WS /ws/{doc_id}?token=jwt
    GW->>WS: Connect downstream WS
    WS->>DB: Verify token and user
    WS->>DB: join_doc
    WS->>DB: add_participant
    WS-->>FE_B: INIT_BLOCKS

    UserA->>FE_A: Type in editor
    FE_A->>GW: BLOCK_UPDATE
    GW->>WS: Forward BLOCK_UPDATE
    WS->>DB: update_single_block
    WS-->>GW: Broadcast to other clients
    GW-->>FE_B: BLOCK_UPDATE
    FE_B->>FE_B: Apply latest editor state
```

## 8. WebSocket Message Handling Flow

```mermaid
flowchart TD
    START["WebSocket connects<br/>/ws/{doc_id}?token=..."] --> ACCEPT["Accept socket"]
    ACCEPT --> VERIFY["verify_user_token"]
    VERIFY -->|invalid| CLOSE401["Close 4401<br/>Invalid token"]
    VERIFY -->|valid| JOIN["join_doc"]
    JOIN --> SESSION["get_or_create_session"]
    SESSION --> PARTICIPANT["add_participant"]
    PARTICIPANT --> ROOM["ConnectionManager.connect"]
    ROOM --> INIT["Send INIT_BLOCKS"]
    INIT --> LOOP["Receive message loop"]

    LOOP --> TYPE{"Message type?"}
    TYPE -->|BLOCK_UPDATE| UPDATE["update_single_block"]
    UPDATE --> BROADCAST["broadcast to room<br/>excluding sender"]
    BROADCAST --> LOOP

    TYPE -->|END_SESSION| END["end_session"]
    END --> CLOSEALL["Close all room sockets"]

    TYPE -->|Other message| RAW["broadcast raw message"]
    RAW --> LOOP

    LOOP -->|disconnect| DISC["user_disconnect"]
    DISC --> EMPTY["empty_session if no active participant"]
    EMPTY --> REMOVE["ConnectionManager.disconnect"]
```

## 9. Prediction Flow

```mermaid
sequenceDiagram
    actor User
    participant EDITOR as Lexical Editor
    participant SUG as SuggestionPlugin
    participant GW as Gateway Service
    participant PRED as Prediction Service
    participant AI as OpenRouter API

    User->>EDITOR: Types text
    EDITOR->>SUG: Editor state update
    SUG->>SUG: Extract last words
    SUG->>SUG: Debounce request
    SUG->>GW: GET /predict?text=context
    GW->>PRED: Proxy request
    PRED->>PRED: Clean text
    PRED->>AI: POST /chat/completions
    AI-->>PRED: Model response
    PRED->>PRED: Normalize first word
    PRED-->>GW: {status, word}
    GW-->>SUG: prediction response
    SUG->>EDITOR: Show suggestion overlay
    User->>EDITOR: Press Tab
    EDITOR->>EDITOR: Insert suggested word
```

## 10. Prediction Fallback Flow

```mermaid
flowchart TD
    REQ["GET /predict?text=..."] --> CLEAN["Clean input text"]
    CLEAN --> EMPTY{"Text empty?"}
    EMPTY -->|yes| BLANK["Return empty word"]
    EMPTY -->|no| KEY{"API key configured?"}

    KEY -->|no| FALLBACK1["Use fallback suffix map"]
    FALLBACK1 --> DEGRADED["Return status=degraded"]

    KEY -->|yes| PROVIDER{"Provider openrouter?"}
    PROVIDER -->|no| FALLBACK2["Use fallback suffix map"]
    FALLBACK2 --> ERROR_PROVIDER["Return status=error"]

    PROVIDER -->|yes| CALL["Call OpenRouter chat completions"]
    CALL --> OK{"API success?"}
    OK -->|yes| NORMALIZE["Normalize one word"]
    NORMALIZE --> WORD{"Usable word?"}
    WORD -->|yes| READY["Return status=ready, word"]
    WORD -->|no| FALLBACK3["Use fallback suffix map"]
    FALLBACK3 --> ERROR_EMPTY["Return status=error"]

    OK -->|no| FALLBACK4["Use fallback suffix map"]
    FALLBACK4 --> ERROR_API["Return status=error"]
```

## 11. Database Relationship Diagram

```mermaid
erDiagram
    User_Table {
        UUID id PK
        String name
        Enum gender
        String email
        Integer age
        String address
        String password
    }

    User_Session_Table {
        UUID id PK
        UUID user_id FK
        String token
        DateTime expire
    }

    Docs_table {
        UUID id PK
        String title
        String content
        UUID created_by FK
    }

    Doc_Blocks {
        UUID id PK
        UUID doc_id FK
        Integer block_index
        Text content
    }

    User_Docs {
        UUID id PK
        UUID user_id FK
        UUID doc_id FK
        Boolean is_deleted
        String role
    }

    Collab_Session_Table {
        UUID id PK
        UUID doc_id FK
        String token
        UUID created_by FK
        DateTime created_at
        DateTime ended_at
    }

    Session_Participants_Table {
        UUID id PK
        UUID session_id FK
        UUID user_id FK
        DateTime connected_at
        DateTime disconnected_at
    }

    User_Table ||--o{ User_Session_Table : has
    User_Table ||--o{ Docs_table : creates
    User_Table ||--o{ User_Docs : maps
    Docs_table ||--o{ User_Docs : shared_with
    Docs_table ||--o{ Doc_Blocks : contains
    Docs_table ||--o{ Collab_Session_Table : has
    User_Table ||--o{ Collab_Session_Table : starts
    Collab_Session_Table ||--o{ Session_Participants_Table : includes
    User_Table ||--o{ Session_Participants_Table : participates
```

## 12. Deployment Flow

```mermaid
flowchart TD
    DEV["Developer pushes code"] --> GIT["Git Repository"]
    GIT --> JENKINS["Jenkins Pipeline"]

    JENKINS --> CHECKOUT["Checkout"]
    CHECKOUT --> ENV["Prepare .env.aws<br/>from Jenkins credentials"]
    ENV --> VALIDATE["Validate Docker Compose"]
    VALIDATE --> BUILD["Build backend images"]
    BUILD --> SSH["SSH to AWS EC2"]
    SSH --> SYNC["rsync backend files"]
    SYNC --> COPYENV["Copy .env.aws"]
    COPYENV --> COMPOSE["docker compose up -d --build"]
    COMPOSE --> HEALTH["Poll /health endpoint"]

    HEALTH --> NGINX["Nginx Reverse Proxy"]
    NGINX --> GATEWAY["Gateway Container"]
    GATEWAY --> SERVICES["Internal Service Containers"]
```

## 13. Runtime Container Flow

```mermaid
flowchart LR
    INTERNET["Internet / Browser"] --> NGINX["Nginx<br/>80/443"]
    NGINX --> GATEWAY["gateway-service<br/>8000"]

    subgraph Docker_Network["Docker Network"]
        GATEWAY --> AUTH["auth-service:8000"]
        GATEWAY --> DOCS["docs-service:8000"]
        GATEWAY --> WS["websocket-service:8000"]
        GATEWAY --> PRED["prediction-service:8000"]
        AUTH --> DB[("PostgreSQL")]
        DOCS --> DB
        WS --> DB
    end

    PRED --> EXT["External OpenRouter API"]
```

## 14. Low Level Component Dependency Flow

```mermaid
flowchart TD
    ROUTES["FastAPI Route Handlers"] --> SCHEMAS["Pydantic Schemas"]
    ROUTES --> DEPS["Dependencies<br/>Jwt_Token_Checker / get_db"]
    ROUTES --> SERVICE["Service Layer Functions"]

    DEPS --> JWT["JWT Utility"]
    DEPS --> DBSESSION["SQLAlchemy Session"]

    SERVICE --> MODELS["SQLAlchemy Models"]
    SERVICE --> DBSESSION

    MODELS --> BASE["Database Base"]
    DBSESSION --> ENGINE["SQLAlchemy Engine"]
    ENGINE --> POSTGRES[("PostgreSQL")]
```

## 15. Summary

Low-level flow ke hisaab se project ka main runtime control center `gateway-service` hai. Frontend sirf gateway ko call karta hai, gateway request ko auth/docs/prediction/websocket services tak forward karta hai, aur database operations service layer ke through SQLAlchemy models par execute hote hain.

Live collaboration WebSocket service ke in-memory room manager par based hai, prediction external OpenRouter API par based hai, aur deployment Docker Compose plus Jenkins automation ke through manage hota hai.
