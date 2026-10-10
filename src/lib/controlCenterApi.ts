import { isApiBaseUrlValid } from "./api";

export type ControlChannel = "whatsapp" | "instagram" | "telegram" | "android";
export type ControlEventStatus = "success" | "failed" | "blocked" | "skipped";

export type ChannelControlState = {
  intake_enabled: boolean;
  effective_intake_enabled: boolean;
  reply_enabled: boolean;
  effective_reply_enabled: boolean;
};

export type ControlCenterState = {
  status: "ok";
  controls: {
    global_intake_enabled: boolean;
    global_replies_enabled: boolean;
    channels: Record<ControlChannel, ChannelControlState>;
  };
};

export type ChannelMetrics = {
  requests: {
    total: number;
    success: number;
    failed: number;
    blocked: number;
  };
  replies: {
    sent: number;
    delivered: number;
    failed: number;
    delivery_failed: number;
    skipped: number;
  };
};

export type ControlCenterMetrics = {
  status: "ok";
  window_hours: number;
  channels: Record<ControlChannel, ChannelMetrics>;
  totals: ChannelMetrics;
};

export type ControlCenterActivityEvent = {
  channel: ControlChannel;
  event_type: "request" | "reply";
  status: ControlEventStatus;
  path: string;
  http_status: number | null;
  created_at: string;
};

export type ControlCenterActivity = {
  status: "ok";
  events: ControlCenterActivityEvent[];
};

export type ControlSettingsPatch = {
  global_intake_enabled?: boolean;
  global_replies_enabled?: boolean;
  channels?: Partial<Record<ControlChannel, Partial<{
    intake_enabled: boolean;
    reply_enabled: boolean;
  }>>>;
};

export async function controlCenterRequest<T>(
  baseUrl: string,
  adminToken: string,
  path: string,
  options: { method?: "GET" | "PATCH"; body?: unknown } = {}
): Promise<T> {
  const origin = baseUrl.trim().replace(/\/+$/, "");
  const token = adminToken.trim();

  if (!isApiBaseUrlValid(origin)) {
    throw new Error("Enter a valid HTTPS backend origin before connecting.");
  }
  if (!token) {
    throw new Error("Admin access token is required.");
  }
  if (!path.startsWith("/api/control-center/") || path.includes("..")) {
    throw new Error("Invalid Control Center API path.");
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 10000);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${origin}${path}`, {
      method: options.method ?? "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Admin authentication failed. Check the Control Center token and backend configuration.");
    }
    if (!response.ok) {
      let detail = "";
      try {
        const payload: unknown = await response.json();
        if (typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string") {
          detail = payload.detail;
        }
      } catch {
        // Use the HTTP status when the backend did not return JSON.
      }
      throw new Error(detail ? `Control Center API failed: ${detail}` : `Control Center API returned HTTP ${response.status}.`);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Control Center API timed out after 10 seconds.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the backend. Check its HTTPS URL and CORS allowed origin.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
