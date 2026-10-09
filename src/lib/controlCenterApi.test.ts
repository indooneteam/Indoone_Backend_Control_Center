import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlCenterRequest } from "./controlCenterApi";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("protected Control Center API client", () => {
  it("sends the admin token only in Authorization and supports settings patches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await expect(controlCenterRequest(
      "https://indoone.example/",
      "secret-admin-token",
      "/api/control-center/settings",
      { method: "PATCH", body: { global_intake_enabled: false } }
    )).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://indoone.example/api/control-center/settings",
      expect.objectContaining({
        method: "PATCH",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-admin-token",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ global_intake_enabled: false })
      })
    );
  });

  it("refuses invalid origins, missing tokens, and non-Control-Center paths without fetching", async () => {
    await expect(controlCenterRequest("http://remote.example", "secret", "/api/control-center/status"))
      .rejects.toThrow(/HTTPS backend origin/);
    await expect(controlCenterRequest("https://indoone.example", "", "/api/control-center/status"))
      .rejects.toThrow(/token is required/);
    await expect(controlCenterRequest("https://indoone.example", "secret", "/api/chat"))
      .rejects.toThrow(/Invalid Control Center API path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports rejected admin credentials without hiding the authorization failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unauthorized" }, 401));

    await expect(controlCenterRequest(
      "https://indoone.example",
      "bad-token",
      "/api/control-center/status"
    )).rejects.toThrow(/Admin authentication failed/);
  });

  it("uses a bounded request timeout and explains backend errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "settings unavailable" }, 503));

    await expect(controlCenterRequest(
      "https://indoone.example",
      "secret-admin-token",
      "/api/control-center/settings",
      { method: "PATCH", body: { global_replies_enabled: true } }
    )).rejects.toThrow(/settings unavailable/);
  });
});
