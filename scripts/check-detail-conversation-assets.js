import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function extractFunction(name) {
  const asyncMarker = `async function ${name}(`;
  const marker = `function ${name}(`;
  const asyncStart = serverSource.indexOf(asyncMarker);
  const start = asyncStart >= 0 ? asyncStart : serverSource.indexOf(marker);
  assert.notEqual(start, -1, `server.js is missing ${name}`);
  const endOffset = serverSource.slice(start).indexOf("\n}\n");
  assert.notEqual(endOffset, -1, `could not extract ${name}`);
  return serverSource.slice(start, start + endOffset + 2);
}

const helpers = new Function(`
  const maxAiConversationDetailPlanningMaterials = 3;
  const maxAiConversationDetailPlanningImagesPerMaterial = 32;
  const maxAiConversationDetailPlanningContentChars = 12000;
  const maxImageUploadBytes = 25 * 1024 * 1024;
  ${extractFunction("boundedConversationInteger")}
  ${extractFunction("normalizeAiConversationDetailSheet")}
  ${extractFunction("normalizeAiConversationDetailEmbeddedImage")}
  ${extractFunction("normalizeAiConversationDetailPlanningMaterials")}
  return { normalizeAiConversationDetailPlanningMaterials };
`)();

test("detail planning workbook images are persisted and bounded", async () => {
  const dataImage = "data:image/png;base64," + Buffer.from("workbook-image").toString("base64");
  const materials = Array.from({ length: 4 }, (_, materialIndex) => ({
    id: `material-${materialIndex}`,
    name: "N".repeat(200),
    content: "C".repeat(8000),
    sheetNames: Array.from({ length: 40 }, (_, index) => `Sheet-${index}`),
    wireframeModuleCount: 99,
    embeddedImages: Array.from({ length: 35 }, (_, imageIndex) => ({
      id: `image-${imageIndex}`,
      name: "I".repeat(220),
      url: dataImage,
      source: "detail_planning_workbook",
      anchorRow: imageIndex + 1
    }))
  }));
  const savedCalls = [];
  const saveAsset = async (_userId, conversationId, image, prefix) => {
    savedCalls.push({ conversationId, prefix, source: image.url });
    return {
      ...image,
      url: `/api/ai/conversations/${conversationId}/assets/${prefix}.png`,
      image_file: `/api/ai/conversations/${conversationId}/assets/${prefix}.png`,
      assetHash: prefix
    };
  };

  const result = await helpers.normalizeAiConversationDetailPlanningMaterials("user-1", "conversation-1", materials, saveAsset);
  assert.equal(result.length, 3);
  assert.equal(result.reduce((sum, material) => sum + material.content.length, 0), 12000);
  assert.equal(result[0].embeddedImages.length, 32);
  assert.equal(savedCalls.length, 96);
  assert.equal(result[0].sheetNames.length, 32);
  assert.equal(result[0].wireframeModuleCount, 32);
  assert.equal(result[0].name.length, 120);
  assert.equal(result[0].embeddedImages[0].name.length, 180);
  assert.match(result[0].embeddedImages[0].url, /^\/api\/ai\/conversations\/conversation-1\/assets\//);
  assert.ok(result.flatMap((material) => material.embeddedImages).every((image) => !image.url.startsWith("data:")));
});

test("ordinary conversations only enter the detail normalizer when materials exist", () => {
  const normalizeSource = extractFunction("normalizeAiConversationAssets");
  assert.match(normalizeSource, /if \(Array\.isArray\(result\.detailPlanningMaterials\)\)/);
  assert.match(normalizeSource, /normalizeAiConversationDetailPlanningMaterials\(userId, conversationId, result\.detailPlanningMaterials\)/);
});
