import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_BASE_URL, isApiBaseUrlValid } from "./lib/api";
import {
  controlCenterRequest,
  type ChannelMetrics,
  type ControlCenterActivity,
  type ControlCenterMetrics,
  type ControlCenterState,
  type ControlChannel,
  type ControlSettingsPatch
} from "./lib/controlCenterApi";

type AdminSession = { baseUrl: string; token: string };

const channelInfo: { id: ControlChannel; name: string; description: string }[] = [
  { id: "whatsapp", name: "WhatsApp", description: "Incoming WhatsApp Business webhooks" },
  { id: "instagram", name: "Instagram", description: "Incoming Instagram messaging events" },
  { id: "telegram", name: "Telegram", description: "Incoming bot updates" },
  { id: "android", name: "Android App", description: "Indoone mobile API requests" }
];

function emptyMetrics(): ChannelMetrics {
  return {
    requests: { total: 0, success: 0, failed: 0, blocked: 0 },
    replies: { sent: 0, failed: 0, skipped: 0 }
  };
}

function Toggle({
  checked,
  label,
  disabled = false,
  onChange
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={"cc-toggle" + (checked ? " is-on" : "")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function SignIn({ onConnected }: {
  onConnected: (session: AdminSession, state: ControlCenterState) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(API_BASE_URL);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    if (!isApiBaseUrlValid(normalizedUrl)) {
      setError("Enter the backend HTTPS origin, with no path or credentials.");
      return;
    }
    if (!token.trim()) {
      setError("Enter the Control Center admin token configured on your backend server.");
      return;
    }

    setBusy(true);
    try {
      const state = await controlCenterRequest<ControlCenterState>(
        normalizedUrl,
        token,
        "/api/control-center/status"
      );
      onConnected({ baseUrl: normalizedUrl, token }, state);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not connect to the backend.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cc-auth-screen">
      <div className="cc-auth-glow" />
      <section className="cc-auth-card">
        <div className="cc-brand"><span className="cc-brand-mark">i</span><div><strong>indoone</strong><small>BACKEND CONTROL CENTER</small></div></div>
        <p className="cc-eyebrow"><span className="cc-live-dot" /> PROTECTED ADMIN ACCESS</p>
        <h1>Control your platform.</h1>
        <p className="cc-muted">Connect to your running Indoone backend to manage request intake, replies, and live channel activity.</p>
        <form className="cc-form" onSubmit={submit}>
          <label htmlFor="cc-backend-url">Backend HTTPS origin</label>
          <input
            id="cc-backend-url"
            type="url"
            autoComplete="url"
            placeholder="https://api.your-domain.example"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            required
          />
          <label htmlFor="cc-admin-token">Control Center admin token</label>
          <input
            id="cc-admin-token"
            type="password"
            autoComplete="current-password"
            placeholder="Enter the server-configured token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
          <p className="cc-hint">The token stays in this page's memory only. It is not written to browser storage or sent to any URL outside the backend origin above.</p>
          {error && <p className="cc-error" role="alert">{error}</p>}
          <button className="cc-button cc-button-primary cc-full" type="submit" disabled={busy}>
            {busy ? "Verifying access…" : "Connect securely"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <div className="cc-auth-foot"><span>HTTPS only</span><span>Server-side authorization</span><span>No saved token</span></div>
      </section>
    </main>
  );
}

function Metric({ label, value, kind = "" }: { label: string; value: number; kind?: string }) {
  return (
    <div className={"cc-metric " + kind}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export default function LiveControlCenter() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [controls, setControls] = useState<ControlCenterState | null>(null);
  const [metrics, setMetrics] = useState<ControlCenterMetrics | null>(null);
  const [activity, setActivity] = useState<ControlCenterActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const [nextControls, nextMetrics, nextActivity] = await Promise.all([
        controlCenterRequest<ControlCenterState>(session.baseUrl, session.token, "/api/control-center/status"),
        controlCenterRequest<ControlCenterMetrics>(session.baseUrl, session.token, "/api/control-center/metrics"),
        controlCenterRequest<ControlCenterActivity>(session.baseUrl, session.token, "/api/control-center/activity?limit=50")
      ]);
      setControls(nextControls);
      setMetrics(nextMetrics);
      setActivity(nextActivity);
      setNotice("Live control state and metrics refreshed from the backend.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load live dashboard data.";
      setError(message);
      if (/authentication failed/i.test(message)) {
        setSession(null);
        setControls(null);
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  async function updateSettings(patch: ControlSettingsPatch) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await controlCenterRequest<ControlCenterState>(
        session.baseUrl,
        session.token,
        "/api/control-center/settings",
        { method: "PATCH", body: patch }
      );
      setControls(next);
      setNotice("Backend confirmed the settings update.");
      const [nextMetrics, nextActivity] = await Promise.all([
        controlCenterRequest<ControlCenterMetrics>(session.baseUrl, session.token, "/api/control-center/metrics"),
        controlCenterRequest<ControlCenterActivity>(session.baseUrl, session.token, "/api/control-center/activity?limit=50")
      ]);
      setMetrics(nextMetrics);
      setActivity(nextActivity);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Settings update failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleChannel(channel: ControlChannel, field: "intake_enabled" | "reply_enabled") {
    if (!controls) return;
    const current = controls.controls.channels[channel][field];
    const channels: ControlSettingsPatch["channels"] = { [channel]: { [field]: !current } };
    void updateSettings({ channels });
  }

  function signOut() {
    setSession(null);
    setControls(null);
    setMetrics(null);
    setActivity(null);
    setError("");
    setNotice("");
    setBusy(false);
  }

  if (!session || !controls) {
    return <SignIn onConnected={(nextSession, nextState) => {
      setSession(nextSession);
      setControls(nextState);
      setMetrics(null);
      setActivity(null);
      setError("");
    }} />;
  }

  const totals = metrics?.totals ?? emptyMetrics();

  return (
    <main className="cc-shell">
      <aside className="cc-sidebar">
        <div className="cc-brand"><span className="cc-brand-mark">i</span><div><strong>indoone</strong><small>BACKEND CONTROL CENTER</small></div></div>
        <div className="cc-side-caption">WORKSPACE</div>
        <div className="cc-workspace"><span>I</span><div><strong>Indoone Main</strong><small>Live backend</small></div></div>
        <div className="cc-side-caption">MANAGEMENT</div>
        <a className="cc-nav-item selected" href="#overview"><span>▦</span> Overview</a>
        <a className="cc-nav-item" href="#channels"><span>⌘</span> App controls</a>
        <a className="cc-nav-item" href="#activity"><span>↗</span> Activity log</a>
        <div className="cc-sidebar-bottom">
          <div className="cc-safe-note"><span>◇</span><div><strong>Server stays online</strong><small>Request intake can be resumed here.</small></div></div>
          <button className="cc-button cc-button-outline cc-full" type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <section className="cc-main">
        <header className="cc-topbar">
          <div><span className="cc-muted">Control Center</span><span className="cc-slash">/</span><strong>Live overview</strong></div>
          <div className="cc-top-actions"><span className="cc-connected"><i /> Backend connected</span><button className="cc-button cc-button-outline" type="button" disabled={loading || busy} onClick={() => void refresh()}>{loading ? "Refreshing…" : "↻ Refresh"}</button></div>
        </header>

        <div className="cc-content" id="overview">
          <div className="cc-page-heading">
            <div><p className="cc-eyebrow">LIVE SERVER MANAGEMENT</p><h1>System overview<span>.</span></h1><p className="cc-muted">Real request intake, reply status, and channel controls.</p></div>
            <span className="cc-live-badge"><i /> Live data</span>
          </div>

          {error && <div className="cc-message cc-message-error" role="alert"><strong>Action needs attention</strong><span>{error}</span></div>}
          {notice && <div className="cc-message cc-message-ok" role="status"><strong>Confirmed</strong><span>{notice}</span></div>}

          <section className="cc-global-grid" aria-label="Global controls">
            <article className={"cc-global-card " + (!controls.controls.global_intake_enabled ? "paused" : "")}>
              <div className="cc-global-card-head"><span className="cc-control-icon">Ⅱ</span><span className={"cc-state-pill " + (controls.controls.global_intake_enabled ? "on" : "off")}>{controls.controls.global_intake_enabled ? "ACTIVE" : "PAUSED"}</span></div>
              <h2>All app request intake</h2>
              <p>{controls.controls.global_intake_enabled ? "Apps can send requests to the backend." : "Application handlers are paused across all channels. The control panel remains online."}</p>
              <button
                className={"cc-button " + (controls.controls.global_intake_enabled ? "cc-button-danger" : "cc-button-primary")}
                type="button"
                disabled={busy}
                onClick={() => void updateSettings({ global_intake_enabled: !controls.controls.global_intake_enabled })}
              >{controls.controls.global_intake_enabled ? "Pause all app requests" : "Resume all app requests"}</button>
            </article>
            <article className={"cc-global-card " + (!controls.controls.global_replies_enabled ? "paused" : "")}>
              <div className="cc-global-card-head"><span className="cc-control-icon ai">✳</span><span className={"cc-state-pill " + (controls.controls.global_replies_enabled ? "on" : "off")}>{controls.controls.global_replies_enabled ? "ACTIVE" : "PAUSED"}</span></div>
              <h2>All AI replies</h2>
              <p>{controls.controls.global_replies_enabled ? "Channel replies follow their individual settings." : "Automated AI replies are disabled for every channel."}</p>
              <button
                className={"cc-button " + (controls.controls.global_replies_enabled ? "cc-button-danger" : "cc-button-primary")}
                type="button"
                disabled={busy}
                onClick={() => void updateSettings({ global_replies_enabled: !controls.controls.global_replies_enabled })}
              >{controls.controls.global_replies_enabled ? "Pause all AI replies" : "Resume all AI replies"}</button>
            </article>
          </section>

          <section className="cc-section">
            <div className="cc-section-heading"><div><h2>Last 24 hours</h2><p className="cc-muted">Totals reported by the backend</p></div><span className="cc-window-pill">{metrics ? "Updated live" : loading ? "Loading…" : "Waiting for data"}</span></div>
            <div className="cc-total-grid">
              <Metric label="Requests received" value={totals.requests.total} />
              <Metric label="Request success" value={totals.requests.success} kind="success" />
              <Metric label="Request failures" value={totals.requests.failed} kind="failure" />
              <Metric label="Request blocked" value={totals.requests.blocked} kind="warning" />
              <Metric label="Replies sent" value={totals.replies.sent} kind="success" />
              <Metric label="Reply failures" value={totals.replies.failed} kind="failure" />
              <Metric label="Replies skipped" value={totals.replies.skipped} kind="warning" />
            </div>
          </section>

          <section className="cc-section" id="channels">
            <div className="cc-section-heading"><div><h2>App-by-app controls</h2><p className="cc-muted">Request intake and AI replies are independent per app.</p></div></div>
            <div className="cc-channel-grid">
              {channelInfo.map((channel) => {
                const state = controls.controls.channels[channel.id];
                const data = metrics?.channels[channel.id] ?? emptyMetrics();
                return (
                  <article className="cc-channel-card" key={channel.id}>
                    <div className="cc-channel-head"><span className={"cc-channel-icon " + channel.id}>{channel.name.slice(0, 1)}</span><div><h3>{channel.name}</h3><p>{channel.description}</p></div></div>
                    <div className="cc-toggle-row"><div><strong>Accept requests</strong><small>{state.effective_intake_enabled ? "Backend intake enabled" : "Backend intake paused"}</small></div><Toggle checked={state.intake_enabled} label={channel.name + " request intake"} disabled={busy} onChange={() => toggleChannel(channel.id, "intake_enabled")} /></div>
                    <div className="cc-toggle-row"><div><strong>Send AI replies</strong><small>{state.effective_reply_enabled ? "Automated replies enabled" : "Automated replies paused"}</small></div><Toggle checked={state.reply_enabled} label={channel.name + " AI replies"} disabled={busy} onChange={() => toggleChannel(channel.id, "reply_enabled")} /></div>
                    <div className="cc-channel-metrics">
                      <div><small>Requests</small><strong>{data.requests.total.toLocaleString()}</strong></div>
                      <div><small>Failed</small><strong className="is-failure">{data.requests.failed.toLocaleString()}</strong></div>
                      <div><small>Blocked</small><strong>{data.requests.blocked.toLocaleString()}</strong></div>
                      <div><small>Replies sent</small><strong className="is-success">{data.replies.sent.toLocaleString()}</strong></div>
                      <div><small>Reply failed</small><strong className="is-failure">{data.replies.failed.toLocaleString()}</strong></div>
                      <div><small>Reply skipped</small><strong>{data.replies.skipped.toLocaleString()}</strong></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="cc-section" id="activity">
            <div className="cc-section-heading"><div><h2>Recent activity</h2><p className="cc-muted">Request/reply outcomes only; message content is not stored here.</p></div></div>
            <div className="cc-activity-card">
              {!activity?.events.length ? (
                <div className="cc-empty">{loading ? "Loading activity…" : "No tracked events yet. Metrics will appear as backend requests are received."}</div>
              ) : (
                <div className="cc-activity-table-wrap">
                  <table className="cc-activity-table">
                    <thead><tr><th>App</th><th>Event</th><th>Result</th><th>Route</th><th>HTTP</th><th>Time</th></tr></thead>
                    <tbody>
                      {activity.events.map((event, index) => (
                        <tr key={event.created_at + event.channel + event.event_type + event.path + index}>
                          <td>{channelInfo.find((item) => item.id === event.channel)?.name ?? event.channel}</td>
                          <td>{event.event_type === "request" ? "Request" : "AI reply"}</td>
                          <td><span className={"cc-result " + event.status}>{event.status}</span></td>
                          <td className="cc-route">{event.path}</td>
                          <td>{event.http_status ?? "—"}</td>
                          <td>{new Date(event.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <footer className="cc-footer"><span>© 2026 Indoone · Live Control Center</span><span>Server process remains online during intake pause.</span></footer>
        </div>
      </section>
    </main>
  );
}
