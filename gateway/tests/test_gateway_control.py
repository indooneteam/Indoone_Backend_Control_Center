import hashlib
import hmac

from fastapi.responses import JSONResponse
import hashlib
import hmac

from fastapi.responses import JSONResponse, Response
from fastapi.testclient import TestClient

from gateway import main as gateway_main

from gateway import main as gateway_main
from gateway.main import app

TOKEN = "test-control-gateway-admin-token-123456789"


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("GATEWAY_DB_PATH", str(tmp_path / "gateway.sqlite3"))
    monkeypatch.setenv("INDOONE_CONTROL_CENTER_ADMIN_TOKEN", TOKEN)
    return TestClient(gateway_main.app)


def _auth():
    return {"Authorization": f"Bearer {TOKEN}"}


def test_health_and_ready(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/health/ready").status_code == 200


def test_admin_routes_require_dedicated_token(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert client.get("/api/control-center/status").status_code == 401
    assert client.get(
        "/api/control-center/status",
        headers={"Authorization": "Bearer wrong-token"},
    ).status_code == 401
    response = client.get("/api/control-center/status", headers=_auth())
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_default_state_is_off_and_settings_persist(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    initial = client.get("/api/control-center/status", headers=_auth()).json()["controls"]
    assert initial["global_intake_enabled"] is False
    assert initial["global_replies_enabled"] is False
    for channel in ("whatsapp", "instagram", "telegram", "android"):
        assert initial["channels"][channel]["intake_enabled"] is False
        assert initial["channels"][channel]["reply_enabled"] is False

    update = client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={"global_intake_enabled": True, "channels": {"whatsapp": {"intake_enabled": True, "reply_enabled": True}}},
    )
    assert update.status_code == 200
    client2 = TestClient(gateway_main.app)
    state = client2.get("/api/control-center/status", headers=_auth()).json()["controls"]
    assert state["channels"]["whatsapp"]["intake_enabled"] is True
    assert state["channels"]["instagram"]["intake_enabled"] is False


def test_invalid_settings_and_metrics_limits_are_rejected(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    invalid = client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={"channels": {"whatsapp": {"intake_enabled": "on"}}},
    )
    assert invalid.status_code == 422
    assert client.get("/api/control-center/metrics?window_hours=0", headers=_auth()).status_code == 422
    assert client.get("/api/control-center/activity?limit=500", headers=_auth()).status_code == 422


def test_metrics_shape_matches_existing_dashboard(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    activity = client.get("/api/control-center/activity", headers=_auth()).json()
    assert set(metrics["channels"]) == {"whatsapp", "instagram", "telegram", "android"}
    assert metrics["channels"]["whatsapp"]["requests"]["total"] == 0
    assert activity == {"status": "ok", "events": []}


def test_app_request_is_blocked_before_backend_when_intake_is_off(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("GATEWAY_BACKEND_ORIGIN", "https://backend.example")
    called = False

    async def should_not_forward(request):
        nonlocal called
        called = True
        return JSONResponse({"unexpected": "forwarded"}, status_code=200)

    monkeypatch.setattr(gateway_main, "_forward_request", should_not_forward)
    response = client.post("/api/chat", json={"message": "hello"})
    assert response.status_code == 503
    assert response.json()["code"] == "APP_INTAKE_PAUSED"
    assert called is False

    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["android"]["requests"]["blocked"] == 1


def test_signed_whatsapp_webhook_is_acknowledged_without_forward_when_off(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("GATEWAY_BACKEND_ORIGIN", "https://backend.example")
    monkeypatch.setenv("INDOONE_WHATSAPP_APP_SECRET", "test-meta-app-secret")
    called = False

    async def should_not_forward(request):
        nonlocal called
        called = True
        return JSONResponse({"unexpected": "forwarded"}, status_code=200)

    monkeypatch.setattr(gateway_main, "_forward_request", should_not_forward)
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    signature = "sha256=" + hmac.new(
        b"test-meta-app-secret", body, hashlib.sha256
    ).hexdigest()
    response = client.post(
        "/api/integrations/whatsapp/webhook",
        content=body,
        headers={"X-Hub-Signature-256": signature},
    )
    assert response.status_code == 200
    assert response.json()["processed"] is False
    assert response.json()["reason"] == "intake_paused"
    assert called is False

    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["whatsapp"]["requests"]["blocked"] == 1


def test_invalid_meta_signature_is_rejected_when_off(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_WHATSAPP_APP_SECRET", "test-meta-app-secret")
    response = client.post(
        "/api/integrations/whatsapp/webhook",
        content=b'{"entry":[]}',
        headers={"X-Hub-Signature-256": "sha256=invalid"},
    )
    assert response.status_code == 403


def test_whatsapp_off_does_not_block_other_enabled_channel(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("GATEWAY_BACKEND_ORIGIN", "https://backend.example")
    client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={
            "global_intake_enabled": True,
            "global_replies_enabled": True,
            "channels": {
                "whatsapp": {"intake_enabled": False},
                "android": {"intake_enabled": True, "reply_enabled": True},
            },
        },
    )
    forwarded = []

    async def fake_forward(request):
        forwarded.append(request.url.path)
        return JSONResponse({"ok": True}, status_code=200)

    monkeypatch.setattr(gateway_main, "_forward_request", fake_forward)
    monkeypatch.setenv("INDOONE_WHATSAPP_APP_SECRET", "test-meta-app-secret")
    body = b'{"entry":[]}'
    signature = "sha256=" + hmac.new(
        b"test-meta-app-secret", body, hashlib.sha256
    ).hexdigest()
    blocked = client.post(
        "/api/integrations/whatsapp/webhook",
        content=body,
        headers={"X-Hub-Signature-256": signature},
    )
    allowed = client.post("/api/chat", json={"message": "hello"})
    assert blocked.status_code == 200
    assert blocked.json()["reason"] == "intake_paused"
    assert allowed.status_code == 200
    assert forwarded == ["/api/chat"]



SERVICE_TOKEN = "test-gateway-backend-service-token-1234567890"


def _enable_replies(client, channels):
    return client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={"global_replies_enabled": True, "channels": channels},
    )


def _egress_payload(target_url="https://graph.facebook.com/v23.0/123456789/messages"):
    return {
        "target_url": target_url,
        "headers": {
            "Authorization": "Bearer provider-test-token",
            "Content-Type": "application/json",
        },
        "json": {
            "messaging_product": "whatsapp",
            "to": "15551234567",
            "type": "text",
            "text": {"body": "test"},
        },
    }


def test_internal_egress_requires_private_service_token(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    response = client.post("/internal/egress/whatsapp", json=_egress_payload())
    assert response.status_code == 401


def test_reply_off_blocks_provider_call_at_gateway(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    _enable_replies(client, {"whatsapp": {"reply_enabled": False}})
    called = False

    async def should_not_send(channel, target_url, headers, payload):
        nonlocal called
        called = True
        return Response(content=b'{"ok":true}', status_code=200, media_type="application/json")

    monkeypatch.setattr(gateway_main, "_send_provider_request", should_not_send)
    response = client.post(
        "/internal/egress/whatsapp",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
        json=_egress_payload(),
    )
    assert response.status_code == 423
    assert response.json()["reason"] == "replies_paused"
    assert called is False

    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["whatsapp"]["replies"]["skipped"] == 1


def test_reply_on_allows_only_approved_whatsapp_provider_target(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    _enable_replies(client, {"whatsapp": {"reply_enabled": True}})
    called = []

    async def fake_send(channel, target_url, headers, payload):
        called.append((channel, target_url, payload))
        return Response(
            content=b'{"messages":[{"id":"provider-message-id"}]}',
            status_code=200,
            media_type="application/json",
        )

    monkeypatch.setattr(gateway_main, "_send_provider_request", fake_send)
    response = client.post(
        "/internal/egress/whatsapp",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
        json=_egress_payload(),
    )
    assert response.status_code == 200
    assert len(called) == 1
    assert called[0][0] == "whatsapp"
    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["whatsapp"]["replies"]["sent"] == 1


def test_egress_rejects_non_provider_target(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    _enable_replies(client, {"whatsapp": {"reply_enabled": True}})
    response = client.post(
        "/internal/egress/whatsapp",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
        json=_egress_payload("https://evil.example/capture"),
    )
    assert response.status_code == 422



def test_internal_reply_preflight_requires_service_token(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    response = client.post("/internal/replies/check/whatsapp")
    assert response.status_code == 401


def test_reply_preflight_skips_before_ai_when_replies_are_off(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_GATEWAY_BACKEND_TOKEN", SERVICE_TOKEN)
    response = client.post(
        "/internal/replies/check/whatsapp",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
    )
    assert response.status_code == 200
    assert response.json()["allowed"] is False
    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["whatsapp"]["replies"]["skipped"] == 1


def test_android_ai_chat_is_stopped_before_backend_when_replies_are_off(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("GATEWAY_BACKEND_ORIGIN", "https://backend.example")
    client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={
            "global_intake_enabled": True,
            "channels": {"android": {"intake_enabled": True}},
        },
    )
    called = False

    async def should_not_forward(request):
        nonlocal called
        called = True
        return JSONResponse({"unexpected": "AI was called"}, status_code=200)

    monkeypatch.setattr(gateway_main, "_forward_request", should_not_forward)
    response = client.post("/api/chat", json={"message": "hello"})
    assert response.status_code == 423
    assert response.json()["code"] == "APP_REPLIES_PAUSED"
    assert called is False



def test_whatsapp_delivery_callbacks_are_deduplicated_while_intake_is_off(tmp_path, monkeypatch):
    import hashlib
    import hmac
    import json

    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_WHATSAPP_APP_SECRET", "test-meta-app-secret")
    body = json.dumps(
        {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "statuses": [
                                    {"id": "wamid-delivered-test-1", "status": "delivered"},
                                    {"id": "wamid-failed-test-2", "status": "failed"},
                                ]
                            },
                        }
                    ]
                }
            ],
        },
        separators=(",", ":"),
    ).encode()
    signature = "sha256=" + hmac.new(
        b"test-meta-app-secret", body, hashlib.sha256
    ).hexdigest()
    headers = {"X-Hub-Signature-256": signature}
    first = client.post("/api/integrations/whatsapp/webhook", content=body, headers=headers)
    second = client.post("/api/integrations/whatsapp/webhook", content=body, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["reason"] == "intake_paused"

    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["whatsapp"]["replies"]["delivered"] == 1
    assert metrics["channels"]["whatsapp"]["replies"]["delivery_failed"] == 1


def test_instagram_delivery_callback_is_counted_when_intake_is_off(tmp_path, monkeypatch):
    import hashlib
    import hmac
    import json

    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("INDOONE_INSTAGRAM_APP_SECRET", "test-instagram-app-secret")
    body = json.dumps(
        {
            "object": "instagram",
            "entry": [{"messaging": [{"delivery": {"mids": ["ig-message-delivered-1"]}}]}],
        },
        separators=(",", ":"),
    ).encode()
    signature = "sha256=" + hmac.new(
        b"test-instagram-app-secret", body, hashlib.sha256
    ).hexdigest()
    response = client.post(
        "/api/integrations/instagram/webhook",
        content=body,
        headers={"X-Hub-Signature-256": signature},
    )
    assert response.status_code == 200
    metrics = client.get("/api/control-center/metrics", headers=_auth()).json()
    assert metrics["channels"]["instagram"]["replies"]["delivered"] == 1



def test_gateway_proxy_streams_request_and_response_without_compression_header(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("GATEWAY_BACKEND_ORIGIN", "http://127.0.0.1:8000")
    client.patch(
        "/api/control-center/settings",
        headers=_auth(),
        json={"global_intake_enabled": True, "channels": {"android": {"intake_enabled": True}}},
    )

    captured = {}

    class FakeUpstream:
        status_code = 200
        headers = {
            "content-type": "text/event-stream",
            "content-encoding": "gzip",
            "content-length": "999",
            "x-upstream-test": "streaming",
        }

        async def aiter_bytes(self):
            yield b"data: first\n\n"
            yield b"data: second\n\n"

        async def aclose(self):
            captured["upstream_closed"] = True

    class FakeClient:
        def __init__(self, *, timeout, follow_redirects):
            captured["timeout"] = timeout
            self.closed = False

        def build_request(self, method, url, *, content=None, headers=None):
            captured["target"] = url
            captured["method"] = method
            captured["headers"] = headers or {}
            captured["request_streaming"] = hasattr(content, "__aiter__")
            return httpx.Request(method, url, headers=headers, content=content)

        async def send(self, request, *, stream=False):
            captured["stream"] = stream
            captured["forwarded_body"] = b"".join([part async for part in request.stream])
            return FakeUpstream()

        async def aclose(self):
            self.closed = True
            captured["client_closed"] = True

    monkeypatch.setattr(gateway_main.httpx, "AsyncClient", FakeClient)
    response = client.post("/api/test-stream", content=b"payload")
    assert response.status_code == 200
    assert response.text == "data: first\n\ndata: second\n\n"
    assert response.headers["content-type"] == "text/event-stream"
    assert response.headers["x-upstream-test"] == "streaming"
    assert "content-encoding" not in response.headers
    assert "content-length" not in response.headers
    assert captured["target"] == "http://127.0.0.1:8000/api/test-stream"
    assert captured["forwarded_body"] == b"payload"
    assert captured["stream"] is True
    assert captured["request_streaming"] is True
    assert captured["client_closed"] is True
    assert captured["upstream_closed"] is True
