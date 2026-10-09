import { useState, type FormEvent } from "react";
import { API_BASE_URL, checkBackendHealth, isApiBaseUrlValid } from "./lib/api";

type Page = "overview" | "channels" | "activity" | "settings";

type Channel = {
  id: string;
  name: string;
  description: string;
  mark: string;
  tint: string;
  requests: string;
  state: "Connected" | "Setup needed";
};

const initialChannels: Channel[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Business messaging",
    mark: "W",
    tint: "whatsapp",
    requests: "8,240",
    state: "Connected"
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Bot integration",
    mark: "↗",
    tint: "telegram",
    requests: "6,810",
    state: "Connected"
  },
  {
    id: "android",
    name: "Android App",
    description: "Indoone mobile app",
    mark: "◈",
    tint: "android",
    requests: "9,423",
    state: "Connected"
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Messaging integration",
    mark: "◎",
    tint: "instagram",
    requests: "135",
    state: "Setup needed"
  }
];

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "channels", label: "Channels", icon: "⌘" },
  { id: "activity", label: "Activity log", icon: "↗" },
  { id: "settings", label: "Settings", icon: "⚙" }
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"brand" + (compact ? " brand-compact" : "")}>
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="brand-copy">
        <strong>indoone</strong>
        <span>CONTROL CENTER</span>
      </div>
    </div>
  );
}

function Switch({
  checked,
  label,
  onToggle
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={"switch" + (checked ? " switch-on" : "")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}

function LoginScreen({
  onPreview
}: {
  onPreview: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      "Admin authentication is not connected yet. No credentials were sent or saved. Use the design preview to inspect the dashboard."
    );
  }

  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-panel">
        <div className="login-brand"><Brand /></div>
        <div className="login-heading">
          <div className="eyebrow"><span className="status-dot" /> ADMINISTRATOR ACCESS</div>
          <h1>Good to see you<span>.</span></h1>
          <p>Sign in to manage your Indoone services from one secure workspace.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="admin-email">Admin email</label>
          <input
            id="admin-email"
            autoComplete="username"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="password-label">
            <label htmlFor="admin-password">Password</label>
            <span>Authentication pending</span>
          </div>
          <div className="password-input-wrap">
            <input
              id="admin-password"
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="password-visibility"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button className="primary-button login-button" type="submit">
            Sign in <span aria-hidden="true">→</span>
          </button>
          {message && <p className="form-message" role="status">{message}</p>}
        </form>
        <div className="login-divider"><span /> <small>OR</small> <span /></div>
        <button className="secondary-button preview-button" type="button" onClick={onPreview}>
          Open dashboard preview <span aria-hidden="true">↗</span>
        </button>
        <div className="login-security">
          <span aria-hidden="true">◇</span>
          <p>Security comes first. Live sign-in will be enabled after server-side authentication is connected.</p>
        </div>
      </section>
      <aside className="login-aside">
        <div className="aside-topline"><span className="pulse-dot" /> ALL YOUR SERVICES. ONE VIEW.</div>
        <div className="aside-content">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-core">
            <div className="core-logo">i<span>·</span></div>
            <span>INDOONE</span>
          </div>
          <div className="floating-node node-whatsapp"><span className="node-icon whatsapp">W</span><div><b>WhatsApp</b><small>Messaging channel</small></div><i /></div>
          <div className="floating-node node-telegram"><span className="node-icon telegram">↗</span><div><b>Telegram</b><small>Bot integration</small></div><i /></div>
          <div className="floating-node node-android"><span className="node-icon android">◈</span><div><b>Android App</b><small>Mobile platform</small></div><i /></div>
          <div className="floating-node node-ai"><span className="node-icon ai">✳</span><div><b>Indoone AI</b><small>Processing layer</small></div><i /></div>
        </div>
        <div className="aside-footer">
          <div><span className="footer-spark">✳</span><span>One workspace, complete visibility.</span></div>
          <small>WEB ADMIN · PREVIEW BUILD</small>
        </div>
      </aside>
    </main>
  );
}

