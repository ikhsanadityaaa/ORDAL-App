# ORDAL App - Engineering Progress

Last updated: 2026-09-17
Branch: `codex/desktop-control-plane`
Base commit: `a003a72`
Implementation commit: `2c0eec6` (pushed to `origin/codex/desktop-control-plane`).

## Goal

Keep PostgreSQL as centralized storage while moving security authority and secret-bearing operations behind ORDAL-Web HTTPS APIs. Desktop must not decide access or contain database, OAuth, payment, or admin secrets.

## Completed In Current Branch

- Added a control-plane client using `ORDAL_API_BASE_URL`.
- Replaced locally issued JWT authentication with opaque server sessions.
- Proxied registration, login, email verification, logout, Google OAuth, and device management to `/api/app`.
- Proxied trial, activation, and payment operations to `/api/app`.
- Stored opaque app sessions encrypted in the existing per-user local secret store for background access checks.
- Removed local payment simulation, admin, webhook, and gateway-secret handling from active desktop routes.
- Disabled desktop schema mutation by default; `ORDAL_RUN_SCHEMA_MIGRATIONS=true` is development-only.
- Added a runnable control-plane self-check.
- Confirmed production Google config endpoint responds through the control-plane client.
- Python compile, control-plane import, self-check, and frontend production build pass.

## PostgreSQL Decision

- PostgreSQL remains the database. SQLite migration was rejected and reverted before commit.
- Current operational routes still access PostgreSQL directly for CVs, targets, preferences, job sessions, logs, onboarding, and Telegram data.
- This direct access is the remaining critical architecture gap because desktop still needs a production database DSN.

## Remaining Engineering Work

- Add authenticated ORDAL-Web API routes for operational CRUD and session/log writes.
- Move desktop CV, target, preference, onboarding, question-bank, and history routes to those APIs.
- Define encrypted handling for platform credentials and cookies; never return stored secrets to web clients.
- Move Telegram account commands away from direct `User` password queries.
- Remove `ORDAL_DATABASE_URL`, `DATABASE_URL`, `psycopg2`, and database setup prompts from desktop builds only after all callers use server APIs.
- Test auth, device removal, trial start, payment, activation, and expired-session flows against Preview.

## Rules For Next AI

- Keep PostgreSQL; do not introduce SQLite.
- Do not push directly to `main`.
- Do not add secrets to repository files or desktop builds.
- Preserve ORDAL-Web as authority for every access decision.
- Update this file when implementation state or blockers change.
