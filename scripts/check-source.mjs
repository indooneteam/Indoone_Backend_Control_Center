import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/styles.css",
  "vite.config.ts",
  "public/favicon.svg",
  "src/lib/api.ts",
  ".env.example"
];

for (const path of requiredFiles) {
  assert.ok(existsSync(path), "Missing required app file: " + path);
}

const html = readFileSync("index.html", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const ignore = readFileSync(".gitignore", "utf8");
const apiClient = readFileSync("src/lib/api.ts", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const exampleEnv = readFileSync(".env.example", "utf8");

assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
assert.match(html, /id="root"|id=\\"root\\"/);
assert.match(app, /Admin authentication is not connected yet/);
assert.match(app, /No credentials were sent or saved/);
assert.match(app, /aria-label={showPassword \? "Hide password" : "Show password"}/);
assert.match(app, /aria-pressed={showPassword}/);
assert.match(app, /type={showPassword \? "text" : "password"}/);
assert.match(app, /Open dashboard preview/);
assert.match(app, /Preview mode/);
assert.ok(app.includes('aria-current={page === item.id ? "page" : undefined}'), "Active navigation item must expose aria-current");
assert.ok(app.includes("Intl.DateTimeFormat"), "Dashboard date must be generated dynamically");
assert.ok(app.includes("{currentDateLabel}"), "Dashboard heading must render the current date");
assert.match(ignore, /^\.env\s*$/m);
assert.match(ignore, /^node_modules\/\s*$/m);
assert.ok(apiClient.includes("VITE_INDOONE_API_BASE_URL"), "Backend URL must be configurable at build time");
assert.ok(apiClient.includes('method: "GET"'), "Health check must use GET");
assert.ok(apiClient.includes("/health"), "Health endpoint path must be present");
assert.ok(apiClient.includes('credentials: "omit"'), "Health check must omit browser credentials");
assert.ok(appSource.includes("Check connection"), "Settings must expose the backend health check");
assert.ok(appSource.includes("Backend connection"), "Overview must expose backend connectivity");
assert.ok(appSource.includes("Configure URL"), "Overview must direct users to configure an absent backend URL");
assert.ok(appSource.includes("This card only requests GET /health"), "Overview health check must remain read-only");
assert.ok(exampleEnv.includes("VITE_INDOONE_API_BASE_URL="), "Example environment file must document the API base URL");

console.log("Source smoke checks passed: preview-only login, accessible password toggle, read-only backend health check, and secret-file ignores.");
