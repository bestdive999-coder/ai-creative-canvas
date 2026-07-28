import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");

test("detail page generation carries composition-only layout references", () => {
  assert.match(source, /function detailModuleGenerationReferences/);
  assert.match(source, /detailPlanningEmbeddedReferences[\s\S]{0,600}\.slice\(0, 64\)/);
  assert.doesNotMatch(source, /detailPlanningEmbeddedReferences[\s\S]{0,200}aiReferenceLimit/);
  assert.match(source, /plannedScope:\s*"composition_only"/);
  assert.match(source, /references:\s*isDetail \? detailModuleGenerationReferences\(context, module\) : context\.references/);
  assert.match(source, /绝不是产品身份图/);
});

test("detail page retries only inside the detail module runner", () => {
  assert.match(source, /const maxAttempts = isDetail \? 3 : 1/);
  assert.match(source, /status === 429 \|\| status >= 500/);
  assert.match(source, /isRetryableDetailModuleError/);
});

test("detail page preserves high-resolution screens", () => {
  assert.doesNotMatch(source, /width:\s*1152[\s\S]{0,80}height:\s*1536/);
  assert.doesNotMatch(source, /normalizeDetailPageImageRatioWithoutScaling/);
  assert.doesNotMatch(source, /edge-expand-no-scale/);
  assert.match(source, /detailPageRatioCorrectionMode = "original-no-raster-rewrite"/);
  assert.match(source, /detailPageRatioMismatchScreens/);
  assert.match(source, /else \{\s*await resizeAiGeneratedImagesToExactSize\(generatedImages, outputSizeLock\)/);
});

test("incomplete detail pages never merge silently", () => {
  assert.match(source, /const detailPageComplete = Number\(generationMetadata\.failedCount \|\| 0\) === 0/);
  assert.match(source, /generationMetadata\.detailPageMergeSkipped = true/);
  assert.match(source, /缺少第 \$\{missingModuleIndexes\.join\("、"\)\} 屏，已禁止合成长图/);
});

test("long detail pages are segmented at their working width", () => {
  assert.match(source, /async function buildMergedDetailPageImages/);
  assert.match(source, /const maxSegmentPixels = 40000000/);
  assert.match(source, /const width = Math\.min\(\.\.\.dimensions\.map/);
  assert.match(source, /detail-page-merged\$\{partLabel\}/);
  assert.doesNotMatch(source, /outputScale/);
});

test("detail page checkpoints completed groups", () => {
  assert.match(source, /detailPageCheckpoint:\s*true/);
  assert.match(source, /已完成的单屏可从对话记录恢复/);
  assert.doesNotMatch(source, /刷新后.*继续/);
  assert.match(source, /saveAiConversationNow\(\{ snapshot: requestConversation, applyToActive: false, mergeMode: "task" \}\)/);
});

test("detail page commits successful screens before showing terminal failures", () => {
  assert.match(source, /let generationResultCommitted = false/);
  assert.match(source, /const commitGeneratedImages = async/);
  assert.match(source, /detailPageAgentRun && generatedImages\.length && !generationResultCommitted/);
  assert.match(source, /detailPageRecoveredAfterError = true/);
  assert.match(source, /生成后处理失败，已保留 \$\{generatedImages\.length\} 张单屏/);
});

test("detail page defaults the first user image to product identity unless it is layout-only", () => {
  assert.match(source, /return explicitlyLayoutOnly \? -1 : 0/);
  assert.match(source, /详情页案例\|案例图\|线框\|版式模板/);
});
