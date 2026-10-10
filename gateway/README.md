# Indoone Control Gateway

This service lives in the existing `Indoone_Backend_Control_Center` repository alongside the React dashboard. It is a separate **runtime service**, not code that runs inside GitHub Pages.

## Implemented

- Health endpoints: `GET /health/live`, `GET /health/ready`.
- Protected dashboard-compatible control APIs:
  - `GET /api/control-center/status`
  - `PATCH /api/control-center/settings`
  - `GET /api/control-center/metrics`
  - `GET /api/control-center/activity`
- Persistent SQLite settings and metadata-only activity events.
- All global and per-channel intake/reply controls default to **OFF** on a new database.
- Incoming `/api/*` requests are checked at the gateway before forwarding to the configured backend origin.
- App API requests are rejected at the gateway while their effective intake switch is OFF.
- WhatsApp, Instagram, and Telegram webhooks are signature/secret validated at the gateway before an OFF-state acknowledgement is returned. An OFF webhook is not forwarded to the backend.
- Valid, enabled requests are proxied to `GATEWAY_BACKEND_ORIGIN`.
- CORS accepts only exact origins configured in `INDOONE_ALLOWED_ORIGINS`.
- Admin authentication uses the server-side `INDOONE_CONTROL_CENTER_ADMIN_TOKEN`.
- Container health check and non-root runtime user.

## Still required before production

**The outbound reply gate is not implemented yet.** The existing backend's outgoing provider calls may still go directly to Meta or another provider. The reply switch in the control database is persistent and visible, but this gateway version does not yet enforce it on outgoing requests. Do not point live Meta webhooks or production app traffic at this gateway until the outbound gate, backend sender integration, and end-to-end tests are completed.

The gateway must be reachable over HTTPS from apps/providers. It is source code in this repo, but it runs as its own service. GitHub Pages only hosts the dashboard and cannot run this API server.

## Environment

- `INDOONE_CONTROL_CENTER_ADMIN_TOKEN`: at least 32 random characters; server-side secret only.
- `GATEWAY_BACKEND_ORIGIN`: fixed origin of the existing backend, with no path suffix.
- `GATEWAY_DB_PATH`: durable database file path; mount persistent storage.
- `INDOONE_ALLOWED_ORIGINS`: comma-separated exact dashboard origins.
- `INDOONE_WHATSAPP_APP_SECRET`, `INDOONE_INSTAGRAM_APP_SECRET`, `INDOONE_TELEGRAM_WEBHOOK_SECRET`: webhook verification secrets shared with the configured provider integration.

## Local tests

From repository root:

```bash
python -m pip install -r gateway/requirements-dev.txt
python -m compileall -q gateway
python -m pytest -q gateway/tests
```

## Container

Build using the gateway folder as context:

```bash
docker build -t indoone-control-gateway ./gateway
```

For persistent state, mount a durable volume at `/data`. Set environment values through the hosting platform's secret manager. Never commit secrets or put the admin token in a `VITE_*` frontend variable.

The dashboard can use the gateway HTTPS origin and existing `/api/control-center/*` API shape after CORS is configured. Keep production DNS/webhook settings unchanged until end-to-end ingress and egress validation is complete.
