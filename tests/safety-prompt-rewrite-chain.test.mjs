import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const aiGenerationSource = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");
const canvasImageAiSource = await readFile(new URL("../public/src/canvas-image-ai.js", import.meta.url), "utf8");
const utilsSource = await readFile(new URL("../public/src/utils.js", import.meta.url), "utf8");

test("server marks prompt rewrite only after 备用服务安全回退 also fails", () => {
  assert.match(serverSource, /function aiPromptRewriteRecovery/);
  assert.match(serverSource, /attempt\.provider === "imageservice"[\s\S]{0,140}attempt\.reasonType === "safety"/);
  assert.match(serverSource, /attempt\.provider === "secondaryimage"[\s\S]{0,90}attempt\.result === "failed"/);
  assert.match(serverSource, /promptRewriteAvailable/);
  assert.match(serverSource, /providerAttempts: recovery\.providerAttempts/);
  assert.match(serverSource, /promptRewriteAvailable: Boolean\(state\.promptRewriteAvailable\)/);
});

test("image prompt endpoint has safety rewrite mode powered by thinking model", () => {
  assert.match(serverSource, /mode === "safety_rewrite"/);
  assert.match(serverSource, /rewriteSafetyBlockedImagePrompt/);
  assert.match(serverSource, /requestPrimaryResponsesText\(apiKey, model, messages/);
  assert.match(serverSource, /source: "prompt-safety-rewrite"/);
  assert.match(serverSource, /只输出 JSON：\{\\"reason\\"\:\\"最可能的问题/);
});

test("frontend shows one-click rewrite for recoverable safety failures", () => {
  assert.match(utilsSource, /showCancel: options\.showCancel === undefined \? false : Boolean\(options\.showCancel\)/);
  assert.match(aiGenerationSource, /function showAiPromptRewriteFailureDialog/);
  assert.match(aiGenerationSource, /confirmText: "一键修改提示词"/);
  assert.match(aiGenerationSource, /mode: "safety_rewrite"/);
  assert.match(aiGenerationSource, /els\.directPromptInput\.value = nextPrompt/);
  assert.match(aiGenerationSource, /请确认后再次发送/);
  assert.doesNotMatch(aiGenerationSource, /rewriteAiPromptAfterSafetyFailure[\s\S]{0,1800}generateAiImages\(/);
});

test("canvas image edit safety failures can rewrite the edit prompt", () => {
  assert.match(canvasImageAiSource, /function showCanvasPromptRewriteFailureDialog/);
  assert.match(canvasImageAiSource, /title: "图片续改被安全拦截"/);
  assert.match(canvasImageAiSource, /confirmText: "一键修改提示词"/);
  assert.match(canvasImageAiSource, /mode: "safety_rewrite"/);
  assert.match(canvasImageAiSource, /els\.canvasImageAiPrompt\.value = nextPrompt/);
  assert.match(canvasImageAiSource, /请确认后再次提交续改/);
  assert.doesNotMatch(canvasImageAiSource, /rewriteCanvasPromptAfterSafetyFailure[\s\S]{0,1800}submitCanvasImageAiEdit\(/);
});
