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

## Current status

- Responsive sign-in screen and dashboard preview are present.
- The login form is not connected to an authentication server. Submitting it shows a notice; no credentials are stored or transmitted.
- Dashboard metrics are sample data. Channel and AI switches change local preview state only and do not control production services.
- Admin UI is marked `noindex`; this does not replace authentication or access control.
- Next integration phase: implement server-side admin authentication, secure sessions, and authorized API endpoints before enabling live controls.
- Never place API keys, passwords, session secrets, or production environment values in this repository or browser code.
