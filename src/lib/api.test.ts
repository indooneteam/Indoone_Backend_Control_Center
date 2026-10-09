import { describe, expect, it } from "vitest";
import { isApiBaseUrlValid } from "./api";

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
