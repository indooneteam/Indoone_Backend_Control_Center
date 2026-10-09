# Live Control Center Implementation Plan

## Scope

Connect this existing React/TypeScript dashboard to the existing Indoone backend's protected Control Center API. Keep Google AI Studio, Gemini, the local Indoone model, and backend model routing out of scope.

## Required user experience

- One global control to pause/resume application request intake; the server process and Control Center must remain available so intake can be resumed.
- Independent request-intake and AI-reply switches for WhatsApp, Instagram, Telegram, and Android.
- Live channel request totals, success/failure/blocked counts, AI replies sent/failed/skipped, and recent activity from the backend.
- An authenticated Control Center session. Never store the admin token in local storage, commit it, or expose it as a `VITE_*` build variable.
- Explicit loading, error, and paused states. Do not label sample data as live metrics.

## Implementation sequence

1. Add this plan and verify CI.
2. Add typed API helpers for the protected backend endpoints and tests; wait for CI.
3. Replace preview-only login with an admin-token connection check, keeping credentials in in-memory state only; wait for CI.
4. Connect dashboard/channel switches, aggregate metrics, and activity list to the backend; wait for CI.
5. Run source smoke tests, unit tests, TypeScript validation, dependency audit, and production build.
6. Document the deployment setup and verify GitHub Pages publishing after merge.

## Deployment constraints

- The frontend must use the HTTPS backend origin via `VITE_INDOONE_API_BASE_URL` at build time or the administrator must enter it on the sign-in screen.
- Admin tokens are entered at runtime and sent only in the Authorization header over HTTPS. Do not save tokens in browser storage.
- Backend CORS must allow the exact GitHub Pages origin.
- GitHub Pages is public hosting; the admin dashboard is safe for control only when the backend enforces admin-token authorization.

## Acceptance checklist

- [ ] Sign-in succeeds only when the backend validates the admin token.
- [ ] A single global intake switch pauses/resumes application request processing without taking down the server or control API.
- [ ] Request-intake and reply switches are independent for all four channels.
- [ ] Metrics and activity are server-backed, not hard-coded sample data.
- [ ] Each toggle displays failure safely and does not claim success unless the API confirms it.
- [ ] No AI model/provider code or secret is changed.
- [ ] CI is green before merging; Pages deployment is verified after merging.
