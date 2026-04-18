## Render Deployment

This project is prepared for a two-service Render deployment:

1. `docs-backend`
   Runs the FastAPI app from `backend/`

2. `docs-frontend`
   Builds the React app from `docs-react/` and serves it as a static site

### Before deploy

1. Create a PostgreSQL database on Render, Neon, Supabase, or another hosted provider.
2. Copy the values from [backend/.env.example](/C:/Your%20Docs/backend/.env.example:1) and [docs-react/.env.example](/C:/Your%20Docs/docs-react/.env.example:1).
3. Set real values for:
   - `SQL_DATABASE_URL`
   - `SECRET_KEY`
   - `FRONTEND_URL`
   - `CORS_ORIGINS`
   - `REACT_APP_API_URL`
   - `REACT_APP_WS_URL`

### Render steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and point it at the repo.
3. Render will detect [render.yaml](/C:/Your%20Docs/render.yaml:1).
4. Update the default frontend/backend domain values in Render after the real service URLs are assigned.
5. Add the real database URL and secret key as environment variables.
6. Redeploy both services once the URLs are finalized.

### Notes

- The frontend now uses env-based API and websocket URLs, so it can connect to production correctly.
- The backend CORS policy is env-driven, so add every allowed frontend origin there.
- If TensorFlow is unavailable in production, the app still boots; only word prediction returns an empty suggestion.
