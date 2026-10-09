import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/styles.css",
  "vite.config.ts",
  "public/favicon.svg"
];

for (const path of requiredFiles) {
  assert.ok(existsSync(path), "Missing required app file: " + path);
}

const html = readFileSync("index.html", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const ignore = readFileSync(".gitignore", "utf8");

assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
assert.match(html, /id="root"|id=\\"root\\"/);
assert.match(app, /Admin authentication is not connected yet/);
assert.match(app, /Open dashboard preview/);
assert.match(app, /Preview mode/);
assert.match(ignore, /^\.env\s*$/m);
assert.match(ignore, /^node_modules\/\s*$/m);

console.log("Source smoke checks passed: required files, preview-only auth messaging, and secret-file ignores.");
