## Deployment Notes

This repo still contains the existing Render deployment notes below.

If you want to keep the frontend on Vercel and move only the backend to AWS, use:

- [backend/DEPLOY_AWS.md](/C:/Your%20Docs/backend/DEPLOY_AWS.md:1)
- [backend/docker-compose.aws.yml](/C:/Your%20Docs/backend/docker-compose.aws.yml:1)
- [backend/.env.aws.example](/C:/Your%20Docs/backend/.env.aws.example:1)

The biggest packaging fix for AWS is the new root-level [backend/.dockerignore](/C:/Your%20Docs/backend/.dockerignore:1), which prevents local virtualenv and notebook files from bloating Docker builds.

## Render Deployment

This repo is prepared for a full Render Blueprint deployment:

1. `auth-service`
2. `docs-service`
3. `websocket-service`
4. `prediction-service`
5. `gateway-service`
6. `docs-frontend`
7. `docs-db` PostgreSQL database

The gateway is the public backend entrypoint. The other backend services stay on Render's private network and are reached through `hostport` references in [backend/render.yaml](/C:/Your%20Docs/backend/render.yaml:1).

### Before deploy

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and point it at the repo.
3. Point Render at [backend/render.yaml](/C:/Your%20Docs/backend/render.yaml:1) during Blueprint setup.
4. Add the real `SECRET_KEY` value in the Render dashboard, or keep it as a synced secret from the Blueprint.
5. Deploy once, then confirm the frontend and gateway public URLs.

### Notes

- `SQL_DATABASE_URL` is pulled from the Render Postgres database connection string.
- `docs-frontend` uses the gateway public URL for API and websocket traffic.
- The backend CORS policy is env-driven, so keep the frontend URL in the allowed origins list.
- If TensorFlow is unavailable or slow to load in production, the app still boots; only word prediction may degrade.

### Jenkins-driven deploys

If you want Jenkins to control backend deployment to AWS while the frontend stays on Vercel, use the AWS pipeline in [backend/Jenkinsfile](/C:/Your%20Docs/backend/Jenkinsfile:1).

Recommended Jenkins flow:

1. Poll SCM or use a webhook to start the pipeline.
2. Create `backend/.env.aws` from Jenkins credentials.
3. Validate [backend/docker-compose.aws.yml](/C:/Your%20Docs/backend/docker-compose.aws.yml:1).
4. Build the backend images locally in Jenkins.
5. SSH into EC2 and sync the backend deployment bundle.
6. Run `docker compose -f docker-compose.aws.yml up -d --build` on EC2.
7. Poll the public gateway health endpoint until AWS finishes rolling out.

Jenkins needs these credentials for the AWS flow:

- `docs-sql-database-url`
- `docs-secret-key`
- `prediction-api-key`
- `aws-ec2-ssh-key`
