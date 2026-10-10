# Indoone Control Gateway

This service lives in the existing `Indoone_Backend_Control_Center` repository alongside the React dashboard. It is a separate **runtime service**, not code that runs inside GitHub Pages.

## Current foundation stage

- Health endpoints: `GET /health/live`, `GET /health/ready`.
- Protected control API using the same API contract as the dashboard:
  - `GET /api/control-center/status`
  - `PATCH /api/control-center/settings`
  - `GET /api/control-center/metrics`
  - `GET /api/control-center/activity`
- Persistent SQLite settings and metadata-only activity events.
- All global and per-channel intake/reply controls default to **OFF** on a new database.
- Admin authentication uses the server-side `INDOONE_CONTROL_CENTER_ADMIN_TOKEN`.
- Container health check and non-root runtime user.

**Important:** this foundation does not yet proxy incoming provider/app requests or enforce outbound reply gating. Do not point live Meta webhooks or production app traffic at it until the ingress gate, provider signature validation, egress reply gate, and integration tests are implemented and reviewed.

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

For persistent state, mount a durable volume at `/data`. Set `INDOONE_CONTROL_CENTER_ADMIN_TOKEN` through the hosting platform's secret manager/environment settings. Never commit the token or place it in a `VITE_*` frontend variable.

The dashboard can keep calling the same `/api/control-center/*` paths once its API origin is configured to the gateway's HTTPS origin. For now, keep the backend origin pointed at the current backend and do not change any live DNS/webhook settings.
