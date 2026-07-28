import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../public/src/auth.js", import.meta.url), "utf8");
const appState = fs.readFileSync(new URL("../public/src/app-state.js", import.meta.url), "utf8");

test("employee canvas exposes an accessible logout control in the top workbench", () => {
  const toolbar = html.match(/<div class="studio-panel-top-icons">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(toolbar, /id="logoutBtn"/);
  assert.match(toolbar, /class="studio-logout-button"/);
  assert.match(toolbar, /title="退出登录"/);
  assert.match(toolbar, /aria-label="退出登录"/);
  assert.match(toolbar, /ri-log-out/);
});

test("logout control uses the existing authenticated logout flow", () => {
  assert.match(appState, /logoutBtn:\s*\$\("#logoutBtn"\)/);
  assert.match(auth, /on\(els\.logoutBtn,\s*"click",\s*handleLogout\)/);
  assert.match(auth, /fetch\("\/api\/account\/logout",\s*\{\s*method:\s*"POST"\s*\}\)/);
  assert.match(auth, /els\.logoutBtn\.style\.display\s*=\s*user\s*\?\s*"inline-flex"\s*:\s*"none"/);
});

test("logout control keeps a stable compact size", () => {
  assert.match(html, /styles\.css\?v=open-source-preview-\d+/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*34px/);
  assert.match(css, /\.studio-logout-button\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/);
  assert.match(css, /\.ri-log-out\s*\{/);
});
