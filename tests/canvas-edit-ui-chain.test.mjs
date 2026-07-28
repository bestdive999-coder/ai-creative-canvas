import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvasSource = await readFile(new URL("../public/src/canvas-image-ai.js", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../public/src/ai-chat-renderer.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

const canvasSubmitSource = canvasSource.slice(
  canvasSource.indexOf("async function submitCanvasImageAiEdit"),
  canvasSource.indexOf("return {", canvasSource.indexOf("async function submitCanvasImageAiEdit"))
);
const pendingRendererSource = chatSource.slice(
  chatSource.indexOf("function renderAiPendingMessage"),
  chatSource.indexOf("function renderAiGeneratedStatus")
);

test("canvas image edit stays a direct original-image edit without Agent", () => {
  assert.doesNotMatch(htmlSource, /canvasImageAiSkill(?:Btn|Menu|Name)/);
  assert.doesNotMatch(canvasSource, /canvasImageAiPromptWithSkill|canvasImageAiSelectedSkill|imageAiEditorSelectedSkillId/);
  assert.doesNotMatch(stylesSource, /canvas-image-ai-(?:agent-button|skill-menu)/);
  assert.match(canvasSubmitSource, /const requestPrompt = finalPrompt/);
});

test("canvas image edit uses one ordinary canvas placeholder without chat progress", () => {
  assert.equal((canvasSubmitSource.match(/createCanvasGenerationPlaceholder\(/g) || []).length, 1);
  assert.match(canvasSubmitSource, /replaceCanvasGenerationPlaceholder\(canvasPlaceholderId, finalImages\)/);
  assert.match(canvasSubmitSource, /updateCanvasGenerationPlaceholderProgress\(progress, canvasPlaceholderId\)/);
  assert.match(canvasSubmitSource, /renderStatus: false/);
  assert.doesNotMatch(canvasSubmitSource, /resultPlaceholderIds/);
});

test("canvas image edit does not render a second inline status strip", () => {
  assert.doesNotMatch(htmlSource, /canvasImageAiStatus/);
  assert.doesNotMatch(canvasSource, /setCanvasImageAiStatus|renderCanvasImageAiStatus|imageAiEditorStatus/);
  assert.doesNotMatch(stylesSource, /canvas-image-ai-status(?:-wave|-copy)?/);
});

test("chat generation uses a compact status row without a wave preview", () => {
  assert.match(pendingRendererSource, /ai-generation-status-message/);
  assert.match(pendingRendererSource, /ai-generation-status-bar/);
  assert.doesNotMatch(pendingRendererSource, /ai-generation-effect|ai-loading-sprite|ps-progress-card/);
  assert.match(stylesSource, /\.ai-generation-status-message \.ai-chat-bubble/);
});
