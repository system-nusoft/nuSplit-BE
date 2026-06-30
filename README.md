# nuSplit — Backend

NestJS API for nuSplit, a group bill-splitting app.

## Local development

### Prerequisites

- Node.js 20+
- Docker (for local Postgres)

### Setup

```bash
# Install dependencies
npm install

# Copy env and fill in values
cp .env.example .env

# Start local Postgres
docker run -d --name nusplit-db \
  -e POSTGRES_USER=nusplit \
  -e POSTGRES_PASSWORD=nusplit \
  -e POSTGRES_DB=nusplit \
  -p 5434:5432 postgres:16-alpine

# Run migrations
npx prisma migrate dev

# Start in dev mode
npm run start:dev
```

API is available at `http://localhost:3001/api`.

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon (or Postgres) connection string |
| `DIRECT_URL` | Direct Neon connection (same as DATABASE_URL for local) |
| `JWT_ACCESS_SECRET` | Secret for 15-min access tokens |
| `JWT_REFRESH_SECRET` | Secret for 7-day refresh tokens |
| `AWS_ACCESS_KEY_ID` | AWS IAM key with SES (and S3 in Sprint 3) permissions |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `SES_FROM_MAIL` | Verified SES sender address |
| `FRONTEND_URL` | Frontend origin for CORS |
| `PORT` | Port (default `3001`) |

## Deployment (Render)

1. Create a new **Web Service** on Render pointing to this repo.
2. Set **Build command**: `npm install && npm run build`
3. Set **Start command**: `npm run start:prod` (runs `prisma migrate deploy && node dist/main`)
4. Add all environment variables from `.env.example`.
5. Set `DATABASE_URL` and `DIRECT_URL` to your Neon connection strings.

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create account |
| POST | `/api/auth/verify-email` | — | Verify OTP |
| POST | `/api/auth/resend-otp` | — | Resend OTP |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/refresh` | — | Refresh tokens |
| POST | `/api/auth/logout` | JWT | Logout |
| GET | `/api/auth/me` | JWT | Get current user |
| PATCH | `/api/users/me` | JWT | Update profile |
| POST | `/api/groups` | JWT | Create group |
| GET | `/api/groups` | JWT | List my groups |
| GET | `/api/groups/:id` | JWT | Group detail |
| POST | `/api/groups/:id/invite` | JWT | Generate invite link |
| GET | `/api/groups/invite/:token/preview` | — | Invite preview |
| POST | `/api/groups/invite/:token/accept` | JWT | Accept invite |
| POST | `/api/groups/:id/expenses` | JWT | Create expense |
| GET | `/api/groups/:id/expenses` | JWT | List expenses |
| PATCH | `/api/groups/:id/expenses/:eid` | JWT | Update expense |
| DELETE | `/api/groups/:id/expenses/:eid` | JWT | Delete expense |
