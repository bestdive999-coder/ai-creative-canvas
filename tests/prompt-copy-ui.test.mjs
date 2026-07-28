import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const renderer = fs.readFileSync(new URL("../public/src/ai-chat-renderer.js", import.meta.url), "utf8");

test("generated-image prompts expose a clear copy control", () => {
  assert.match(renderer, /data-ai-copy-prompt/);
  assert.match(renderer, /title="复制提示词" aria-label="复制提示词"/);
  assert.match(renderer, /workspace-icon ri-copy/);
  assert.match(renderer, /querySelectorAll\("button\[data-ai-copy-prompt\]"\)/);
  assert.match(renderer, /toast\("提示词已复制。"\)/);
});

test("prompt copy works on both secure and HTTP appliance pages", () => {
  assert.match(renderer, /document\.execCommand\("copy"\)/);
  assert.match(renderer, /if \(copied\) return;[\s\S]*?navigator\.clipboard\?\.writeText/);
});

test("prompt text stays selectable and the icon does not shift the card", () => {
  assert.match(html, /styles\.css\?v=open-source-preview-\d+/);
  assert.match(html, /ai-chat-renderer\.js\?v=open-source-preview-\d+/);
  assert.match(css, /\.ai-copy-prompt-button\s*\{[\s\S]*?width:\s*26px;[\s\S]*?height:\s*26px;/);
  assert.match(css, /\.ai-image-prompt-text\s*\{[\s\S]*?user-select:\s*text;/);
});
