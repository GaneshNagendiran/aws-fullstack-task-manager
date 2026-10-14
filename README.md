# AWS Full-Stack Task Manager

A learning project for the AWS full-stack + CloudFront assignment.

## Features
- User registration and login using bcrypt password hashing and JWT
- Create, list, complete, and delete tasks
- React frontend, Express REST API, PostgreSQL database
- Dockerfile and Docker Compose for local testing
- Designed for S3 + CloudFront frontend hosting and an EC2-hosted backend API

## Requirements
- Node.js 20+ and npm, or Docker Desktop
- Git is optional if you create a repository

## Run locally with Docker Compose
1. Copy `.env.example` to `.env`.
2. Change `JWT_SECRET` to a long random value.
3. Run:
   ```bash
   docker compose up --build
   ```
4. Open `http://localhost:5173`.
5. Register a new account and create tasks.
6. API health check: `http://localhost:5000/api/health`.

Stop with `Ctrl+C`, then:
```bash
docker compose down
```
To also delete the local database volume (this deletes local test data):
```bash
docker compose down -v
```

## Run without Docker
Start PostgreSQL locally and create a database/user matching `.env`, then:
```bash
cd backend
npm install
# Set DATABASE_URL in your shell/.env to your local PostgreSQL connection string
npm run dev
```
In a second terminal:
```bash
cd frontend
npm install
npm run dev
# Vite proxies /api to http://localhost:5000 by default
```
The Vite development server proxies `/api` to `http://localhost:5000`.

## AWS deployment outline
See `DEPLOYMENT-GUIDE.md` for the assignment steps and CloudFront configuration.

## Important
- This is a training application, not a production-ready identity platform.
- Do not commit `.env`, passwords, JWT secrets, database credentials, or AWS keys.
- Use HTTPS for the public application. Restrict database access to the backend security group.
- For production, use AWS Secrets Manager/SSM Parameter Store, managed TLS for the API origin, stronger session management, logging, backups, and security review.
