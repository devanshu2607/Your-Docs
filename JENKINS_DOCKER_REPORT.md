# Jenkins and Docker Report

## Goal

This project uses Docker and Jenkins to automate backend validation and deployment for the docs application. The frontend stays on Vercel and is not containerized in this flow.

## Why Docker Is Used

Docker is used to package each backend microservice with its runtime and dependencies so it can run the same way on any machine.

In this repo, each backend service has its own Dockerfile:

- `backend/microservices/gateway-service/Dockerfile`
- `backend/microservices/auth-service/Dockerfile`
- `backend/microservices/docs-service/Dockerfile`
- `backend/microservices/websocket-service/Dockerfile`
- `backend/microservices/prediction-service/Dockerfile`

These Dockerfiles create images for each service. The images can then be started as containers.

## Why Jenkins Is Used

Jenkins is used as the CI/CD tool to automate the backend workflow.

It helps with:

- pulling the latest code from GitHub
- preparing environment files during build time
- validating the compose setup
- running backend checks
- building Docker images
- deploying the backend to AWS EC2 after validation passes

## How Docker and Jenkins Work Together

The pipeline is driven by [backend/Jenkinsfile](/C:/Your%20Docs/backend/Jenkinsfile:1).

The flow is:

1. Jenkins reads the pipeline from the GitHub repo.
2. Jenkins creates `backend/.env.aws` at build time using Jenkins credentials.
3. Jenkins validates `backend/docker-compose.aws.yml`.
4. Jenkins builds backend Docker images.
5. Jenkins copies the backend bundle to the EC2 server over SSH.
6. Jenkins runs `docker compose up -d --build` on the EC2 host.
7. Jenkins checks the public backend health endpoint.

## Why `backend/.env.aws` Is Not Committed

The backend uses sensitive values such as:

- `SQL_DATABASE_URL`
- `SECRET_KEY`
- `PREDICTION_API_KEY`

These are stored in Jenkins Credentials, not in GitHub. Jenkins writes them into `backend/.env.aws` only during the job, then removes the file after the job finishes.

This keeps secrets out of the repository.

## What `backend/docker-compose.aws.yml` Does

`backend/docker-compose.aws.yml` defines how the backend services run together for the EC2 deployment target.

It currently:

- builds the service images from their Dockerfiles
- exposes only the gateway publicly on port `8000`
- passes environment values into the containers
- links the services together on the same Docker network

## Why The Frontend Is Not In Docker Here

The frontend is not part of this Docker deployment flow because it is already handled separately. In this setup, Jenkins is focused only on the backend and its microservices.

## Current Tooling Roles

- Dockerfile: defines how each service image is built
- Docker Compose: starts the backend services together
- Jenkinsfile: automates validate/build/deploy steps
- Jenkins Credentials: stores secrets outside the repository
- SSH credentials: allow Jenkins to reach the EC2 server for deployment

## Learning Outcome

This setup teaches the practical DevOps path:

- code goes to GitHub
- Jenkins reads the pipeline
- Docker builds the services
- Jenkins deploys the backend to EC2
- Docker Compose starts the backend stack there
- secrets stay outside git

## Important Notes

- Jenkins must run with Docker access to build and start containers.
- Jenkins must also have SSH access to the EC2 instance to deploy the stack.
- If Docker access is missing, the pipeline can validate files but cannot build or deploy containers.
- If the secret values change, update Jenkins Credentials, not the repository.

## Jenkins credentials expected by the new pipeline

- `docs-sql-database-url`
- `docs-secret-key`
- `prediction-api-key`
- `aws-ec2-ssh-key`

## Jenkins parameters expected by the new pipeline

- `FRONTEND_URL`
- `AWS_EC2_HOST`
- `AWS_EC2_USER`
- `AWS_APP_DIR`
- `BACKEND_HEALTHCHECK_URL`