function StatCard({
  label,
  value,
  change,
  icon,
  tone
}: {
  label: string;
  value: string;
  change: string;
  icon: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span className={"stat-icon " + tone}>{icon}</span>
        <span className="stat-change">{change}</span>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">Compared with previous 24 hours</div>
    </article>
  );
}

function ActivityChart() {
  const heights = [26, 37, 31, 47, 39, 56, 43, 64, 51, 72, 59, 80, 65, 91, 69, 84, 61, 77, 96, 71, 88, 75, 100, 82];
  return (
    <div className="chart-wrap">
      <div className="chart-summary">
        <div><strong>18,492</strong><span>Requests processed</span></div>
        <div className="chart-legend"><span /> Requests / hour</div>
      </div>
      <div className="bar-chart" role="img" aria-label="Sample requests per hour chart">
        {heights.map((height, index) => (
          <span
            className={index > 19 ? "chart-bar chart-bar-bright" : "chart-bar"}
            key={index}
            style={{ height: height + "%" }}
          />
        ))}
      </div>
      <div className="chart-axis"><span>12 AM</span><span>4 AM</span><span>8 AM</span><span>12 PM</span><span>4 PM</span><span>Now</span></div>
    </div>
  );
}

function App() {
  const [isPreview, setIsPreview] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [channelsEnabled, setChannelsEnabled] = useState<Record<string, boolean>>({
    whatsapp: true,
    telegram: true,
    android: true,
    instagram: false
  });
  const [notice, setNotice] = useState("You're viewing sample data. Controls are not connected to the backend.");
  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL);
  const [apiCheck, setApiCheck] = useState<{
    status: "idle" | "checking" | "connected" | "error" | "invalid" | "not-configured";
    message: string;
  }>({
    status: API_BASE_URL ? "idle" : "not-configured",
    message: API_BASE_URL
      ? "No connection request has been sent yet."
      : "Set VITE_INDOONE_API_BASE_URL during the build to test your backend."
  });

  if (!isPreview) {
    return <LoginScreen onPreview={() => setIsPreview(true)} />;
  }

  const selectedLabel = navItems.find((item) => item.id === page)?.label ?? "Overview";
  const currentDateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date()).toUpperCase();
  const channelsOnline = Object.values(channelsEnabled).filter(Boolean).length;

  function showPreviewNotice() {
    setNotice("Preview only — this change is local to this browser and has not changed any live service.");
  }

  async function handleBackendHealthCheck() {
    const baseUrl = apiBaseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      setApiCheck({
        status: "not-configured",
        message: "Enter your backend base URL before testing the connection."
      });
      return;
    }
    if (!isApiBaseUrlValid(baseUrl)) {
      setApiCheck({
        status: "invalid",
        message: "Use an HTTPS origin (or localhost for development), without credentials or extra paths."
      });
      return;
    }

    setApiCheck({ status: "checking", message: "Sending a read-only GET /health request…" });
    try {
      const result = await checkBackendHealth(baseUrl);
      setApiCheck({
        status: "connected",
        message: `Backend health endpoint responded with status: ${result.status}.`
      });
      setNotice("Backend health check succeeded. No server settings were changed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error";
      setApiCheck({ status: "error", message });
      setNotice("Backend health check failed. No production settings were changed.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-avatar">I</div>
          <div><strong>Indoone Main</strong><small>Admin workspace</small></div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <div className="nav-label">MANAGEMENT</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={"nav-item" + (page === item.id ? " nav-item-active" : "")}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.id === "activity" && <span className="nav-count">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <div><strong>Need a hand?</strong><p>Help with your workspace</p><button type="button" onClick={() => setNotice("Help links will be added in a later setup step.")}>Visit help center ↗</button></div>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">IA</div>
          <div className="profile-copy"><strong>Indoone Admin</strong><small>Preview session</small></div>
          <button type="button" className="profile-menu" aria-label="Return to sign-in screen" onClick={() => setIsPreview(false)}>⋯</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Control Center</span><span>/</span><strong>{selectedLabel}</strong></div>
          <div className="topbar-actions">
            <div className="live-indicator"><span /> Preview mode</div>
            <button className="icon-button" type="button" aria-label="Notifications" onClick={() => setNotice("No live notifications are connected in preview mode.")}>♧<i /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-content">
          <div className="preview-banner"><span className="banner-symbol">ⓘ</span><div><strong>Preview mode</strong><span>Metrics are sample data. Controls only change this preview until the secure backend API is connected.</span></div><button type="button" onClick={() => setNotice("Live API connection is the next integration phase.")}>Details ↗</button></div>
          <div className="page-heading">
            <div><div className="eyebrow">{currentDateLabel} <span className="eyebrow-line" /></div><h1>{page === "overview" ? "System overview" : selectedLabel}<span>.</span></h1><p>{page === "overview" ? "A clear view of your services, activity and AI processing." : page === "channels" ? "Preview the controls for each connected platform." : page === "activity" ? "Review the shape of recent platform activity." : "Manage your workspace preferences."}</p></div>
            <button className="date-button" type="button" onClick={() => setNotice("Date filtering will be connected to live analytics later.")}><span>▦</span> Last 24 hours <span className="date-chevron">⌄</span></button>
          </div>

          {page === "overview" && (
            <>
              <div className="stats-grid">
                <StatCard label="Total requests" value="24,608" change="+12.8%" icon="↗" tone="blue" />
                <StatCard label="AI requests" value="18,492" change="+8.4%" icon="✳" tone="purple" />
                <StatCard label="Successful delivery" value="99.2%" change="+0.6%" icon="✓" tone="green" />
                <StatCard label="Channels enabled" value={channelsOnline + " / 4"} change="Preview" icon="⌘" tone="orange" />
              </div>
              <div className="dashboard-grid">
                <section className="panel activity-panel">
                  <div className="panel-heading"><div><h2>Request activity</h2><p>Traffic across all platforms</p></div><button type="button" className="more-button" aria-label="Activity options" onClick={() => setNotice("Chart settings will be available after analytics integration.")}>···</button></div>
                  <ActivityChart />
                </section>
                <section className="panel ai-panel">
                  <div className="panel-heading"><div><h2>AI processing</h2><p>Global processing switch</p></div><span className="ai-badge">✳ AI</span></div>
                  <div className="ai-status-row"><span className={"ai-status-dot" + (aiEnabled ? "" : " ai-status-off")} /><div><strong>{aiEnabled ? "AI processing enabled" : "AI processing disabled"}</strong><small>{aiEnabled ? "Preview setting is ON" : "Preview setting is OFF"}</small></div><Switch checked={aiEnabled} label="Toggle AI processing preview" onToggle={() => { setAiEnabled(!aiEnabled); showPreviewNotice(); }} /></div>
                  <div className="ai-divider" />
                  <div className="ai-metric-row"><span>Requests handled by AI</span><strong>18,492</strong></div>
                  <div className="progress-track"><span style={{ width: "75.1%" }} /></div>
                  <div className="progress-foot"><span>75.1% of all requests</span><span>Sample</span></div>
                  <div className="ai-note"><span>✳</span><p>The real AI switch must be enforced by the backend, not just by this dashboard.</p></div>
                </section>
              </div>
              <section className="panel backend-health-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Backend connection</h2>
                    <p>Read-only server health check</p>
                  </div>
                  <span className={"soft-badge " + (apiCheck.status === "connected" ? "badge-connected" : (apiCheck.status === "error" || apiCheck.status === "invalid") ? "badge-error" : apiCheck.status === "checking" ? "badge-checking" : "")}>
                    {apiCheck.status === "idle" ? "Not checked" : apiCheck.status === "not-configured" ? "Setup needed" : apiCheck.status === "checking" ? "Checking…" : apiCheck.status === "connected" ? "Connected" : apiCheck.status === "invalid" ? "Invalid URL" : "Connection failed"}
                  </span>
                </div>
                <div className="backend-health-content">
                  <span className={"backend-health-dot" + (apiCheck.status === "connected" ? " health-dot-connected" : apiCheck.status === "error" || apiCheck.status === "invalid" ? " health-dot-error" : apiCheck.status === "checking" ? " health-dot-checking" : "")} />
                  <div className="backend-health-copy">
                    <strong>{apiCheck.status === "connected" ? "Backend reachable" : apiCheck.status === "checking" ? "Checking backend…" : apiCheck.status === "error" || apiCheck.status === "invalid" ? "Connection needs attention" : "Backend connection not verified"}</strong>
                    <p>{apiCheck.message}</p>
                  </div>
                  <button
                    className="secondary-button connection-test"
                    type="button"
                    disabled={apiCheck.status === "checking"}
                    onClick={() => {
                      if (apiBaseUrl.trim()) {
                        void handleBackendHealthCheck();
                      } else {
                        setPage("settings");
                        setNotice("Enter the backend base URL in Settings to enable the read-only health check.");
                      }
                    }}
                  >
                    {apiCheck.status === "checking" ? "Checking…" : apiBaseUrl.trim() ? "Check connection" : "Configure URL"}
                  </button>
                </div>
                <div className="backend-health-footnote">This card only requests GET /health. It does not change backend settings or platform controls.</div>
              </section>
              <section className="panel channels-panel">
                <div className="panel-heading"><div><h2>Platform controls</h2><p>Quick status and channel switches</p></div><button className="text-link" type="button" onClick={() => setPage("channels")}>View all channels <span>→</span></button></div>
                <div className="channel-grid">
                  {initialChannels.map((channel) => (
                    <article className="channel-card" key={channel.id}>
                      <div className="channel-card-top"><span className={"channel-mark " + channel.tint}>{channel.mark}</span><Switch checked={channelsEnabled[channel.id]} label={"Toggle " + channel.name + " preview"} onToggle={() => { setChannelsEnabled((current) => ({ ...current, [channel.id]: !current[channel.id] })); showPreviewNotice(); }} /></div>
                      <strong>{channel.name}</strong><p>{channel.description}</p>
                      <div className="channel-card-bottom"><span className={"channel-status" + (channelsEnabled[channel.id] ? " status-connected" : " status-paused")}><i />{channelsEnabled[channel.id] ? "Enabled (preview)" : "Disabled (preview)"}</span><small>{channel.requests} req.</small></div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "channels" && (
            <section className="panel full-panel">
              <div className="panel-heading"><div><h2>All platforms</h2><p>Local preview controls. No live service is changed.</p></div><span className="soft-badge">{channelsOnline} enabled in preview</span></div>
              <div className="channel-list">
                {initialChannels.map((channel) => (
                  <div className="channel-list-row" key={channel.id}>
                    <span className={"channel-mark " + channel.tint}>{channel.mark}</span>
                    <div className="channel-list-main"><strong>{channel.name}</strong><small>{channel.description} · {channel.requests} sample requests</small></div>
                    <span className={"channel-status" + (channelsEnabled[channel.id] ? " status-connected" : " status-paused")}><i />{channelsEnabled[channel.id] ? "Enabled" : "Disabled"}</span>
                    <Switch checked={channelsEnabled[channel.id]} label={"Toggle " + channel.name + " preview"} onToggle={() => { setChannelsEnabled((current) => ({ ...current, [channel.id]: !current[channel.id] })); showPreviewNotice(); }} />
                  </div>
                ))}
              </div>
              <div className="integration-note"><strong>Coming in API integration</strong><p>Server-side permission checks, persisted switches, and channel health checks will replace these local preview controls.</p></div>
            </section>
          )}

          {page === "activity" && (
            <section className="panel full-panel">
              <div className="panel-heading"><div><h2>Recent activity</h2><p>Illustrative events for the dashboard preview</p></div><span className="soft-badge">Sample events</span></div>
              <div className="activity-list">
                <div><span className="event-icon success">✓</span><div><strong>Android App request handled</strong><small>Sample event · No live data fetched</small></div><span className="event-kind">Request</span><time>2 min ago</time></div>
                <div><span className="event-icon purple">✳</span><div><strong>AI response generated</strong><small>Sample event · No live data fetched</small></div><span className="event-kind">AI</span><time>8 min ago</time></div>
                <div><span className="event-icon success">✓</span><div><strong>Telegram message delivered</strong><small>Sample event · No live data fetched</small></div><span className="event-kind">Message</span><time>14 min ago</time></div>
                <div><span className="event-icon warning">!</span><div><strong>Instagram integration needs setup</strong><small>Sample event · No live data fetched</small></div><span className="event-kind">Warning</span><time>21 min ago</time></div>
              </div>
            </section>
          )}

          {page === "settings" && (
            <section className="panel full-panel">
              <div className="panel-heading"><div><h2>Workspace settings</h2><p>Preferences for the admin workspace preview</p></div></div>
              <div className="settings-row"><div><strong>Global AI processing</strong><p>Preview switch only. The live setting requires a secure backend API.</p></div><Switch checked={aiEnabled} label="Toggle global AI processing preview" onToggle={() => { setAiEnabled(!aiEnabled); showPreviewNotice(); }} /></div>
              <div className="settings-row"><div><strong>Admin authentication</strong><p>Server-side sign-in, secure session management and access control are not connected yet.</p></div><span className="soft-badge">Pending</span></div>
              <div className="settings-row settings-row-connection">
                <div className="connection-copy">
                  <strong>Backend API connection</strong>
                  <p>{apiCheck.message}</p>
                  <label className="api-url-label" htmlFor="api-base-url">Backend base URL</label>
                  <input
                    className="field settings-api-input"
                    id="api-base-url"
                    name="api-base-url"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://your-backend.example"
                    value={apiBaseUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setApiBaseUrl(value);
                      setApiCheck({
                        status: value.trim() ? "idle" : "not-configured",
                        message: value.trim() ? "URL changed. Run the connection check to test it." : "Enter your backend base URL before testing the connection."
                      });
                    }}
                  />
                  <small className="api-url-note">This sends GET /health only. No password, token or control command is sent.</small>
                </div>
                <div className="connection-controls">
                  <span className={"soft-badge " + (apiCheck.status === "connected" ? "badge-connected" : (apiCheck.status === "error" || apiCheck.status === "invalid") ? "badge-error" : apiCheck.status === "checking" ? "badge-checking" : "")}>{apiCheck.status === "idle" ? "Not checked" : apiCheck.status === "not-configured" ? "Not configured" : apiCheck.status === "checking" ? "Checking…" : apiCheck.status === "connected" ? "Connected" : apiCheck.status === "invalid" ? "Invalid URL" : "Connection failed"}</span>
                  <button className="secondary-button connection-test" type="button" onClick={handleBackendHealthCheck} disabled={apiCheck.status === "checking"}>{apiCheck.status === "checking" ? "Checking…" : "Check connection"}</button>
                </div>
              </div>
            </section>
          )}

          <div className="notice-bar" role="status"><span>ⓘ</span>{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>
          <footer className="page-footer"><span>© 2026 Indoone · Web control center</span><span><i /> Preview environment <b>v0.1.0</b></span></footer>
        </div>
      </section>
    </main>
  );
}

export default App;
