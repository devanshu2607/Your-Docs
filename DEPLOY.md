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

If you want Jenkins to control deployment, keep Render `autoDeployTrigger: off` and let Jenkins call each service's deploy hook after tests pass.

Recommended Jenkins flow:

1. Poll SCM or use a webhook to start the pipeline.
2. Create `backend/.env` from Jenkins credentials.
3. Run compose validation and syntax checks.
4. Build the backend images locally if you want that extra safety check.
5. Call the Render deploy hooks for the backend services.
6. Poll the public gateway health endpoint until Render finishes rolling out.

Jenkins needs secret text credentials for the Render deploy hooks for:

- `auth-service`
- `docs-service`
- `websocket-service`
- `prediction-service`
- `docs-backend`
