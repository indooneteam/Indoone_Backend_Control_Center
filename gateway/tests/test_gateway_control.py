from fastapi.testclient import TestClient

from gateway.main import app

TOKEN = "test-control-gateway-admin-token-123456789"


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("GATEWAY_DB_PATH", str(tmp_path / "gateway.sqlite3"))
    monkeypatch.setenv("INDOONE_CONTROL_CENTER_ADMIN_TOKEN", TOKEN)
    return TestClient(app)


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
    response = client.get(
        "/api/control-center/status",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_default_state_is_off_and_settings_persist(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    headers = {"Authorization": f"Bearer {TOKEN}"}

    initial = client.get("/api/control-center/status", headers=headers).json()["controls"]
    assert initial["global_intake_enabled"] is False
    assert initial["global_replies_enabled"] is False
    for channel in ("whatsapp", "instagram", "telegram", "android"):
        assert initial["channels"][channel]["intake_enabled"] is False
        assert initial["channels"][channel]["reply_enabled"] is False

    update = client.patch(
        "/api/control-center/settings",
        headers=headers,
        json={"channels": {"whatsapp": {"intake_enabled": True, "reply_enabled": True}}},
    )
    assert update.status_code == 200
    assert update.json()["controls"]["channels"]["whatsapp"]["intake_enabled"] is True

    # A new TestClient against the same database simulates a process restart.
    client2 = TestClient(app)
    state = client2.get("/api/control-center/status", headers=headers).json()["controls"]
    assert state["channels"]["whatsapp"]["intake_enabled"] is True
    assert state["channels"]["instagram"]["intake_enabled"] is False


def test_invalid_settings_and_metrics_limits_are_rejected(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    invalid = client.patch(
        "/api/control-center/settings",
        headers=headers,
        json={"channels": {"whatsapp": {"intake_enabled": "on"}}},
    )
    assert invalid.status_code == 422
    assert client.get("/api/control-center/metrics?window_hours=0", headers=headers).status_code == 422
    assert client.get("/api/control-center/activity?limit=500", headers=headers).status_code == 422


def test_metrics_are_shape_compatible_with_current_dashboard(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    metrics = client.get("/api/control-center/metrics", headers=headers).json()
    activity = client.get("/api/control-center/activity", headers=headers).json()
    assert set(metrics["channels"]) == {"whatsapp", "instagram", "telegram", "android"}
    assert metrics["channels"]["whatsapp"]["requests"]["total"] == 0
    assert activity == {"status": "ok", "events": []}
