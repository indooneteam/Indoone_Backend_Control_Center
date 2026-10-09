const configuredBase = (import.meta.env.VITE_INDOONE_API_BASE_URL ?? "").trim();
export const API_BASE_URL = configuredBase.replace(/\/+$/, "");

function isValidBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname !== "/" && url.pathname !== "") return false;
    return url.protocol === "https:" || (url.protocol === "http:" && localHost);
  } catch {
    return false;
  }
}

export async function checkBackendHealth(): Promise<{ status: string }> {
  if (!API_BASE_URL) throw new Error("Backend URL is not configured.");
  if (!isValidBaseUrl(API_BASE_URL)) {
    throw new Error("Backend URL must be an HTTPS origin (or localhost for development), without credentials or extra paths.");
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Backend denied the health check. Review its access policy and CORS configuration.");
    }
    if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("status" in payload) ||
      typeof payload.status !== "string"
    ) {
      throw new Error("Backend /health returned an unexpected response.");
    }
    return { status: payload.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Backend health check timed out after 8 seconds.");
    }
    if (error instanceof TypeError) {
      throw new Error("Browser could not reach the backend. Check URL, availability and CORS allowed origins.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
