# AWS Full-Stack Task Manager — Deployment Documentation

Use this file as the working deployment checklist. Record actual resource names, IDs, URLs, and screenshots as you create them. Do not claim a step is complete until you have verified it.

## Proposed architecture
Browser -> CloudFront (HTTPS) -> default behavior to private S3 frontend origin.
CloudFront `/api/*` behavior -> EC2-hosted Express API on port 5000 -> PostgreSQL (prefer Amazon RDS in production).

For a learning setup, CloudFront can reach an EC2 custom origin over HTTP port 5000, but that is not end-to-end encrypted between CloudFront and EC2. Prefer HTTPS on the API origin with a valid certificate and domain where possible. Never expose PostgreSQL publicly. Restrict database ingress to the backend security group only.

## Task 1 — Application Setup

### Step 1 — Review the project files
**Objective:** Identify the frontend, backend, database and Docker configuration.
**Command:**
```bash
ls
```
**Explanation:** `frontend/` contains React UI; `backend/` contains Express API; `docker-compose.yml` runs the local development stack.
**Where to take screenshots:** Project folder showing `frontend`, `backend`, `.env.example`, and `docker-compose.yml`.

### Step 2 — Configure local environment
**Objective:** Create local environment variables.
**Command (Git Bash):**
```bash
cp .env.example .env
```
Edit `.env`. Set a unique `POSTGRES_PASSWORD` and a long random `JWT_SECRET` (at least 32 characters). Do not commit `.env`.
**Where to take screenshots:** `.env.example` with secrets not visible. Never capture or submit actual secrets.

### Step 3 — Run the application locally
**Objective:** Start frontend, backend and database to verify the application before AWS deployment.
**Command:**
```bash
docker compose up --build
```
**Explanation:** Docker Compose starts PostgreSQL, the Express API, and Vite frontend.
**Verification:** Open `http://localhost:5173`; register an account; add a task; mark it completed; delete it. Check `http://localhost:5000/api/health` returns `{"status":"ok","database":"connected"}`.
**Where to take screenshots:** Frontend page, task list with a test task, and API health response.

### Step 4 — Stop local containers
**Objective:** Stop the local application cleanly.
**Command:**
```bash
docker compose down
```
Keep the volume if you want to preserve local test data. `docker compose down -v` deletes the local database volume.

## Task 2 — Prepare the Backend for AWS

### Step 5 — Create an Amazon ECR repository (optional but recommended)
**Objective:** Store the backend Docker image in Amazon ECR.
**Procedure:** AWS Console -> ECR -> Private repositories -> Create repository. Example name: `task-manager-api`. Select the AWS Region you will use and record the repository URI.
**Where to take screenshots:** ECR repository page showing the repository URI.

### Step 6 — Build and test the backend image
**Objective:** Build a production image.
**Command (run from project root):**
```bash
docker build -t task-manager-api ./backend
```
**Verification:**
```bash
docker images
```
**Where to take screenshots:** Successful image build and `docker images`.

### Step 7 — Push the backend image to ECR
**Objective:** Publish the backend image to ECR.
**Procedure:** Use an IAM role or short-lived AWS credentials with least-privilege ECR permissions. Configure AWS CLI for the correct account and region. Follow the ECR console's **View push commands** for the exact registry URI and login command.
**Typical commands (replace placeholders):**
```bash
aws sts get-caller-identity
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
docker tag task-manager-api:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/task-manager-api:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/task-manager-api:latest
```
**Where to take screenshots:** ECR Images tab showing the pushed image and tag. Do not expose access keys.

### Step 8 — Create the database
**Objective:** Provide persistent database storage for deployed users and tasks.
**Recommended:** Create Amazon RDS for PostgreSQL in the same VPC as the backend. Use private subnets, no public access, strong credentials stored in Secrets Manager/SSM, and a security group allowing TCP 5432 only from the backend security group. Record the RDS endpoint and database name.
**Important:** The application creates its tables on startup. Set `DATABASE_URL` to `postgres://<DB_USER>:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/<DB_NAME>`. Configure database TLS according to the RDS CA/certificate guidance before setting `PGSSL=true`.
**Where to take screenshots:** RDS database status and connectivity/security group settings, with credentials hidden.

