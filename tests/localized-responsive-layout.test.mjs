import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("enhanced selects stay visually hidden and open as overlay menus", async () => {
  const css = await read("public/styles.css");

  assert.match(css, /select\.native-select-hidden\s*\{[\s\S]*?position:\s*absolute\s*!important;[\s\S]*?clip-path:\s*inset\(50%\)/);
  assert.match(css, /\.custom-select-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*240;/);
  assert.match(css, /\.custom-select-menu\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/);
});

test("localized workbench keeps locale in the project bar and reserves four panel-header columns", async () => {
  const css = await read("public/styles.css");

  assert.match(css, /Open-source preview 18[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*30px;/);
  assert.match(css, /Open-source preview 18[\s\S]*?\.studio-logout-button\[style\][\s\S]*?display:\s*flex\s*!important;[\s\S]*?grid-column:\s*4;/);
  assert.match(css, /\.project-locale-picker \.custom-select-menu\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*min\(240px,\s*calc\(100vw - 24px\)\)/);
  assert.match(css, /@media \(max-width:\s*420px\)[\s\S]*?\.project-locale-picker\s*\{[\s\S]*?flex-basis:\s*74px;/);
  assert.match(css, /Open-source preview 18[\s\S]*?\.studio-project-bar \.studio-text-button\s*\{[\s\S]*?min-width:\s*max-content;/);
});

test("long localized labels wrap without forcing horizontal overflow", async () => {
  const css = await read("public/styles.css");

  assert.match(css, /\.workspace-model-card-main b\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?-webkit-line-clamp:\s*2;/);
  assert.match(css, /\.workspace-model-card em\s*\{[\s\S]*?white-space:\s*nowrap;/);
  assert.match(css, /html:lang\(fr\) body\.workspace-mode \.workspace-model-card,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(css, /\.studio-prompt-chip-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/);
  assert.match(css, /\.studio-prompt-chip b,[\s\S]*?\.studio-prompt-chip small\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /body\.canvas-layer-panel-closed \.studio-canvas-layer-panel\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?transform:\s*none;/);
});

test("admin shell wraps localized controls and keeps the login language selector available", async () => {
  const [css, html] = await Promise.all([read("admin-public/styles.css"), read("admin-public/index.html")]);

  assert.match(html, /id="loginLanguageSelect"/);
  assert.match(css, /\.admin-session\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?justify-content:\s*flex-end;/);
  assert.match(css, /@media \(max-width:\s*1180px\)\s*\{[\s\S]*?\.admin-session\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.admin-module-rail small\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /\.card \.primary,[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /@media \(max-width:\s*460px\)\s*\{[\s\S]*?\.admin-session\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*760px\)\s*\{[\s\S]*?\.admin-module-rail\s*\{[\s\S]*?contain:\s*inline-size;/);
  assert.match(css, /@media \(max-width:\s*760px\)\s*\{[\s\S]*?\.monitor-provider-list\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width:\s*460px\)\s*\{[\s\S]*?\.maintenance-config-note\s*\{[\s\S]*?flex-direction:\s*column;/);
});

test("narrow layouts remove the artificial empty-panel stretch", async () => {
  const css = await read("public/styles.css");

  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.studio-panel-view\.active\[data-studio-panel-view="ai"\]\s*\{[\s\S]*?min-height:\s*0;/);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.studio-ai-stream\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?min-height:\s*154px;/);
  assert.match(css, /\.studio-ai-panel\s*\{[\s\S]*?container-type:\s*inline-size;/);
  assert.match(css, /@container \(max-width:\s*720px\)\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"label icon"[\s\S]*?"value icon"/);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.app-shell\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.workspace\s*\{[\s\S]*?height:\s*auto;/);
});
