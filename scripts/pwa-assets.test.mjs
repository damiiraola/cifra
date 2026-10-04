import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PWA_THEME_COLOR, renderWebManifest, grokPwaHeadTags } from "./grok-pwa-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("manifest uses the app's dark color and ships maskable icons", () => {
  const m = JSON.parse(renderWebManifest("cifra.lol"));
  assert.equal(PWA_THEME_COLOR, "#09090B");
  assert.equal(m.theme_color, "#09090B");
  assert.equal(m.background_color, "#09090B");
  const maskable = m.icons.filter((i) => i.purpose === "maskable");
  assert.deepEqual(maskable.map((i) => i.sizes), ["192x192", "512x512"]);
  for (const i of maskable) readFileSync(join(ROOT, "public", i.src));
  const theme = grokPwaHeadTags().find(([k]) => k === "theme-color")[1];
  assert.match(theme, /#09090B/);
});

test("robots.txt keeps the private app out and lets the share card through", () => {
  const robots = readFileSync(join(ROOT, "public/robots.txt"), "utf8");
  assert.match(robots, /Allow: \/privacidad/);
  assert.match(robots, /Allow: \/\$/);
  assert.match(robots, /Disallow: \/ajustes/);
  assert.match(robots, /Disallow: \/_serverFn\//);
});

test("service worker only serves the offline page", () => {
  const sw = readFileSync(join(ROOT, "public/sw.js"), "utf8");
  assert.match(sw, /\/offline\.html/);
  assert.match(sw, /request\.mode !== "navigate"/);
  readFileSync(join(ROOT, "public/offline.html"));
});

test("og:type is website", () => {
  const site = JSON.parse(readFileSync(join(ROOT, "src/lib/og/site.json"), "utf8"));
  assert.equal(site.type, "website");
});
