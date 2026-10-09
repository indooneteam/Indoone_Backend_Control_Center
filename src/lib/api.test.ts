import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkBackendHealth, isApiBaseUrlValid } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("backend API base URL validation", () => {
  it("accepts HTTPS origins", () => {
    expect(isApiBaseUrlValid("https://api.example.com")).toBe(true);
    expect(isApiBaseUrlValid("https://api.example.com/")).toBe(true);
  });

  it("allows plain HTTP only for local development", () => {
    expect(isApiBaseUrlValid("http://localhost:8000")).toBe(true);
    expect(isApiBaseUrlValid("http://127.0.0.1:8000")).toBe(true);
    expect(isApiBaseUrlValid("http://api.example.com")).toBe(false);
  });

  it("rejects credential-bearing URLs", () => {
    expect(isApiBaseUrlValid("https://user:password@api.example.com")).toBe(false);
  });

  it("rejects paths, query parameters and fragments", () => {
    expect(isApiBaseUrlValid("https://api.example.com/admin")).toBe(false);
    expect(isApiBaseUrlValid("https://api.example.com?token=value")).toBe(false);
    expect(isApiBaseUrlValid("https://api.example.com#fragment")).toBe(false);
  });

  it("rejects empty and malformed values", () => {
    expect(isApiBaseUrlValid("")).toBe(false);
    expect(isApiBaseUrlValid("not a URL")).toBe(false);
  });
});

describe("read-only backend health check", () => {
  it("requests only GET /health without credentials and accepts a valid payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await expect(checkBackendHealth("https://api.example.com/")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.objectContaining({
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" }
      })
    );
  });

  it("does not send a request when the URL is invalid", async () => {
    await expect(checkBackendHealth("http://api.example.com")).rejects.toThrow(/HTTPS origin/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unauthorized backend responses clearly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unauthorized" }, 401));

    await expect(checkBackendHealth("https://api.example.com")).rejects.toThrow(/access policy and CORS/);
  });

  it("rejects unsuccessful HTTP responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unavailable" }, 503));

    await expect(checkBackendHealth("https://api.example.com")).rejects.toThrow(/HTTP 503/);
  });

  it("rejects unexpected health response shapes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ healthy: true }));

    await expect(checkBackendHealth("https://api.example.com")).rejects.toThrow(/unexpected response/);
  });

  it("turns browser network failures into a useful message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(checkBackendHealth("https://api.example.com")).rejects.toThrow(/CORS allowed origins/);
  });

  it("aborts a slow health request after eight seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    );

    const request = checkBackendHealth("https://api.example.com");
    await vi.advanceTimersByTimeAsync(8000);
    await expect(request).rejects.toThrow(/timed out after 8 seconds/);
  });
});
