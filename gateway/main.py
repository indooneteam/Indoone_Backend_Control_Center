from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import Body, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

CHANNELS = ("whatsapp", "instagram", "telegram", "android")
EVENT_STATUSES = ("success", "failed", "blocked", "skipped")
EVENT_TYPES = ("request", "reply")
SETTING_DEFAULTS: dict[str, bool] = {
    "global_intake_enabled": False,
    "global_replies_enabled": False,
    **{f"{channel}_intake_enabled": False for channel in CHANNELS},
    **{f"{channel}_reply_enabled": False for channel in CHANNELS},
}
_INITIALIZED_DB_PATH: str | None = None

app = FastAPI(
    title="Indoone Control Gateway",
    version="0.2.0",
    description="Portable, server-side control plane and fail-closed request intake gate.",
)

_allowed_origins = [
    item.strip()
    for item in os.getenv("INDOONE_ALLOWED_ORIGINS", "").split(",")
    if item.strip()
]
if _allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Hub-Signature-256", "X-Telegram-Bot-Api-Secret-Token"],
    )


def _db_path() -> Path:
    configured = os.getenv("GATEWAY_DB_PATH", "").strip()
    return Path(configured) if configured else Path(__file__).parent / "data" / "gateway.sqlite3"


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=15000")
    return db


