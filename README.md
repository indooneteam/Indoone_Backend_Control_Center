# Indoone Backend Control Center — Web

Responsive React + TypeScript admin workspace for Indoone platform monitoring and controls.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Vite prints the local URL. To test the backend connection, set `VITE_INDOONE_API_BASE_URL` in `.env.local` to the backend origin (for example, `https://your-backend.example`) and restart Vite.

## Validate changes

```bash
npm run test:smoke
npm test
npm run typecheck
npm run build
```

The production bundle is emitted to `dist/`.

## GitHub Pages deployment

The `.github/workflows/deploy-pages.yml` workflow builds the React/Vite app, runs source checks and TypeScript validation, and publishes `dist/` to GitHub Pages on each push to `main`. It can also be run manually from Actions.

In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. A green deployment check means the artifact was published; verify the public URL in a browser after deployment.

## Backend connection

The Settings page offers a read-only `GET /health` check against the configured `VITE_INDOONE_API_BASE_URL`. It omits browser credentials and does not change backend state.

For browser health checks to work, the backend must allow the Pages origin (including `https://indooneteam.github.io`) in its CORS configuration. The exact allowed-origin value must be configured on the backend deployment; it is not stored in this frontend repository.

## Authentication and live controls

- The login form is currently a UI preview. It deliberately does not submit, save, or authenticate the entered password.
- The existing Indoone backend validates Firebase ID tokens or signed bearer tokens, but repository inspection did not find an administrator email/password login endpoint.
- Dashboard metrics are sample data. AI/platform switches affect only local preview state and do not control production services.
- Before enabling real admin controls, implement server-side admin authentication and role-based authorization, then protected API endpoints for reading status and applying each control.
- Never put passwords, API secrets, signing keys, or other private values in frontend environment variables. Values prefixed with `VITE_` become visible in the public browser bundle.
- The `noindex` meta tag is not an access-control mechanism. A public Pages URL must not be treated as a secured admin interface until authentication is implemented.

## Stack

- React + TypeScript
- Vite
- GitHub Actions + GitHub Pages
