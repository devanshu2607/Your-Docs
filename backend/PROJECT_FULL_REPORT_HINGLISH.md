# Your Docs Full Project Report (Hinglish)

## 1. Project Overview

Your Docs ek collaborative document editing platform hai jahan user:

- signup/login kar sakta hai
- apne documents create aur manage kar sakta hai
- doosre users ke saath live collaboration kar sakta hai
- editor ke andar next-word prediction use kar sakta hai

Project ka frontend aur backend clearly alag layers me split hai:

- Frontend: `docs-react`
- Backend: `backend`

Backend ko ek single app ki tarah nahi, balki multiple services me design kiya gaya hai.

## 2. Which Architecture Is Used

Is project me **microservice-style architecture with API Gateway pattern** use hua hai.

Iska matlab:

- har backend concern ko alag service me divide kiya gaya hai
- user frontend se directly har service ko hit nahi karta
- sabse pehle request gateway-service tak aati hai
- gateway request ko sahi internal service tak forward karta hai

Ye fully isolated enterprise microservices nahi hain, kyunki services shared repo aur shared Python modules use karti hain. Isliye best practical description ye hai:

**shared-code microservice architecture**

## 3. Main Backend Microservices

Backend me ye services use ho rahi hain:

### 3.1 Gateway Service

Gateway service public entrypoint hai.

Responsibilities:

- incoming API requests receive karna
- auth-service ko auth related requests forward karna
- docs-service ko document related requests forward karna
- prediction-service ko prediction requests forward karna
- websocket requests ko websocket-service tak proxy karna
- CORS policy apply karna

Is architecture ka benefit ye hai ki frontend ko sirf ek backend URL pata hona chahiye.

### 3.2 Auth Service

Auth service user identity handle karta hai.

Responsibilities:

- user signup
- user login
- JWT token generation
- logout
- token validation
- active session tracking

Special behavior:

- login par JWT issue hota hai
- password hashed form me store hota hai
- ek user ko maximum 3 active devices/sessions tak allow kiya gaya hai

### 3.3 Docs Service

Docs service document CRUD aur access control handle karta hai.

Responsibilities:

- new document create karna
- user ke documents list karna
- specific document fetch karna
- document update karna
- document delete karna
- user ko document join karwana

Access control `owner`, `editor`, aur future `viewer` role style mapping se manage hota hai.

### 3.4 WebSocket Service

WebSocket service live collaboration ka core hai.

Responsibilities:

- authenticated live session start karna
- document room maintain karna
- connected users ko broadcast bhejna
- block updates real time sync karna
- session participants track karna

Ye service in-memory room manager use karti hai. Matlab active connections RAM me hold hote hain.

### 3.5 Prediction Service

Prediction service editor ke liye next-word suggestion provide karta hai.

Responsibilities:

- text context receive karna
- next probable word predict karna
- result frontend ko dena

Important current-state clarification:

- repo me old LSTM model files present hain
- lekin current runtime code local TensorFlow inference use nahi kar raha
- current implementation external API based prediction use karti hai
- external provider ke roop me OpenRouter use ho raha hai

## 4. Request Flow End-to-End

Normal API request flow:

1. User frontend par action karta hai.
2. Frontend backend gateway ko request bhejta hai.
3. Gateway route decide karta hai.
4. Internal service request process karti hai.
5. Agar database ki zarurat hai to PostgreSQL-compatible DB access hota hai.
6. Response wapas gateway ke through frontend ko milta hai.

Live collaboration flow:

1. User document open karta hai.
2. Frontend existing document blocks fetch karta hai.
3. User live session start karta hai.
4. Frontend WebSocket open karta hai with token.
5. Gateway request ko websocket-service tak proxy karta hai.
6. Websocket-service token verify karta hai.
7. Session create ya reuse hoti hai.
8. Editor updates broadcast hote hain.

Prediction flow:

1. User editor me type karta hai.
2. Frontend recent phrase extract karta hai.
3. Debounced `/predict` request gateway ko bheji jati hai.
4. Gateway prediction-service ko call karta hai.
5. Prediction-service OpenRouter API ko prompt bhejta hai.
6. Ek cleaned next word response frontend ko milta hai.
7. User Tab press karke suggestion insert kar sakta hai.

