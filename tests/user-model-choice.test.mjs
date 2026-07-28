import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const controls = await readFile(new URL("../public/src/ai-controls.js", import.meta.url), "utf8");
const size = await readFile(new URL("../public/src/ai-size.js", import.meta.url), "utf8");
const generation = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");
const canvasImageAi = await readFile(new URL("../public/src/canvas-image-ai.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("user model settings expose a local model list and selector", () => {
  assert.match(html, /id="userImageModelSelect"/);
  assert.match(html, /id="userImageModelList"/);
  assert.match(html, /id="userImageModelSaveBtn"/);
  assert.match(controls, /ai_user_image_models_v1/);
  assert.match(controls, /handleUserImageModelSave/);
  assert.match(controls, /currentUserImageModel/);
  assert.match(controls, /models\[0\] \|\| ""/);
  assert.match(controls, /models:\s*normalizeUserImageModelList\(current\.models\),\s*selected:\s*""/);
  assert.match(controls, /refreshCustomSelect\(select\)/);
});

test("automatic model selection is independent from the thinking mode", () => {
  assert.match(size, /aiAutoModeToggle\.checked = !currentUserImageModel\(currentAiProvider\(\)\)/);
  assert.match(size, /const firstUserModel = Array\.from\(select\.options \|\| \[\]\)\.find/);
  assert.match(size, /select\.dispatchEvent\(new Event\("change"/);
  assert.doesNotMatch(size, /thinkingMode\.value = els\.aiAutoModeToggle\?\.checked/);
});

test("selected user model is sent for main generation and canvas continuation", () => {
  assert.match(generation, /model: ai\.imageModel \|\| ai\.model \|\| ""/);
  assert.match(generation, /model: ai\.imageModel \|\| ai\.model \|\| "reasoning-model"/);
  assert.match(canvasImageAi, /imageModel: currentUserImageModel\?\./);
});

test("server accepts a bounded user model override without exposing credentials", () => {
  assert.match(server, /function normalizeClientModelOverride\(value\)/);
  assert.match(server, /const requestedModel = normalizeClientModelOverride\(body\.model \|\| body\.image_model\)/);
  assert.match(server, /model: requestedModel \|\| safe\.ai\?\.imageEditModel/);
  assert.match(server, /encodeURIComponent\(model\).*generateContent/);
});
