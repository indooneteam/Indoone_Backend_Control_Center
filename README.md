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
npm run typecheck
npm run build
```

## Current status

- Responsive sign-in screen UI is present.
- The dashboard is a **local preview only**. Channel switches and sample metrics are not connected to production services.
- No credentials are stored or transmitted. Sign-in intentionally reports that backend authentication is not connected.
- Next integration phase: implement server-side admin authentication, secure sessions, and authorized API endpoints before enabling real controls.
- Never place API keys, passwords, session secrets, or production environment values in this repository or browser code.
