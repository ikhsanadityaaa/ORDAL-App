# ORDAL App - Engineering Progress

Last updated: 2026-09-17
Branch: `codex/secure-architecture-v2`
Base commit: `a003a72`
Latest pushed commit: `8b1b346`
Remote branch: `origin/codex/secure-architecture-v2`

## Goal

Remove production secrets and direct Supabase access from the desktop application. Keep operational job data local while Web/Vercel controls identity, devices, trials, licenses, and payments.

## Completed

- Replaced direct PostgreSQL authentication with calls to the central Web API.
- Replaced local JWT authority with opaque Web-issued session tokens.
- Added a 60-second in-memory session validation cache.
- Proxied registration, login, email verification, Google OAuth, logout, and device management.
- Proxied trial, payment, and activation endpoints.
- Disabled local payment simulation.
- Replaced central PostgreSQL operational storage with local SQLite WAL database.
- Kept CVs, cookies, credentials, job targets, sessions, logs, preferences, and onboarding local per device.
- Removed `psycopg2-binary` and `PyJWT` runtime dependencies.
- Removed database readiness checks from Windows and macOS startup flow.
- Build fails when `backend/.env` exists, preventing accidental secret bundling.
- Removed database/payment/OAuth/admin secrets from desktop `.env.example`.
- Disabled password registration/login through Telegram.
- Deleted unreachable Telegram password registration/login bodies.
- Deleted unused PostgreSQL and `.env` database helpers from both launchers.
- Auto-apply now starts the central three-day trial before its first job search.
- Manual session response now returns the post-start trial state.
- Added runnable desktop security and SQLite schema self-check.
- Python compile check passes.
- Frontend production build passes.
- SQLite schema and desktop security self-check passes.

## Security Result

- Desktop no longer needs Supabase password.
- Desktop no longer needs Google client secret.
- Desktop no longer needs Midtrans server key or PayPal secret.
- Desktop no longer contains admin activation bypass or payment simulation authority.
- Reinstalling the app does not reset central device/trial claims.
- Local app modifications cannot grant server license state.

## Known Limitations

- No desktop software can be absolutely anti-hack. Attackers can modify local UI or automation code, but server-controlled access and payment state cannot be legitimately changed without server authorization.
- Hardware fingerprint is an abuse signal, not cryptographic hardware attestation.
- Operational data is now device-local and is not synchronized between two devices.
- Existing legacy local database is not automatically imported into `ordal-local-v2.db` yet.

## Remaining Engineering Work

- Run FastAPI import/startup tests inside project virtual environment with dependencies installed.
- Run end-to-end desktop login/device/trial/payment tests against Vercel preview.
- Add local SQLite migration/import path if preservation of old device data is required.
- Add OS keychain storage for app session token; current frontend stores token in local storage.
- Build Windows package and inspect final bundle for secrets.
- Build/sign/notarize macOS package and inspect final bundle for secrets.
- Obtain Windows Authenticode certificate and Apple Developer ID before public distribution.
- Test the desktop app against the Web feature branch Vercel preview.

## External Setup Dependency

Web API is not usable in production until required Vercel environment variables and Google/Resend/payment accounts are configured. See Web repository `CODEX_PROGRESS.md`.

## Rules For Next AI

- Do not restore direct database access.
- Do not add production secrets to desktop environment files.
- Do not push directly to `main`.
- Update this file whenever repository state, tests, blockers, or next steps change.
