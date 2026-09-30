# ORDAL App - Engineering Progress

Last updated: 2026-09-27
Branch: `codex/secure-architecture-v2`
Base commit: `0bf0819`
Implementation commit: `1f07e51`
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
- Reworded the preferred-name onboarding screen in conversational Indonesian and English, including its prompt, helper text, label, placeholder, validation, and CTA.
- Simplified the personal greeting to `Halo, {name}!`, removed the example name, and removed em dashes from translated interface copy.
- Fixed clipped position/location chip inputs with more vertical room and explicit line height.
- Clarified that existing position/location chips are resumed onboarding data for the same user and added a safe `Hapus semua` action.
- Fixed JobStreet/LinkedIn Google sign-in by keeping OAuth tabs open, using the browser's real user agent, and preferring installed Google Chrome for manual job-platform authentication.
- Verified JobStreet's `Lanjutkan dengan Google` opens `accounts.google.com` in the managed login browser without entering account credentials.
- Replaced the approximate JobStreet icon with the current `jobstreet by seek` lockup and removed duplicated logo code from Settings.
- Removed the repeated `Halo, {name}!` subtitle from every onboarding panel; the personal greeting now appears only in the welcome journey.
- Replaced temporary job-platform browser contexts with a persistent ORDAL browser profile scoped per ORDAL user.
- Google and job-platform sessions now survive browser restarts after the user signs in once; the main Chrome profile remains isolated to avoid profile locking or corruption.
- Added user-facing guidance explaining why accounts from the main Chrome profile do not initially appear in the ORDAL browser.
- Verified persistent cookies survive closing and reopening the managed Chrome profile.
- Fixed desktop login persistence by disabling pywebview private mode, assigning a persistent webview storage directory, and using stable local origin `127.0.0.1:60471`.
- Replaced `open -a ORDAL` after Google OAuth with current-process activation, preventing a second installed/dist ORDAL bundle from opening at a different onboarding position.
- Fixed job-platform login completion handling so a session saved before browser cleanup is reported as success instead of `Gagal membuka browser login`.
- Removed indefinite frontend polling after job-platform login; the blocking capture response is now handled directly and always clears loading state.
- Installed and verified `/Applications/ORDAL.app` as one process, one LaunchServices identity, and one listener on port `60471`; persistent webview storage was created successfully.
- Reworked AI setup into a one-provider flow with clear free/paid labels, direct provider key-page buttons, automatic activation after saving, and a strong `Lanjut ke Cari Kerja` action.
- Replaced the JobStreet mark with the supplied blue dotted-arrow logo and removed the duplicate platform-logo implementation from Cari Kerja.
- Grouped active targets by CV, deduplicating positions, locations, salary, availability, employment type, and platform logos while preserving per-position cover-letter editing.
- Added a warm preparation-complete guide that points users to the orange Cari Kerja button.
- Added session-finish feedback: successful applications show congratulations and reduced-motion-safe confetti; zero-application sessions explain likely target availability and encourage another search.
- Removed remaining em dashes from user-facing target, question, configuration, and verification copy touched by this release.
- Added `frontend/target_groups_self_check.mjs`; target grouping, frontend build, Python compile, OAuth, onboarding/question, password, and security checks pass.
- Built, signed, installed, and launched the updated `/Applications/ORDAL.app`; one process listens on `127.0.0.1:60471`, the active bundle serves the new assets, and user data remains intact.
- Changed Target Aktif cards so target positions are the primary orange highlights; CV filenames are secondary metadata, positions wrap inline, and cover-letter controls use clear themed status labels instead of `CV ✓`.
- Simplified JobStreet platform cards to show only the circular JobStreet icon, matching the compact LinkedIn icon treatment; the platform name remains as card text.
- Removed duplicate per-position cover-letter rows from the normal Target Aktif view; editing remains available through Edit, and the JobStreet icon now fills its logo box more clearly.
- Reworked AI cover-letter generation so every active provider receives the same grounded prompt containing CV text, current target positions, and mandatory `{company}` / `{position}` placeholders.
- Rounded Target Aktif form controls, restyled native dropdowns, removed redundant `mode edit` controls, and equalized adjacent button sizes.
- Fixed Target Aktif edit mode to load every saved position from the selected CV group instead of only the first target row.
- Added clear CV-suggestion progress, a 45-second timeout, result feedback, and merge behavior that preserves existing positions while adding AI suggestions.
- Converted onboarding, welcome, completion, and in-app authentication layouts from floating bordered panels into full-window app pages; external Google/job-platform browser redirects remain separate.
- Redesigned onboarding as a new-game tutorial page with a centered HUD, stage counter, readable content safe area, balanced bottom controls, and an inline cover-letter example instead of an internal popup.
- Rebuilt the Cover Letter stage as an animated writing mission with a full-height editor, typewriter/mail scene, inline example, and active-provider AI generation grounded in the selected CV and target positions.
- Compressed the shared onboarding HUD into one row, gave every setup stage a scroll-safe mission canvas, and pinned rounded Back/Next controls so long forms never hide navigation.
- Applied the game-tutorial visual language across CV, preferences, platforms, email, and login stages with staged reveals, mission-number scenery, stronger rounded cards, and consistent interaction feedback.
- Removed the dark onboarding header and orange divider, leaving a compact logo-only HUD directly on the page canvas.
- Added topic-specific motion to every setup stage: CV upload, job preferences, platform selection, secure email, platform login, cover-letter typewriter, and welcome/completion feedback.
- Upgraded onboarding motion from moving icons to animated mini-scenes: ATS CV scanning and validation, a commuter walking toward an office, job cards arriving from platform logos, email passing through a security gate, and an interactive login browser with success feedback.
- Enlarged the focused stage animation, removed distracting side decorations after visual review, raised Back/Next controls from the window edge, and reset each stage scroll position so the full scene starts visible.
- Added Glints and Indeed as first-class auto-apply platforms across onboarding, Settings, active targets, history, question bank, session counters, Telegram validation, and bot dispatch.
- Added headed Chrome workers for Glints and Indeed with saved ORDAL sessions, target matching, duplicate prevention, CV upload, user-question fallback, submit confirmation, and no CAPTCHA bypass.
- Built, signed, installed, restarted, and smoke-tested `/Applications/ORDAL.app`; frontend, Python compile, platform bot checks, target grouping, and desktop security checks pass.
- Live submission remains pending one manual Glints and Indeed login inside the ORDAL browser profile; main Chrome sessions cannot be reused safely while its profile is locked.
- Replaced generated Glints and Indeed marks with the supplied official logo images and removed the Indeed checkerboard background into real transparency.
- Merged job-platform selection and login into one provider-style onboarding stage: clicking a platform selects it and opens login automatically, while a green status light confirms a saved session.
- Reworked AI selection into a responsive provider-card grid with connection lights, keeping the existing ORDAL theme and detailed key setup panel.
- Fixed clipped job-platform animation logos, removed orange selected-card emphasis, made successful login status green and softly blinking, renamed LinkedIn Post to clarify Auto Email, and added a coming-soon note for future platforms.
- Restored AI connection inside onboarding and reordered the journey to platform login, AI connection, then AI-assisted cover-letter creation; LinkedIn Post email setup remains conditional between platform and AI stages.

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
- Complete one real Glints and one real Indeed submission after the user logs in once through Persiapan; stop for CAPTCHA, phone verification, or unknown sensitive questions.
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