### Step 9 — Deploy the backend on EC2
**Objective:** Run the Express API on AWS.
**Procedure:**
1. Launch an Amazon Linux EC2 instance in the same VPC as RDS.
2. Create/attach an IAM instance role with least-privilege access to pull the ECR image and read the required secret.
3. Install Docker and AWS CLI if not already present.
4. Configure security group ingress. For a temporary lab, TCP 5000 may be opened only as needed to verify connectivity; do not leave it open to the world. Prefer a load balancer or CloudFront-origin-restricted access for the public origin.
5. Authenticate to ECR and pull the image.
6. Run the container with `PORT=5000`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `CORS_ORIGIN` set securely.
7. Ensure the instance has outbound connectivity to ECR and RDS.
**Example run command (pass secrets securely; do not save secrets in shell history):**
```bash
docker run -d --name task-manager-api --restart unless-stopped -p 5000:5000 \
  -e PORT=5000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e JWT_EXPIRES_IN=2h \
  -e CORS_ORIGIN="https://<CLOUDFRONT_DOMAIN>" \
  <ECR_IMAGE_URI>
```
**Verification:** From an allowed network path, request `http://<EC2_PUBLIC_DNS>:5000/api/health`. The response should show the database connected. If origin HTTPS is configured, use the HTTPS API origin instead.
**Where to take screenshots:** EC2 instance running, container status (`docker ps`), backend health response, and security group rules.

## Task 3 — Build and Deploy the Frontend

### Step 10 — Build the React frontend
**Objective:** Generate optimized static files for S3 hosting.
**Command (from project root):**
```bash
cd frontend
npm install
npm run build
```
**Explanation:** Vite creates the static production site in `frontend/dist`. The app uses relative `/api` requests so CloudFront can route API requests to the backend origin.
**Where to take screenshots:** Successful build and `dist` folder.

### Step 11 — Create an S3 bucket and upload the frontend
**Objective:** Host the static frontend files.
**Procedure:** Create a globally unique S3 bucket in the selected Region. Keep Block Public Access enabled. Upload the **contents** of `frontend/dist/` (including `index.html` and `assets/`). Use CloudFront with an Origin Access Control (OAC) so the bucket remains private. Do not enable S3 website hosting when using the private REST origin/OAC pattern.
**Where to take screenshots:** S3 bucket objects showing `index.html` and `assets/`; Block Public Access enabled.

### Step 12 — Verify the frontend files
**Objective:** Confirm the built frontend is ready for CloudFront.
**Verification:** Check that `index.html` and built assets exist in S3. The site will be tested through CloudFront after the distribution is configured.
**Where to take screenshots:** S3 objects list and successful upload.

## Task 4 — Configure Amazon CloudFront

### Step 13 — Create the CloudFront distribution
**Objective:** Deliver the frontend securely through CloudFront.
**Procedure:**
1. Create a CloudFront distribution.
2. Set the private S3 bucket as the default origin.
3. Configure Origin Access Control (OAC) and allow CloudFront to read the S3 bucket.
4. Set Viewer protocol policy to **Redirect HTTP to HTTPS**.
5. Use the default CloudFront domain for the lab, or attach a custom domain and an ACM certificate created in `us-east-1`.
6. Set the default behavior to the managed optimized caching policy suitable for static assets.
7. Wait for the distribution status to become **Deployed**.
**Where to take screenshots:** Distribution settings, S3 origin/OAC, viewer protocol policy, and deployed status.

### Step 14 — Add the backend API origin
**Objective:** Route API requests through CloudFront to the backend.
**Procedure:** In the distribution, add a custom origin for the backend endpoint. For a lab HTTP origin, use the EC2 DNS name and HTTP port `5000`. For a secure setup, use an HTTPS origin with a valid certificate and standard HTTPS port.
**Important:** If using HTTP port 5000, traffic from CloudFront to EC2 is not encrypted. Restrict the origin ingress as much as possible and do not present this as end-to-end HTTPS. Production should use an HTTPS origin, typically through an ALB with TLS.
**Where to take screenshots:** Origin list showing both the S3 frontend origin and backend origin.

