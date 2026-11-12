import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatic } from "../lib/static.mjs";

test("resolveStatic: 허용 목록만", () => {
  assert.match(resolveStatic("/").file.pathname, /\/public\/index\.html$/);
  assert.equal(resolveStatic("/").type, "text/html; charset=utf-8");
  assert.equal(
    resolveStatic("/app.mjs").type,
    "text/javascript; charset=utf-8",
  );
  assert.equal(resolveStatic("/style.css").type, "text/css; charset=utf-8");
  assert.match(
    resolveStatic("/fonts/Galmuri9.woff2").file.pathname,
    /\/public\/fonts\/Galmuri9\.woff2$/,
  );
  assert.equal(resolveStatic("/fonts/Galmuri9.woff2").type, "font/woff2");
  assert.match(resolveStatic("/favicon.svg").file.pathname, /\/public\/favicon\.svg$/);
  assert.equal(resolveStatic("/favicon.svg").type, "image/svg+xml");
  for (const p of [
    "/server.mjs/x",
    "/../server.mjs",
    "/fonts/../a.woff2",
    "/a/b.mjs",
    "/x.js",
    "/%2e%2e/x.mjs",
    "/fonts/a.ttf",
    "/api/x",
    "/x.svg",
    "/fonts/favicon.svg",
  ])
    assert.equal(resolveStatic(p), null, p);
});

test("resolveStatic: /mini는 public/mini.html, /mini.html은 막힌다", () => {
  const r = resolveStatic("/mini");
  assert.equal(r.type, "text/html; charset=utf-8");
  assert.ok(String(r.file).endsWith("/public/mini.html"));
  assert.equal(resolveStatic("/mini.html"), null);
});
