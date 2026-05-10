# AWS Backend Deployment

This repo already has Dockerized backend microservices, so the simplest AWS target is:

- Frontend on Vercel
- Backend on one EC2 instance with Docker Compose
- PostgreSQL in Docker on the same EC2 instance for the first deployment

That keeps the current architecture intact, avoids Render sleep behavior, and avoids adding RDS complexity on day one.

## Why your earlier upload felt stuck

The backend workspace currently contains large local-only folders like `backend/venv`, and the frontend contains `docs-react/node_modules`.
Those folders can make uploads and Docker build contexts huge if you send the whole machine folder to EC2.

The new root-level [`.dockerignore`](/C:/Your%20Docs/backend/.dockerignore:1) prevents most of that from entering backend images.

## Recommended AWS shape

1. Create an EC2 Ubuntu instance.
2. Point a subdomain like `api.example.com` to the EC2 public IP.
3. Run the backend with [docker-compose.aws.yml](/C:/Your%20Docs/backend/docker-compose.aws.yml:1).
4. Put Nginx in front of port `8000` so Vercel can call the backend over HTTPS.
5. In Vercel, set `REACT_APP_API_URL=https://api.example.com`.

## Important note about Vercel

Because the frontend stays on Vercel, the backend should be exposed over **HTTPS**.
Using plain `http://EC2-IP:8000` from a Vercel-hosted site is not a good production setup and may run into browser security and mixed-content issues.

## Files to prepare on the server

1. Clone the repo on EC2.
2. Go to [backend](/C:/Your%20Docs/backend).
3. Copy `.env.aws.example` to `.env.aws`.
4. Fill in real values for:
   - `FRONTEND_URL`
   - `CORS_ORIGINS`
   - `SECRET_KEY`
   - `POSTGRES_PASSWORD`
   - `PREDICTION_API_KEY`

For the simple EC2 setup, keep:

- `POSTGRES_DB=your_docs`
- `POSTGRES_USER=postgres`
- `SQL_DATABASE_URL=postgresql://postgres:<same-password>@postgres:5432/your_docs`

## EC2 one-time setup

Use Ubuntu on the EC2 free tier, then run:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Open these EC2 security group ports:

- `22` for SSH
- `80` for HTTP
- `443` for HTTPS
- `8000` only if you want to test the gateway directly before Nginx

## Run on EC2

```bash
git clone <your-repo-url>
cd backend
cp .env.aws.example .env.aws
nano .env.aws
docker compose -f docker-compose.aws.yml up -d --build
```

Check that everything is healthy:

```bash
docker compose -f docker-compose.aws.yml ps
docker compose -f docker-compose.aws.yml logs -f gateway-service
curl http://localhost:8000/health
```

The database is private inside Docker networking, so you do not need to open port `5432` on the EC2 security group.

If you want the stack to come back after a reboot:

```bash
sudo systemctl enable docker
```

## What is public vs internal

- `gateway-service` is the only public-facing service
- `auth-service`, `docs-service`, `websocket-service`, `prediction-service`, and `postgres` stay private inside Docker networking

## Next step after containers work

Once `curl http://localhost:8000/health` works on EC2, put Nginx in front and attach a domain plus SSL. Then point Vercel to:

```env
REACT_APP_API_URL=https://api.example.com
REACT_APP_WS_URL=wss://api.example.com
```

## Prediction service note

The prediction service now works best in external API mode instead of loading TensorFlow locally.
The default configuration uses OpenRouter's free-model router.
Set `PREDICTION_PROVIDER=openrouter`, `PREDICTION_API_KEY`, and `PREDICTION_MODEL` in [backend/.env.aws.example](/C:/Your%20Docs/backend/.env.aws.example:1).
This removes the slow local model warm-up path that was making small hosts and Render sluggish.

## Suggested EC2 size

For this backend after moving prediction to an external API, start around:

- `t3.micro` for basic testing
- `t3.small` if general app traffic grows

Very small instances are now more realistic because the heavy local TensorFlow model path is gone.