def initialize_db() -> None:
    """Create persistent state/event tables once per configured database path."""
    global _INITIALIZED_DB_PATH
    path = str(_db_path())
    if _INITIALIZED_DB_PATH == path:
        return
    with closing(_connect()) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS gateway_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL CHECK(setting_value IN ('true', 'false')),
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gateway_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel TEXT NOT NULL,
                event_type TEXT NOT NULL CHECK(event_type IN ('request', 'reply')),
                status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'blocked', 'skipped')),
                path TEXT NOT NULL,
                http_status INTEGER,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_gateway_events_created
                ON gateway_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_gateway_events_channel_created
                ON gateway_events(channel, created_at DESC);
            CREATE TABLE IF NOT EXISTS gateway_deliveries (
                channel TEXT NOT NULL,
                message_hash TEXT NOT NULL,
                first_seen_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sent_at TEXT,
                delivered_at TEXT,
                read_at TEXT,
                failed_at TEXT,
                PRIMARY KEY(channel, message_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_gateway_deliveries_channel_delivered
                ON gateway_deliveries(channel, delivered_at);
            CREATE INDEX IF NOT EXISTS idx_gateway_deliveries_channel_failed
                ON gateway_deliveries(channel, failed_at);
            """
        )
        now = _now()
        for key, value in SETTING_DEFAULTS.items():
            db.execute(
                "INSERT OR IGNORE INTO gateway_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)",
                (key, _db_bool(value), now),
            )
        db.commit()
    _INITIALIZED_DB_PATH = path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_bool(value: bool) -> str:
    return "true" if value else "false"


def _setting(key: str) -> bool:
    initialize_db()
    with closing(_connect()) as db:
        row = db.execute(
            "SELECT setting_value FROM gateway_settings WHERE setting_key = ?", (key,)
        ).fetchone()
    if row is None:
        # Fail closed if a setting is missing or a database migration is incomplete.
        return False
    return str(row["setting_value"]) == "true"


def _save_settings(updates: dict[str, bool]) -> None:
    initialize_db()
    now = _now()
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        for key, value in updates.items():
            db.execute(
                """
                INSERT INTO gateway_settings(setting_key, setting_value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value=excluded.setting_value,
                    updated_at=excluded.updated_at
                """,
                (key, _db_bool(value), now),
            )
        db.commit()


def _state() -> dict[str, Any]:
    global_intake = _setting("global_intake_enabled")
    global_replies = _setting("global_replies_enabled")
    channels: dict[str, dict[str, bool]] = {}
    for channel in CHANNELS:
        intake = _setting(f"{channel}_intake_enabled")
        replies = _setting(f"{channel}_reply_enabled")
        channels[channel] = {
            "intake_enabled": intake,
            "effective_intake_enabled": global_intake and intake,
            "reply_enabled": replies,
            "effective_reply_enabled": global_replies and replies,
        }
    return {
        "status": "ok",
        "controls": {
            "global_intake_enabled": global_intake,
            "global_replies_enabled": global_replies,
            "channels": channels,
        },
    }


def _authorized(request: Request) -> bool:
    expected = os.getenv("INDOONE_CONTROL_CENTER_ADMIN_TOKEN", "").strip()
    authorization = request.headers.get("authorization", "")
    scheme, separator, supplied = authorization.partition(" ")
    return bool(
        len(expected) >= 32
        and separator
        and scheme.lower() == "bearer"
        and supplied.strip()
        and hmac.compare_digest(expected, supplied.strip())
    )


def _require_admin(request: Request) -> None:
    if not _authorized(request):
        raise HTTPException(status_code=401, detail="Control Gateway admin authorization required")


def record_event(
    channel: str,
    event_type: str,
    status: str,
    path: str,
    http_status: int | None = None,
) -> None:
    """Store metadata only; never store request bodies, credentials, or customer IDs."""
    if channel not in CHANNELS or event_type not in EVENT_TYPES or status not in EVENT_STATUSES:
        raise ValueError("invalid event metadata")
    initialize_db()
    with closing(_connect()) as db:
        db.execute(
            """
            INSERT INTO gateway_events(channel, event_type, status, path, http_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (channel, event_type, status, path.strip()[:256] or "/", http_status, _now()),
        )
        db.commit()



def _service_authorized(request: Request) -> bool:
    expected = os.getenv("INDOONE_GATEWAY_BACKEND_TOKEN", "").strip()
    authorization = request.headers.get("authorization", "")
    scheme, separator, supplied = authorization.partition(" ")
    return bool(
        len(expected) >= 32
        and separator
        and scheme.lower() == "bearer"
        and supplied.strip()
        and hmac.compare_digest(expected, supplied.strip())
    )


def _egress_target_allowed(channel: str, target_url: str) -> bool:
    """Strict provider URL allowlist; this endpoint must never become an open proxy."""
    try:
        target = urlsplit(target_url)
        port = target.port
    except ValueError:
        return False
    if (
        target.scheme != "https"
        or not target.hostname
        or target.username
        or target.password
        or target.query
        or target.fragment
        or port not in (None, 443)
    ):
        return False
    if channel == "whatsapp":
        return target.hostname.lower() == "graph.facebook.com" and bool(
            re.fullmatch(r"/v[0-9]+(?:\.[0-9]+)?/[0-9]+/messages", target.path)
        )
    if channel == "instagram":
        return target.hostname.lower() in {"graph.instagram.com", "graph.facebook.com"} and bool(
            re.fullmatch(r"/me/messages", target.path)
        )
    if channel == "telegram":
        return target.hostname.lower() == "api.telegram.org" and bool(
            re.fullmatch(r"/bot[0-9]+:[A-Za-z0-9_-]+/sendMessage", target.path)
        )
    return False


async def _send_provider_request(
    channel: str, target_url: str, headers: dict[str, str], payload: dict[str, Any]
) -> Response:
    safe_headers = {
        key: value
        for key, value in headers.items()
        if key.lower() in {"authorization", "accept", "content-type"}
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            upstream = await client.post(target_url, headers=safe_headers, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="provider request failed at gateway") from exc
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers={"content-type": upstream.headers.get("content-type", "application/json")},
    )

def record_delivery_status(channel: str, provider_message_id: str, status: str) -> None:
    """Keep deduplicated delivery timestamps and a hash, never the provider message ID."""
    if channel not in {"whatsapp", "instagram"}:
        return
    message_id = provider_message_id.strip()
    if not message_id or status not in {"sent", "delivered", "read", "failed"}:
        return
    message_hash = hashlib.sha256(f"{channel}:{message_id}".encode("utf-8")).hexdigest()
    now = _now()
    sent_at = now if status == "sent" else None
    delivered_at = now if status in {"delivered", "read"} else None
    read_at = now if status == "read" else None
    failed_at = now if status == "failed" else None
    initialize_db()
    with closing(_connect()) as db:
        db.execute(
            """
            INSERT INTO gateway_deliveries(
                channel, message_hash, first_seen_at, updated_at,
                sent_at, delivered_at, read_at, failed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel, message_hash) DO UPDATE SET
                updated_at=excluded.updated_at,
                sent_at=COALESCE(gateway_deliveries.sent_at, excluded.sent_at),
                delivered_at=COALESCE(gateway_deliveries.delivered_at, excluded.delivered_at),
                read_at=COALESCE(gateway_deliveries.read_at, excluded.read_at),
                failed_at=COALESCE(gateway_deliveries.failed_at, excluded.failed_at)
            """,
            (channel, message_hash, now, now, sent_at, delivered_at, read_at, failed_at),
        )
        db.commit()


def _record_provider_delivery_callbacks(channel: str, body: bytes) -> None:
    """Parse only provider delivery metadata from a signature-verified webhook."""
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return
    if not isinstance(payload, dict):
        return

    entries = payload.get("entry")
    if not isinstance(entries, list):
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if channel == "whatsapp":
            changes = entry.get("changes")
            if not isinstance(changes, list):
                continue
            for change in changes:
                value = change.get("value") if isinstance(change, dict) else None
                statuses = value.get("statuses") if isinstance(value, dict) else None
                if not isinstance(statuses, list):
                    continue
                for item in statuses:
                    if not isinstance(item, dict):
                        continue
                    record_delivery_status(
                        "whatsapp",
                        str(item.get("id") or ""),
                        str(item.get("status") or "").lower(),
                    )
        elif channel == "instagram":
            events = entry.get("messaging")
            if not isinstance(events, list):
                continue
            for event in events:
                if not isinstance(event, dict):
                    continue
                delivery = event.get("delivery")
                if isinstance(delivery, dict) and isinstance(delivery.get("mids"), list):
                    for message_id in delivery["mids"]:
                        record_delivery_status("instagram", str(message_id or ""), "delivered")


def _empty_metrics() -> dict[str, Any]:
    return {
        "requests": {"total": 0, "success": 0, "failed": 0, "blocked": 0},
        "replies": {
            "sent": 0, "delivered": 0, "failed": 0,
            "delivery_failed": 0, "skipped": 0
        },
    }


def _channel_for_path(path: str) -> str:
    normalized = path.split("?", 1)[0]
    if normalized == "/api/integrations/whatsapp" or normalized.startswith("/api/integrations/whatsapp/") or normalized == "/api/whatsapp" or normalized.startswith("/api/whatsapp/"):
        return "whatsapp"
    if normalized == "/api/integrations/instagram" or normalized.startswith("/api/integrations/instagram/") or normalized == "/api/instagram" or normalized.startswith("/api/instagram/"):
        return "instagram"
    if normalized == "/api/telegram" or normalized.startswith("/api/telegram/"):
        return "telegram"
    # All remaining /api/* paths are app/API traffic. Integration-specific
    # paths above are mapped first so their switches remain independent.
    return "android"


def _is_verification_request(path: str, method: str) -> bool:
    return method.upper() == "GET" and path in {
        "/api/integrations/whatsapp/webhook",
        "/api/integrations/instagram/webhook",
    }


def _webhook_channel(path: str, method: str) -> str | None:
    if method.upper() != "POST":
        return None
    if path == "/api/integrations/whatsapp/webhook":
        return "whatsapp"
    if path == "/api/integrations/instagram/webhook":
        return "instagram"
    if path == "/api/telegram/webhook/incoming":
        return "telegram"
    return None


async def _verify_webhook(request: Request, channel: str, body: bytes) -> None:
    if channel in {"whatsapp", "instagram"}:
        env_name = "INDOONE_WHATSAPP_APP_SECRET" if channel == "whatsapp" else "INDOONE_INSTAGRAM_APP_SECRET"
        secret = os.getenv(env_name, "").strip()
        signature = request.headers.get("x-hub-signature-256", "").strip()
        if not secret:
            raise HTTPException(status_code=503, detail=f"{channel} webhook signature validation is not configured at gateway")
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=403, detail=f"invalid {channel} webhook signature")
        return

    secret = os.getenv("INDOONE_TELEGRAM_WEBHOOK_SECRET", "").strip()
    supplied = request.headers.get("x-telegram-bot-api-secret-token", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Telegram webhook secret validation is not configured at gateway")
    if not supplied or not hmac.compare_digest(secret, supplied):
        raise HTTPException(status_code=403, detail="invalid Telegram webhook secret")


async def _forward_request(request: Request) -> Response:
    """Stream requests and responses through the gateway without buffering full bodies.

    This is important for SSE/chat streaming and larger uploads. Webhook routes that need
    signature verification may have already read request.body(); Starlette then replays the
    cached body through request.stream().
    """
    origin = os.getenv("GATEWAY_BACKEND_ORIGIN", "").strip().rstrip("/")
    if not origin or not origin.startswith(("http://", "https://")):
        raise HTTPException(status_code=503, detail="gateway backend origin is not configured")
    target = origin + request.url.path
    if request.url.query:
        target += "?" + request.url.query
    hop_headers = {
        "host", "content-length", "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
    }
    headers = {k: v for k, v in request.headers.items() if k.lower() not in hop_headers}
    timeout_seconds = float(os.getenv("GATEWAY_PROXY_TIMEOUT_SECONDS", "30"))
    read_timeout_seconds = float(os.getenv("GATEWAY_PROXY_READ_TIMEOUT_SECONDS", "300"))
    timeout = httpx.Timeout(
        connect=timeout_seconds,
        read=read_timeout_seconds,
        write=timeout_seconds,
        pool=timeout_seconds,
    )
    client = httpx.AsyncClient(timeout=timeout, follow_redirects=False)
    try:
        body = None if request.method.upper() in {"GET", "HEAD", "OPTIONS"} else request.stream()
        upstream_request = client.build_request(
            request.method,
            target,
            content=body,
            headers=headers,
        )
        upstream = await client.send(upstream_request, stream=True)
    except (httpx.HTTPError, ValueError) as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="upstream backend unavailable") from exc

    response_hop_headers = {
        "content-length", "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
        # We decode with aiter_bytes(); forwarding content-encoding would be incorrect.
        "content-encoding",
    }
    response_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in response_hop_headers
    }

    async def response_body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        response_body(),
        status_code=upstream.status_code,
        headers=response_headers,
    )


