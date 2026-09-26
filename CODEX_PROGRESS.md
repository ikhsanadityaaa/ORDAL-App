# ORDAL App - Engineering Progress

Last updated: 2026-09-26
Branch: `codex/secure-architecture-v2`
Base commit: `0bf0819`
Implementation commit: `8132076`
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
- macOS bundle build, ad-hoc signature verification, secret scan, and startup test pass.
- Production ORDAL-Web API responds successfully; Google OAuth config reports enabled.
- Added first-launch Indonesia/English language selection.
- Added onboarding help for multi-value position/location fields and themed availability dropdown.
- Added optional recommended AI setup after onboarding, accurate provider marks, API-key instructions, and free/paid labels.
- Added macOS Google OAuth callback tab cleanup and app focus restore after successful login polling.
- Prevented Python bytecode writes inside the signed macOS app bundle.
- Installed the latest build at `/Applications/ORDAL.app`; app starts with one launcher process.
- Verified the installed bundle remains ad-hoc signed after startup and creates no runtime bytecode inside the bundle.
- Replaced modal onboarding with a full-screen first-run journey inside the app.
- Changed fresh-install language default to English while keeping English/Indonesia selection.
- Added persistent preferred-name capture, personal greeting, and guided setup introduction.
- Added ATS-friendly CV guidance and explicit confirmation that readable CV text is the source for answers.
- Made Question Bank answer controls follow actual field types: dropdown, yes/no, number, text, and textarea.
- Removed keyword-based number guessing for text questions in app and Telegram prompts.
- Hardened AI grounding: missing personal facts are asked from the user or left unanswered, never invented.
- Added `backend/onboarding_question_self_check.py` for field typing and grounded-answer regression checks.
- Built and installed the 2026-09-24 macOS bundle; signature, startup, browser QA, and no-runtime-bytecode checks pass.
- Fixed Google OAuth polling race that could show an expired-login error after a successful callback.
- Removed AppleScript browser control and its macOS Automation permission prompt; OAuth now uses the user's default browser without requiring Chrome.
- Changed login and email verification from layered popups to full-screen app screens using the same typography, buttons, palette, and layout system as onboarding.
- Added `backend/oauth_self_check.py` for OAuth polling and macOS permission regression checks.
- Installed the OAuth-corrected macOS bundle at `/Applications/ORDAL.app`; signature, startup, English flow, and single-process checks pass.
- Fixed Google login appearing unresponsive on networks where Python stalls on the Vercel IPv6/NAT64 address.
- Central API calls now use an IPv4 transport with bounded connect/read timeouts; Google loading state appears immediately after click.
- Verified the installed app sends `config`, `start`, and `poll` requests successfully and shows the Google waiting screen.
- Rebuilt and installed `/Applications/ORDAL.app`; signature, runtime logs, regression checks, and bundle integrity pass.
- Rewrote the first-run welcome in conversational Indonesian and warmer English, including phase-specific calls to action.
- Replaced rigid Inter typography with Plus Jakarta Sans and Bricolage Grotesque across the app.
- Added animated phase transitions, progress dots, floating icon/spark/blob motion, staggered benefit cards, and reduced-motion accessibility support.
- Verified all three welcome phases at desktop and mobile sizes with no horizontal overflow, then rebuilt and installed `/Applications/ORDAL.app`.
- Fixed macOS showing ORDAL and Python as two separate applications by launching the framework Python executable from inside the ORDAL bundle.
- Verified the installed app runs as one process and one LaunchServices identity: `ORDAL` / `com.ordal.app`; no `Python` app identity remains.
- Rebuilt, ad-hoc signed, installed, and launched `/Applications/ORDAL.app`; backend startup and local database checks pass.

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

- Run end-to-end desktop login/device/trial/payment tests against Vercel preview.
- Confirm Google OAuth completion with one real user login; the browser result tab remains user-controlled to avoid macOS browser-control permission prompts.
- Add local SQLite migration/import path if preservation of old device data is required.
- Add OS keychain storage for app session token; current frontend stores token in local storage.
- Build Windows package and inspect final bundle for secrets.
- Sign/notarize macOS package with Apple Developer ID before public distribution.
- Obtain Windows Authenticode certificate and Apple Developer ID before public distribution.
- Open/review a pull request for `codex/secure-architecture-v2`, then test its integrated release flow.

## External Setup Dependency

Web security/database variables and Google OAuth are configured. Resend, Midtrans, PayPal, download URLs, and the final custom domain remain pending. See Web repository `CODEX_PROGRESS.md`.

## MacBook Handoff

Latest desktop build is installed and running on the MacBook. Next release checks:

1. Test Google login completion and automatic return-to-app focus with a real user account.
2. Test verified-email login, device enforcement/removal, trial, payment polling, permanent license, and logout.
3. Replace local-storage session token storage with OS keychain storage before public release.
4. Build and inspect the Windows package.
5. Sign and notarize the macOS package with an Apple Developer ID.

## Rules For Next AI

- Do not restore direct database access.
- Do not add production secrets to desktop environment files.
- Do not push directly to `main`.
- Update this file whenever repository state, tests, blockers, or next steps change.
