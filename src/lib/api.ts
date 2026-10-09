export const API_BASE_URL = (import.meta.env.VITE_INDOONE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

export async function checkBackendHealth(): Promise<{ status: string }> {
  if (!API_BASE_URL) throw new Error("Backend URL is not configured.");
  const url = new URL(API_BASE_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Backend URL must use HTTPS.");
  }
  const response = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
  const payload = await response.json() as { status?: unknown };
  if (typeof payload.status !== "string") throw new Error("Unexpected backend health response.");
  return { status: payload.status };
}
