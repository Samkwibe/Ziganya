# Ziganya — Backend API

NestJS + TypeScript REST API for the **Ziganya** platform, per Project
Specification §4–§7 and §15. This is **Phase 1 (Foundation)**: local dev
environment, full database schema, and the Auth + User services.

## Quick start

```bash
cd backend
cp .env.example .env          # adjust if needed
npm install
npm run db:up                 # start Postgres 15 + Redis 7 (Docker)
npm run prisma:migrate        # apply migrations
npm run prisma:seed           # create demo admin + member
npm run start:dev             # API on http://localhost:3000/api/v1
```

Smoke test:

```bash
curl http://localhost:3000/api/v1/health
```

### Seeded accounts (password: `Password123!`)
- Admin — `admin@ziganya.app`
- Member — `amani@example.com`

## What's implemented (Phase 1)

### 1A — Local dev environment (spec §18.2)
- `docker-compose.yml`: **Postgres 15** + **Redis 7** with health checks and
  persistent volumes. (Cloud AWS provisioning is a separate ops task.)

### 1B — Database schema (spec §6)
- `prisma/schema.prisma` models every table: `users`, `contributions`,
  `loans`, `loan_payments`, `conversations`, `messages`, `notifications`,
  `audit_logs`.
- UUID PKs via `gen_random_uuid()`, money as `NUMERIC(12,2)`, timestamps as
  `TIMESTAMPTZ`, JSONB + INET on audit logs, hash-chain columns.
- **`UNIQUE(user_id, week_start_date)`** on contributions enforces one
  clock-in per week at the database level (spec §2.2 / §10.1).
- Indexes on all FKs and frequent filter columns.

### 1C — Auth service (spec §7.1 / §15.1)
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/auth/register` | bcrypt (cost 12), issues OTP + JWT pair |
| POST | `/auth/login` | email or phone; 5-attempt lockout (15 min) via Redis |
| POST | `/auth/refresh` | rotating refresh tokens stored in Redis |
| POST | `/auth/logout` | revokes refresh token(s) |
| POST | `/auth/verify-otp` | activates account |
| POST | `/auth/forgot-password` / `/auth/reset-password` | OTP-gated reset |

- **JWT**: access 15 min, refresh 30 days (Redis-backed, rotating).
- Global `JwtAuthGuard` (opt out with `@Public()`) + `RolesGuard`
  (opt in with `@Roles('admin')`). Role checked on every request (spec §2.13).
- Global rate limiting 100/min; 10/min on auth routes (spec §15.2).
- Global `ValidationPipe` (class-validator) with whitelisting.

### User service (spec §7.2)
`GET/PATCH /users/me`, `PATCH /users/me/language`, and admin-only
`GET /users`, `GET /users/:id`, `PATCH /users/:id/status`, `DELETE /users/:id`
(soft delete + session revocation).

## Project layout

```
backend/
├── docker-compose.yml          # Postgres + Redis
├── prisma/
│   ├── schema.prisma           # full DB schema (§6)
│   ├── migrations/             # SQL migrations
│   └── seed.ts                 # demo admin + member
└── src/
    ├── main.ts                 # bootstrap, global pipe/prefix/CORS
    ├── app.module.ts           # config, throttler, module wiring
    ├── health.controller.ts    # DB + Redis liveness
    ├── prisma/                 # PrismaService (global)
    ├── redis/                  # RedisService: sessions, lockout, OTP
    ├── auth/                   # controller, service, DTOs, strategy, guards, decorators
    └── users/                  # /users/me + admin management
```

## Next (Phase 2 — Contribution system)
Clock-in API with the unique-week constraint, admin verification, history
endpoints, FCM push, the missed-contribution cron, and M-Pesa STK Push —
then wire the mobile `AppContext` mocks to these endpoints.
```