## 5. Frontend Architecture

Frontend React based app hai.

Key frontend technologies:

- React
- React Router
- Axios
- Lexical editor
- WebSocket client

Frontend environment-based configuration use karta hai:

- `REACT_APP_API_URL`
- `REACT_APP_WS_URL`

Agar WebSocket URL explicitly set nahi hai, frontend API URL se ws/wss URL derive kar leta hai.

## 6. Rich Text Editing Kaise Work Karta Hai

Editor Lexical par built hai. Isme rich text editing, formatting aur collaboration integration hai.

Important behavior:

- editor state JSON format me maintain hoti hai
- first block ka content main editable rich state carry karta hai
- on change state serialize hoti hai
- live session me block update WebSocket se bheja jata hai
- save ke time backend me persist hota hai

Frontend code me recent fixes ka intent bhi visible hai:

- live updates queue ke through handle ho rahe hain
- stale updates reduce kiye gaye hain
- prediction plugin async-safe pattern use karta hai

## 7. Database Design

Backend SQLAlchemy use karta hai aur `SQL_DATABASE_URL` ke through DB connect karta hai.

Important tables/models:

- `User_Table`
- `User_Session_Table`
- `Docs_table`
- `Doc_Blocks`
- `User_Docs`
- `Collab_Session_Table`
- `Session_Participants_Table`

### 7.1 User_Table

Stores:

- basic user profile
- email
- hashed password
- gender, age, address

### 7.2 User_Session_Table

Stores:

- issued auth tokens
- token expiry
- active login sessions

### 7.3 Docs_table

Stores:

- document id
- title
- document-level content
- creator reference

### 7.4 Doc_Blocks

Stores:

- document blocks
- block order
- block content

Ye live collaboration me important hai, kyunki updates block granularity par handle kiye ja sakte hain.

### 7.5 User_Docs

Stores:

- user-document mapping
- role
- soft-delete style access state

### 7.6 Collab_Session_Table

Stores:

- live collaboration session metadata
- session creator
- start/end tracking

### 7.7 Session_Participants_Table

Stores:

- kaun user kis session me connected tha
- connect/disconnect timestamps

## 8. Authentication and Authorization

Authentication JWT based hai.

Auth process:

1. User login karta hai.
2. Credentials verify hote hain.
3. JWT token issue hota hai.
4. Frontend token localStorage me store karta hai.
5. Axios interceptor har request me token bhejta hai.
6. Backend dependencies token decode aur user verify karti hain.

Authorization process:

- user ko document access hai ya nahi check hota hai
- owner/editor roles ke basis par action decide hota hai

## 9. AWS Ka Use Kaise Ho Raha Hai

Project me AWS primarily backend hosting ke liye plan/document kiya gaya hai.

Recommended shape:

- Frontend on Vercel
- Backend services on AWS EC2
- Nginx as reverse proxy
- Docker Compose for service orchestration

AWS me EC2 backend host machine ka kaam karta hai.

EC2 par expected components:

- Ubuntu Linux
- Docker Engine
- Docker Compose
- backend containers
- Nginx

## 10. Docker and Containerization

Har backend service ka apna Dockerfile hai. Iska benefit:

- same runtime packaging
- deployment consistency
- dependency isolation
- easy rebuild/restart

Current compose patterns:

- `docker-compose.yml` for local or simple environment
- `docker-compose.aws.yml` for AWS-oriented deployment

AWS compose file me:

- gateway public-facing hai
- baaki services internal network me run karti hain
- service healthchecks configured hain
- dependency ordering defined hai

## 11. Nginx Ka Role

Nginx is project me reverse proxy layer ke roop me use/plan kiya gaya hai.

Main responsibilities:

- public traffic receive karna
- HTTP to HTTPS handling
- SSL termination
- gateway container tak traffic proxy karna
- websocket upgrade requests support karna

Typical flow:

User -> Nginx -> Gateway Service -> Internal Microservice

Important clarification:

Repo docs me Nginx ka use explain kiya gaya hai, lekin committed repository me concrete `nginx.conf` file currently present nahi mili. Isliye Nginx architecture ka intended deployment component hai, but its exact tracked server config repo me available nahi hai.

