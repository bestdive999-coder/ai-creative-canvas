import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const generationSource = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../public/src/ai-chat-renderer.js", import.meta.url), "utf8");
const conversationsSource = await readFile(new URL("../public/src/conversations.js", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../public/src/canvas-assets.js", import.meta.url), "utf8");
const stateSource = await readFile(new URL("../public/src/app-state.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

const generationFunction = generationSource.slice(
  generationSource.indexOf("async function generateAiImages"),
  generationSource.indexOf("async function pollAiImageGeneration")
);
const pendingRendererFunction = rendererSource.slice(
  rendererSource.indexOf("function renderAiPendingMessage"),
  rendererSource.indexOf("function renderAiGeneratedStatus")
);
const placeholderFunction = canvasSource.slice(
  canvasSource.indexOf("async function createCanvasGenerationPlaceholder"),
  canvasSource.indexOf("async function createGenerationLoadingSprite")
);

test("direct generation uses independent task state without a global busy lock", () => {
  assert.match(stateSource, /generationTasks:\s*\{\}/);
  assert.match(generationFunction, /registerGenerationTask\(/);
  assert.match(generationFunction, /generationTaskId/);
  assert.doesNotMatch(generationFunction, /setBusy\(true\)/);
  assert.doesNotMatch(generationFunction, /setBusy\(false\)/);
});

test("ordinary running and queued images are capped at eight", () => {
  assert.match(generationSource, /ordinaryGenerationUnitLimit = 8/);
  assert.match(generationSource, /activeOrdinaryGenerationUnits\(\)/);
  assert.match(htmlSource, /id="imageCount"[^>]*max="8"/);
  assert.doesNotMatch(htmlSource, /data-ai-count="5"/);
  assert.doesNotMatch(htmlSource, /data-ai-count="9"/);
  assert.match(serverSource, /aiImageMaxActiveJobsPerUser = Math\.max\(1, Math\.min\(8,/);
});

test("task progress and canvas placeholders are addressed by task id", () => {
  assert.match(rendererSource, /activeGenerationTasksForConversation/);
  assert.match(rendererSource, /pendingItems\.map\(renderAiPendingMessage\)/);
  assert.match(rendererSource, /updateCanvasGenerationPlaceholderProgress\(task\.progress, task\.placeholderId/);
  assert.match(canvasSource, /function updateCanvasGenerationPlaceholderProgress\(progress = \{\}, placeholderId = ""\)/);
});

test("concurrent task results merge messages instead of replacing conversations", () => {
  assert.match(generationSource, /mergeChatMessagesById\(state\.aiDirect\.chatMessages, requestConversation\.chatMessages\)/);
  assert.match(conversationsSource, /mergeMode: String\(options\.mergeMode/);
  assert.match(conversationsSource, /mergeConversationMessagesById/);
  assert.match(serverSource, /function mergeAiConversationMessages/);
  assert.match(serverSource, /function withAiConversationSaveLock/);
  assert.match(serverSource, /mergeAiConversationSnapshot\(existing, incoming, mergeMode\)/);
});

test("图片服务 requests preserve counts up to eight and large batches are split", () => {
  assert.match(serverSource, /Number\(options\.count \|\| 1\), 1\), aiImageMaxActiveJobsPerUser/);
  assert.match(serverSource, /Number\(body\.n \|\| 1\), 1\), aiImageMaxActiveJobsPerUser/);
  assert.match(serverSource, /\|\| count > 4/);
});

test("queue scheduling uses available units and status polling verifies ownership", () => {
  assert.match(serverSource, /findIndex\(\(queuedItem\) => aiImageJobUnits\(queuedItem\) <= availableUnits\)/);
  assert.match(serverSource, /const account = await requireAccount\(req, res\)/);
  assert.match(serverSource, /state\?\.account\?\.id[\s\S]{0,120}account\.user\.id/);
});

test("pending task count uses this account instead of the appliance-wide running count", () => {
  assert.match(rendererSource, /function activeGenerationUnits\(detailPage = false\)/);
  assert.match(pendingRendererFunction, /accountActiveUnits/);
  assert.match(pendingRendererFunction, /本账号 \$\{accountActiveUnits\}\/\$\{accountActiveLimit\} 张/);
  assert.doesNotMatch(pendingRendererFunction, /progress\.running/);
  assert.match(serverSource, /accountActiveUnits/);
  assert.match(serverSource, /accountActiveLimit: detailPageWorkflow/);
});

test("concurrent canvas placeholders reserve ordered slots after async assets load", () => {
  const spriteIndex = placeholderFunction.indexOf("await createGenerationLoadingSprite");
  const anchorIndex = placeholderFunction.indexOf("const anchorObject");
  assert.ok(spriteIndex >= 0 && anchorIndex > spriteIndex, "placeholder placement must be calculated after the sprite finishes loading");
  assert.match(canvasSource, /generationInsertionTailId/);
  assert.match(canvasSource, /generationInsertionSequence/);
  assert.match(canvasSource, /if \(replacesInsertionTail\) state\.canvasBeta\.generationInsertionTailId = image\.id/);
});
