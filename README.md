# Indoone Backend Control Center — Web

Responsive React + TypeScript dashboard for controlling and monitoring the existing Indoone backend.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
# Optional: set VITE_INDOONE_API_BASE_URL to the backend's HTTPS origin.
npm run dev
```

The backend origin can also be entered on the sign-in screen. `VITE_INDOONE_API_BASE_URL` is only a public URL, never a token or secret.

## Validation

```bash
npm run test:smoke
npm test
npm run typecheck
npm run build
```

GitHub Actions also runs the dependency security audit, tests, TypeScript check, and production build.

## Live backend controls

The UI connects to the existing protected Indoone backend API. It does not generate AI responses or change model/provider configuration.

- **Global request intake:** pause/resume application API handling while leaving the backend process and Control Center endpoints online.
- **Global AI replies:** pause/resume automated replies independently of intake.
- **Per-channel settings:** separate request-intake and reply switches for WhatsApp, Instagram, Telegram, and Android.
- **Live metrics:** request success/failure/blocked counts, reply sent/failure/skipped counts, and recent outcome records from the backend.

The protected endpoints used by the UI are:

- `GET /api/control-center/status`
- `PATCH /api/control-center/settings`
- `GET /api/control-center/metrics`
- `GET /api/control-center/activity`

A switch changes state only after the backend confirms the update. An error is shown if the API rejects the operation; the UI does not pretend the live state changed. Metrics begin after the feature is deployed and are not reconstructed from historical logs.

## Authentication and secret handling

Sign-in requires both the backend HTTPS origin and the dedicated `INDOONE_CONTROL_CENTER_ADMIN_TOKEN` configured on the backend server. The token is sent in an `Authorization: Bearer` header to the entered origin only. It stays in component memory, is not saved to local storage, and disappears when the page is refreshed.

**Never** put the admin token, provider credentials, passwords, or signing keys in a `VITE_*` variable or source file. Frontend build variables are public. Configure the backend's `INDOONE_ALLOWED_ORIGINS` with the exact dashboard origin; for GitHub Pages this is normally `https://indooneteam.github.io`. Do not use wildcard CORS origins in production.

The GitHub Pages site is public hosting. Backend data or settings are protected only because the server validates the dedicated admin token; `noindex` is not security.

## GitHub Pages deployment

The `.github/workflows/deploy-pages.yml` workflow builds and publishes `dist/` when changes are pushed to `main`.

1. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Ensure the backend has the dedicated Control Center token configured and allows the exact Pages origin.
3. Merge the reviewed frontend PR; wait for the **Deploy Web App** workflow to finish green.
4. Open the published site, enter the backend HTTPS origin and admin token, and confirm live status/metrics load.

The repository branch/PR CI does not by itself configure or deploy the backend server. Server environment changes and a backend service restart are separate deployment steps.

## Stack

- React + TypeScript
- Vite
- GitHub Actions + GitHub Pages
