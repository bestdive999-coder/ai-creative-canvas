import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fail = (message) => {
  console.error(`Agent isolation check failed: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`✓ ${message}`);

function functionBody(source, name) {
  const patterns = [`function ${name}`, `async function ${name}`];
  const start = patterns.map((pattern) => source.indexOf(pattern)).find((index) => index >= 0);
  if (start < 0) return "";
  const brace = source.indexOf("{", start);
  if (brace < 0) return "";
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

const aiGeneration = read("public/src/ai-generation.js");
const aiSize = read("public/src/ai-size.js");
const canvasImageAi = read("public/src/canvas-image-ai.js");
const appState = read("public/src/app-state.js");
const server = read("server.js");

const detailGate = functionBody(aiGeneration, "isDetailPageAgentRun");
assert(
  detailGate.includes('selectedAiSkillId() === "detail-page-planner-agent"')
    && !/详情页|详情图|详情长图|长图/.test(detailGate),
  "详情页 Agent 只能由 selectedSkillId 触发，不能由普通提示词关键词触发"
);

const normalGeneration = functionBody(aiGeneration, "requestAiImageGeneration");
assert(
  !/detail-page-planner-agent|detailPageAgentRun|detail_page_design_plan|isDesignPlanAgentSelected/.test(normalGeneration),
  "普通 requestAiImageGeneration 不包含详情页/设计编排分支"
);

const detailSizeLock = functionBody(aiSize, "syncDetailPageFixedOutputSettings");
assert(
  detailSizeLock && !/localStorage\.setItem/.test(detailSizeLock),
  "详情页 Agent 的 3:4 / 4K 锁定不写入普通生图 localStorage"
);

assert(
  !aiGeneration.includes("当前只生成第"),
  "Agent 执行提示词不再使用“当前只生成第 X 张”"
);

assert(
  aiGeneration.includes("runConfirmedDesignPlan(ai, userPrompt, generationConversation"),
  "Agent 执行图片记录使用用户原话，不把带 Skills 的请求提示词写入历史图片"
);

assert(
  !/detail-page-planner-agent|detail_page_design_plan|main-image-matrix-agent/.test(canvasImageAi),
  "图片续改实现文件不包含详情页/主图编排 Agent 专用链路"
);

assert(
  /id:\s*"detail-page-planner-agent"[\s\S]*?allowCanvasImageEdit:\s*false/.test(appState)
    && /id:\s*"main-image-matrix-agent"[\s\S]*?allowCanvasImageEdit:\s*false/.test(appState),
  "编排型 Agent 在前端默认配置中禁止进入图片续改"
);

assert(
  /id:\s*"detail-page-planner-agent"[\s\S]*?allowCanvasImageEdit:\s*false/.test(server)
    && /id:\s*"main-image-matrix-agent"[\s\S]*?allowCanvasImageEdit:\s*false/.test(server),
  "编排型 Agent 在后端默认配置中禁止进入图片续改"
);

assert(
  /allowCanvasImageEdit:\s*item\?\.allowCanvasImageEdit !== false/.test(server),
  "后端 Agent 配置归一化保留 allowCanvasImageEdit 字段"
);

const referenceGuard = functionBody(server, "stripNonReferenceImageMentions");
assert(
  referenceGuard && !/internalModuleOrdinalPattern|internalModuleNumberPattern/.test(referenceGuard),
  "全局图号校验没有加入 Agent 模块编号特殊兜底"
);

if (process.exitCode) process.exit(process.exitCode);
console.log("Agent isolation check passed.");