@app.get("/health/live")
async def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready() -> dict[str, str]:
    try:
        initialize_db()
        with closing(_connect()) as db:
            db.execute("SELECT 1").fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="gateway state store unavailable") from exc
    return {"status": "ready"}


@app.get("/api/control-center/status")
async def control_center_status(request: Request) -> dict[str, Any]:
    _require_admin(request)
    return _state()


@app.patch("/api/control-center/settings")
async def control_center_update_settings(
    request: Request,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    _require_admin(request)
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(status_code=422, detail="at least one setting is required")

    allowed_globals = {"global_intake_enabled", "global_replies_enabled"}
    if set(payload) - allowed_globals - {"channels"}:
        raise HTTPException(status_code=422, detail="unknown Control Gateway setting")

    updates: dict[str, bool] = {}
    for key in allowed_globals.intersection(payload):
        if type(payload[key]) is not bool:
            raise HTTPException(status_code=422, detail=f"{key} must be a boolean")
        updates[key] = payload[key]

    if "channels" in payload:
        channel_settings = payload["channels"]
        if not isinstance(channel_settings, dict) or not channel_settings:
            raise HTTPException(status_code=422, detail="channels must be a non-empty object")
        for channel, flags in channel_settings.items():
            if channel not in CHANNELS or not isinstance(flags, dict) or not flags:
                raise HTTPException(status_code=422, detail="unknown channel or invalid channel settings")
            for flag, value in flags.items():
                if flag not in {"intake_enabled", "reply_enabled"} or type(value) is not bool:
                    raise HTTPException(status_code=422, detail=f"invalid setting for {channel}")
                updates[f"{channel}_{flag}"] = value

    if not updates:
        raise HTTPException(status_code=422, detail="at least one setting is required")
    _save_settings(updates)
    return _state()


@app.get("/api/control-center/metrics")
async def control_center_metrics(
    request: Request,
    window_hours: int = Query(default=24, ge=1, le=720),
) -> dict[str, Any]:
    _require_admin(request)
    initialize_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    channels = {channel: _empty_metrics() for channel in CHANNELS}
    with closing(_connect()) as db:
        rows = db.execute(
            """
            SELECT channel, event_type, status, COUNT(*) AS count
            FROM gateway_events
            WHERE created_at >= ?
            GROUP BY channel, event_type, status
            """,
            (cutoff,),
        ).fetchall()
        delivery_rows = db.execute(
            """
            SELECT channel,
                SUM(CASE WHEN delivered_at >= ? THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN failed_at >= ? THEN 1 ELSE 0 END) AS delivery_failed
            FROM gateway_deliveries
            GROUP BY channel
            """,
            (cutoff, cutoff),
        ).fetchall()
    for row in rows:
        channel, event_type, status, count = (
            str(row["channel"]), str(row["event_type"]), str(row["status"]), int(row["count"])
        )
        if channel not in channels:
            continue
        if event_type == "request":
            channels[channel]["requests"]["total"] += count
            if status in {"success", "failed", "blocked"}:
                channels[channel]["requests"][status] += count
        elif event_type == "reply":
            mapped = {"success": "sent", "failed": "failed", "skipped": "skipped"}.get(status)
            if mapped:
                channels[channel]["replies"][mapped] += count
    for row in delivery_rows:
        channel = str(row["channel"])
        if channel in channels:
            channels[channel]["replies"]["delivered"] = int(row["delivered"] or 0)
            channels[channel]["replies"]["delivery_failed"] = int(row["delivery_failed"] or 0)
    totals = _empty_metrics()
    for item in channels.values():
        for key in totals["requests"]:
            totals["requests"][key] += item["requests"][key]
        for key in totals["replies"]:
            totals["replies"][key] += item["replies"][key]
    return {"status": "ok", "window_hours": window_hours, "channels": channels, "totals": totals}


@app.get("/api/control-center/activity")
async def control_center_activity(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    _require_admin(request)
    initialize_db()
    with closing(_connect()) as db:
        rows = db.execute(
            """
            SELECT channel, event_type, status, path, http_status, created_at
            FROM gateway_events
            ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return {
        "status": "ok",
        "events": [
            {
                "channel": str(row["channel"]),
                "event_type": str(row["event_type"]),
                "status": str(row["status"]),
                "path": str(row["path"]),
                "http_status": int(row["http_status"]) if row["http_status"] is not None else None,
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ],
    }


@app.post("/internal/replies/check/{channel}")
async def check_reply_allowed(channel: str, request: Request) -> dict[str, Any]:
    """Backend-only preflight to avoid spending AI tokens when replies are OFF."""
    if channel not in CHANNELS:
        raise HTTPException(status_code=404, detail="unsupported reply channel")
    if not _service_authorized(request):
        raise HTTPException(status_code=401, detail="gateway backend service authorization required")
    allowed = _setting("global_replies_enabled") and _setting(f"{channel}_reply_enabled")
    if not allowed:
        record_event(channel, "reply", "skipped", f"/internal/replies/check/{channel}", 423)
    return {"status": "ok", "channel": channel, "allowed": allowed, "reason": None if allowed else "replies_paused"}


@app.post("/internal/egress/{channel}")
async def controlled_provider_egress(
    channel: str,
    request: Request,
    payload: dict[str, Any] = Body(...),
) -> Response:
    """Authenticated backend-only egress gate for provider reply sends."""
    if channel not in {"whatsapp", "instagram", "telegram"}:
        raise HTTPException(status_code=404, detail="unsupported provider channel")
    if not _service_authorized(request):
        raise HTTPException(status_code=401, detail="gateway backend service authorization required")

    target_url = payload.get("target_url")
    provider_headers = payload.get("headers", {})
    provider_payload = payload.get("json")
    if (
        not isinstance(target_url, str)
        or not isinstance(provider_headers, dict)
        or not all(isinstance(k, str) and isinstance(v, str) for k, v in provider_headers.items())
        or not isinstance(provider_payload, dict)
        or set(payload) != {"target_url", "headers", "json"}
    ):
        raise HTTPException(status_code=422, detail="invalid provider egress payload")
    if not _egress_target_allowed(channel, target_url):
        raise HTTPException(status_code=422, detail="provider target is not allowlisted")

    # Re-check the durable switch immediately before contacting the provider.
    if not _setting("global_replies_enabled") or not _setting(f"{channel}_reply_enabled"):
        record_event(channel, "reply", "skipped", f"/internal/egress/{channel}", 423)
        return JSONResponse({"status": "skipped", "reason": "replies_paused"}, status_code=423)

    try:
        response = await _send_provider_request(channel, target_url, provider_headers, provider_payload)
    except HTTPException as exc:
        record_event(channel, "reply", "failed", f"/internal/egress/{channel}", exc.status_code)
        raise
    status = "success" if 200 <= response.status_code < 300 else "failed"
    try:
        record_event(channel, "reply", status, f"/internal/egress/{channel}", response.status_code)
    except Exception:
        # Do not turn a confirmed provider send into an application error if metrics storage
        # is temporarily unavailable. The request remains visible in gateway logs.
        pass
    return response


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def api_ingress_gate(path: str, request: Request) -> Response:
    full_path = request.url.path
    if full_path.startswith("/api/control-center/"):
        raise HTTPException(status_code=404, detail="unknown Control Center endpoint")
    if _is_verification_request(full_path, request.method):
        # Meta's webhook verification handshake is configuration, not message intake.
        return await _forward_request(request)

    channel = _channel_for_path(full_path)
    webhook_channel = _webhook_channel(full_path, request.method)
    if webhook_channel:
        body = await request.body()
        try:
            await _verify_webhook(request, webhook_channel, body)
        except HTTPException as exc:
            try:
                record_event(channel, "request", "failed", full_path, exc.status_code)
            except Exception:
                pass
            raise
        if webhook_channel in {"whatsapp", "instagram"}:
            try:
                _record_provider_delivery_callbacks(webhook_channel, body)
            except Exception:
                # A metrics parsing/storage failure must not break provider webhook handling.
                pass

    if not _setting("global_intake_enabled") or not _setting(f"{channel}_intake_enabled"):
        if webhook_channel:
            record_event(channel, "request", "blocked", full_path, 200)
            if webhook_channel == "telegram":
                return JSONResponse(
                    {"accepted": True, "processed": False, "reason": "intake_paused"},
                    status_code=200,
                )
            integration = "whatsapp_business" if webhook_channel == "whatsapp" else "instagram"
            return JSONResponse(
                {"integration": integration, "received": True, "processed": False, "reason": "intake_paused"},
                status_code=200,
            )
        record_event(channel, "request", "blocked", full_path, 503)
        return JSONResponse(
            {"code": "APP_INTAKE_PAUSED", "detail": f"{channel} request intake is paused"},
            status_code=503,
        )

    if (
        channel == "android"
        and request.method.upper() == "POST"
        and full_path in {"/api/chat", "/api/platform/chat/stream"}
        and (
            not _setting("global_replies_enabled")
            or not _setting("android_reply_enabled")
        )
    ):
        record_event("android", "request", "blocked", full_path, 423)
        record_event("android", "reply", "skipped", full_path, 423)
        return JSONResponse(
            {"code": "APP_REPLIES_PAUSED", "detail": "Android AI replies are paused"},
            status_code=423,
        )

    try:
        upstream = await _forward_request(request)
    except HTTPException as exc:
        record_event(channel, "request", "failed", full_path, exc.status_code)
        raise
    except Exception as exc:
        record_event(channel, "request", "failed", full_path, 502)
        raise HTTPException(status_code=502, detail="gateway forwarding failed") from exc

    status = "success" if upstream.status_code < 400 else "failed"
    record_event(channel, "request", status, full_path, upstream.status_code)
    return upstream
