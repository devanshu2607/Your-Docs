# Jenkins and Docker Report

## Goal

This project uses Docker and Jenkins to automate backend validation and deployment for the docs application. The frontend is not being containerized in this flow.

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
- starting or redeploying backend containers

## How Docker and Jenkins Work Together

The pipeline is driven by [Jenkinsfile](/C:/Your%20Docs/Jenkinsfile).

The flow is:

1. Jenkins reads the pipeline from the GitHub repo.
2. Jenkins creates `backend/.env` at build time using Jenkins credentials.
3. Jenkins validates `backend/docker-compose.yml`.
4. Jenkins runs a Python syntax check.
5. Jenkins builds backend Docker images.
6. Jenkins starts or refreshes the backend containers with `docker-compose up -d`.

## Why `backend/.env` Is Not Committed

The backend uses sensitive values such as:

- `SQL_DATABASE_URL`
- `SECRET_KEY`

These are stored in Jenkins Credentials, not in GitHub. Jenkins writes them into `backend/.env` only during the job, then removes the file after the job finishes.

This keeps secrets out of the repository.

## What `backend/docker-compose.yml` Does

`backend/docker-compose.yml` defines how the backend services run together.

It currently:

- builds the service images from their Dockerfiles
- publishes ports for each service
- passes environment values into the containers
- links the services together on the same Docker network

## Why The Frontend Is Not In Docker Here

The frontend is not part of this Docker deployment flow because it is already handled separately. In this setup, Jenkins is focused only on the backend and its microservices.

## Current Tooling Roles

- Dockerfile: defines how each service image is built
- Docker Compose: starts the backend services together
- Jenkinsfile: automates test/build/deploy steps
- Jenkins Credentials: stores secrets outside the repository

## Learning Outcome

This setup teaches the practical DevOps path:

- code goes to GitHub
- Jenkins reads the pipeline
- Docker builds the services
- Docker Compose starts the backend stack
- secrets stay outside git

## Important Notes

- Jenkins must run with Docker access to build and start containers.
- If Docker access is missing, the pipeline can validate files but cannot deploy containers.
- If the secret values change, update Jenkins Credentials, not the repository.

