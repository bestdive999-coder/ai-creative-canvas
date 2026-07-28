import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const canvasWorkspace = fs.readFileSync(new URL("../public/src/canvas-workspace.js", import.meta.url), "utf8");
const aiChatRenderer = fs.readFileSync(new URL("../public/src/ai-chat-renderer.js", import.meta.url), "utf8");
const conversations = fs.readFileSync(new URL("../public/src/conversations.js", import.meta.url), "utf8");

test("creation panel no longer renders the redundant new-image heading", () => {
  assert.doesNotMatch(html, /class="studio-welcome"/);
  assert.doesNotMatch(html, /<h2>新图生成<\/h2>/);
});

test("workbench tabs stay outside the scrolling panel content", () => {
  const panel = html.match(/<aside id="studioAiPanel"[\s\S]*?<\/aside>/)?.[0] || "";
  const tabsIndex = panel.indexOf("studio-panel-top-icons");
  const scrollIndex = panel.indexOf("studio-panel-scroll");
  assert.ok(tabsIndex >= 0);
  assert.ok(scrollIndex > tabsIndex);
});

test("only the panel content scrolls while the workbench tabs stay fixed", () => {
  assert.match(html, /styles\.css\?v=open-source-preview-\d+/);
  assert.match(html, /canvas-workspace\.js\?v=open-source-preview-\d+/);
  assert.match(html, /ai-chat-renderer\.js\?v=open-source-preview-\d+/);
  assert.match(html, /conversations\.js\?v=open-source-preview-\d+/);
  assert.match(css, /\.studio-panel-top-icons\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*20;/);
  assert.match(css, /\.studio-panel-scroll\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
});

test("empty creation view stays at the top and results still scroll into view", () => {
  assert.match(canvasWorkspace, /const hasAiResults = Boolean\(els\.aiChatList\?\.querySelector/);
  assert.match(canvasWorkspace, /target === "ai" && hasAiResults \? panelScroll\.scrollHeight : 0/);
  for (const source of [aiChatRenderer, conversations]) {
    assert.match(source, /function hasAiPanelContent\(\)/);
    assert.match(source, /if \(!hasAiPanelContent\(\)\)/);
    assert.match(source, /if \(panelScroll\) panelScroll\.scrollTop = 0;/);
  }
});