### Step 15 — Configure the `/api/*` behavior
**Objective:** Send API calls to the backend origin rather than S3.
**Procedure:**
1. Add a behavior with path pattern `/api/*`.
2. Select the backend origin.
3. Set Viewer protocol policy to **Redirect HTTP to HTTPS**.
4. Allow `GET`, `HEAD`, `OPTIONS`, `PUT`, `POST`, `PATCH`, and `DELETE` (or the minimal methods your app requires).
5. Use a caching-disabled cache policy for API requests.
6. Forward the `Authorization` and `Content-Type` headers, required query strings, and any required cookies. A managed origin request policy such as **AllViewerExceptHostHeader** can be used for a lab, but review which headers should be forwarded.
7. Ensure `OPTIONS` preflight requests reach the API.
**Where to take screenshots:** `/api/*` behavior with the backend origin, allowed methods, protocol policy, and cache policy.

### Step 16 — Update CORS and authentication configuration
**Objective:** Allow the browser app to use the API through CloudFront.
**Procedure:** Set backend `CORS_ORIGIN` to the exact CloudFront origin, such as `https://d123example.cloudfront.net` (no trailing slash). Restart/redeploy the backend with the updated environment variable. Since both frontend and API use the same CloudFront host, CORS may not be triggered for those requests, but the explicit allowlist remains useful for direct browser-origin testing.
**Verification:** Register/login through the CloudFront URL and inspect browser Developer Tools -> Network. Check that `/api/auth/login` and `/api/tasks` return expected status codes.
**Where to take screenshots:** Environment variable name/value with secrets hidden, and browser Network tab showing successful API requests.

### Step 17 — Configure the frontend entry point
**Objective:** Ensure CloudFront serves the React application correctly.
**Procedure:** Use the CloudFront distribution domain. If a client-side route returns 403/404, configure the appropriate error response to serve `/index.html` with status 200 for frontend routes only. Do not rewrite API errors to `index.html`.
**Where to take screenshots:** CloudFront domain displaying the TaskFlow login page.

## Task 5 — Full-Stack Integration and Testing

### Step 18 — Test authentication
**Objective:** Verify registration and login against the deployed API.
**Procedure:** Open the CloudFront URL, create a test account, log out, and log in again.
**Where to take screenshots:** Successful login/dashboard. Avoid showing real personal information.

### Step 19 — Test task operations
**Objective:** Verify the complete frontend-to-backend-to-database flow.
**Procedure:** Add a task, refresh the page, mark it complete, and delete it. Verify changes persist after refresh.
**Where to take screenshots:** Task created, completed, and deleted; successful Network requests.

### Step 20 — Check CloudFront and browser errors
**Objective:** Confirm delivery, API routing, and cache behavior.
**Procedure:** Verify the distribution is Deployed; inspect browser Console and Network tabs; check `/api/health`; confirm API responses are not cached unexpectedly.
**Where to take screenshots:** CloudFront distribution status, working CloudFront URL, health endpoint response, and Network tab.

## Task 6 — Final Deployment Verification

### Step 21 — Verify the complete deployment
**Objective:** Confirm the complete application is deployed and accessible.
**Verify:**
- S3 contains the frontend build output and remains private behind OAC.
- CloudFront status is Deployed and HTTP redirects to HTTPS.
- The CloudFront domain displays the frontend.
- `/api/health` returns a healthy response through the API behavior.
- Registration, login, create task, complete task, and delete task all work.
- Backend can reach PostgreSQL; database is not publicly accessible.
- Browser Console has no unresolved CORS or connectivity errors.
- Secrets are not in source control or screenshots.

**Final details to record:**
- AWS Region:
- S3 bucket name:
- ECR repository URI:
- EC2 instance ID:
- RDS identifier (if used):
- CloudFront distribution ID:
- CloudFront URL:
- Backend API health URL:
- Deployment status:

**Final outcome:** Complete only after verifying the deployed frontend and backend API through the CloudFront distribution URL. Attach screenshots of the important AWS configurations and the working application.
