import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const rootUrl = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, rootUrl), "utf8");

function browserContext() {
  const storage = new Map();
  const window = { EcommerceCanvasApp: {}, setTimeout: () => 0 };
  const context = {
    window,
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Promise,
    requestAnimationFrame: () => 0,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

test("详情页工作簿按原顺序读取所有有价值的 Sheet", async () => {
  const context = browserContext();
  vm.runInContext(await source("public/vendor/xlsx.full.min.js"), context);
  vm.runInContext(await source("public/vendor/jszip.min.js"), context);
  context.window.XLSX ||= context.XLSX;
  context.window.JSZip ||= context.JSZip;
  vm.runInContext(await source("public/src/references.js"), context);

  const workbook = context.window.XLSX.utils.book_new();
  const addSheet = (name, rows) => context.window.XLSX.utils.book_append_sheet(
    workbook,
    context.window.XLSX.utils.aoa_to_sheet(rows),
    name
  );
  addSheet("详情-A", [
    ["屏数", "模块", "线框"],
    [1, "首屏", "产品主视觉"],
    [2, "卖点", "结构拆解"]
  ]);
  addSheet("主图-不应进入", [["主图", "文案"]]);
  addSheet("详情-B", [
    ["屏数", "模块", "线框"],
    [1, "参数", "参数表"]
  ]);
  const bytes = context.window.XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const controller = context.window.EcommerceCanvasApp.createReferenceController({
    createClientId: (() => {
      let id = 0;
      return () => `test-${++id}`;
    })()
  });
  const material = await controller.parseDetailPlanningFile({
    name: "多表详情模板.xlsx",
    size: bytes.byteLength,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    arrayBuffer: async () => bytes
  });

  assert.deepEqual(Array.from(material.selectedSheetNames), ["详情-A", "详情-B"]);
  assert.deepEqual(Array.from(material.sheets, (sheet) => sheet.name), ["详情-A", "详情-B"]);
  assert.deepEqual(Array.from(material.sheets, (sheet) => sheet.moduleCount), [2, 1]);
  assert.equal(material.wireframeModuleCount, 3);
  assert.match(material.content, /工作簿顺序1\/2｜来源 Sheet：详情-A/);
  assert.match(material.content, /工作簿顺序2\/2｜来源 Sheet：详情-B/);
});

test("内嵌图保留 Sheet 来源和模块顺序字段", async () => {
  const references = await source("public/src/references.js");
  assert.match(references, /sourceSheetName:/);
  assert.match(references, /sourceSheetIndex:/);
  assert.match(references, /templateOrder:/);
  assert.match(references, /a\.sourceSheetIndex - b\.sourceSheetIndex/);
});

test("详情页规划附件跟随会话快照保存和恢复", async () => {
  const context = browserContext();
  let saveCalls = 0;
  context.fetch = async () => {
    saveCalls += 1;
    return { ok: true, json: async () => ({ items: [] }) };
  };
  vm.runInContext(await source("public/src/conversations.js"), context);
  const material = { id: "sheet-1", name: "详情模板.xlsx", content: "模块顺序", embeddedImages: [] };
  const state = {
    account: { user: { id: "user-1" } },
    aiDirect: {
      activeConversationId: "conversation-1",
      conversations: [],
      prompt: "",
      turns: [],
      references: [],
      detailPlanningMaterials: [material],
      chatMessages: [],
      generatedImages: [],
      selectedSkillId: "detail-page-planner-agent"
    },
    canvasBeta: {}
  };
  const noOp = () => {};
  const controller = context.window.EcommerceCanvasApp.createConversationController({
    els: {},
    state,
    aiProviders: {},
    createClientId: () => "new-id",
    currentAiProvider: () => "imageservice",
    currentThinkingMode: () => "standard",
    renderThinkingModeHint: noOp,
    loadAiProviderSettings: noOp,
    renderAiSkillSelector: noOp,
    renderReferencePreviewList: noOp,
    renderSelectedEditImageState: noOp,
    renderCanvasFocusTargetChip: noOp,
    renderAiChatList: noOp,
    renderRelayPreview: noOp,
    switchStudioPanel: noOp,
    toast: noOp
  });

  const snapshot = controller.currentAiConversationSnapshot();
  assert.equal(snapshot.detailPlanningMaterials[0].id, material.id);
  state.aiDirect.detailPlanningMaterials = [];
  controller.applyAiConversation(snapshot);
  assert.equal(state.aiDirect.detailPlanningMaterials[0].name, material.name);
  await controller.saveAiConversationNow();
  assert.equal(saveCalls, 1, "只有规划附件时也必须保存会话");
});

test("合成长图使用明确下载文案", async () => {
  const renderer = await source("public/src/ai-chat-renderer.js");
  assert.match(renderer, /image\.mergedDetailPage\s*\?\s*"下载合成长图"\s*:\s*"下载"/);
});
