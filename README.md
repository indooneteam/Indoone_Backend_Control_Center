# Indoone Backend Control Center — Web

A responsive React + TypeScript web dashboard foundation for monitoring and administering Indoone channels.

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Validation

```bash
npm run test:smoke
npm run typecheck
npm run build
```

The production build is written to `dist/`. Asset paths are relative to support static hosting from a project subpath.

## GitHub Pages setup

The production workflow is `.github/workflows/deploy-pages.yml`. During setup it is intentionally manual-only, so it will not attempt a deployment before Pages is configured correctly.

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, select **GitHub Actions** (not “Deploy from a branch”).
3. After changing the source, the deployment workflow can be run from **Actions → Deploy Web App → Run workflow**. A later commit will enable automatic deployment on pushes after that first successful run.

Repository access currently permits code pushes but not Pages settings changes, so the source selection must be made by a repository administrator.

## Current app status and security

- Responsive sign-in screen and dashboard preview are present.
- The login form is not connected to an authentication server. Submitting it shows a notice; no credentials are stored or transmitted.
- Dashboard metrics are sample data. Channel and AI switches change local preview state only and do not control production services.
- Admin UI is marked `noindex`; this does not replace authentication or access control.
- The next integration phase is server-side admin authentication, secure sessions, and authorized API endpoints before enabling live controls.
- Never place API keys, passwords, session secrets, or production environment values in this repository or browser code.