## 12. PostgreSQL and Current Database Reality

Deployment docs me simple EC2 setup ke liye PostgreSQL container mention kiya gaya hai.

Lekin current environment file observation se ek important practical detail milti hai:

- AWS compose file me local postgres service defined hai
- current `.env.aws` `SQL_DATABASE_URL` external hosted PostgreSQL endpoint par point karti hai

Iska matlab current real deployment hybrid ho sakta hai:

- application services containerized
- database managed external service par

Ye local-DB-on-EC2 se better ho sakta hai, kyunki DB lifecycle app machine se decouple ho jata hai.

## 13. Prediction Model Detail

Prediction feature ko samajhne ke liye current aur legacy dono samajhna zaruri hai.

### 13.1 Legacy Evidence

Prediction service folder me old files present hain:

- `lstm_model.h5`
- `lstm_model.keras`
- tokenizer pickle files

Ye indicate karta hai ki kisi stage par local LSTM/TensorFlow based next-word prediction attempt ya implementation rahi hogi.

### 13.2 Current Runtime

Current code me:

- provider env variable driven hai
- default provider `openrouter` hai
- model name env var se aata hai
- service external API ko prompt bhejti hai
- response me single word expect kiya jata hai

### 13.3 Fallback Strategy

Agar API key missing ho, unsupported provider ho, ya remote call fail ho:

- service degrade mode me ja sakti hai
- heuristic fallback word return karti hai

Iska matlab feature hard-fail nahi karta, basic degraded behavior maintain karta hai.

## 14. WebSocket Collaboration Model

Live collaboration fully CRDT ya OT based nahi lagti. Current code full-state/block-update broadcast model follow karta hai.

System behavior:

- session create hoti hai
- participants record hote hain
- block update aata hai
- DB me single block content update hota hai
- same update others ko broadcast hota hai

Ye simple aur functional hai, lekin large-scale concurrent editing ke liye future me stronger conflict resolution approach ki zarurat ho sakti hai.

## 15. DevOps and CI/CD

Jenkins pipeline repo me present hai.

Pipeline responsibilities:

- source checkout
- environment file generation
- compose validation
- Docker image build
- AWS ya Render deployment
- post-deploy health check

AWS deploy flow:

1. Jenkins code checkout karta hai
2. `.env.aws` generate hoti hai
3. compose validate hota hai
4. images build hoti hain
5. SSH via EC2 connect hota hai
6. `rsync` se backend sync hota hai
7. remote server par `docker compose up -d --build` run hota hai
8. health endpoint verify hota hai

## 16. Security Aspects

Good parts:

- JWT auth use hua hai
- password hashing hai
- secrets environment variables me rakhne ka design hai
- internal services ko gateway ke peeche hide kiya ja sakta hai

Risks:

- secret files ko repo me commit nahi hona chahiye
- WebSocket state in-memory hone ki wajah se horizontal scale hard hai
- external prediction provider dependency availability aur cost introduce karti hai

## 17. Strengths of the Current Design

- clear backend responsibility split
- single gateway entrypoint
- frontend/backend decoupled deployment
- real-time collaboration support
- AI prediction isolated service me
- Dockerized infrastructure
- AWS-ready deployment pattern
- Jenkins-based CI/CD readiness

## 18. Current Limitations

- shared repo coupling high hai
- Nginx config tracked form me repo me absent hai
- DB deployment docs aur current env reality fully same nahi hain
- prediction docs aur current implementation me difference hai
- collaboration engine large-scale concurrency ke liye basic hai

## 19. Final Conclusion

Your Docs ek well-structured learning-plus-production-style project hai jo modern web app ke kaafi important parts combine karta hai:

- React frontend
- FastAPI backend
- microservice-style backend architecture
- API gateway
- PostgreSQL data model
- WebSocket collaboration
- Docker-based deployment
- AWS EC2 hosting plan
- Nginx reverse proxy layer
- AI-assisted next-word prediction

Sabse important technical point ye hai ki project ka backend clearly modularized hai, deployment-ready hai, aur prediction feature current state me local ML ke bajay external AI inference service par based hai.
