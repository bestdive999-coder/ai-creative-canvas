import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
const frontend = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");

const checks = [
  [
    "A/B 参数没有进入员工端普通生图请求",
    !frontend.includes("multi_reference_ab_mode")
  ],
  [
    "A/B 模式仅允许 formal_multiref_ab_ 测试工作流",
    /function normalizeMultiReferenceAbMode[\s\S]*?\^formal_multiref_ab_/m.test(server)
  ],
  [
    "A/B 模式至少需要两张参考图",
    /function normalizeMultiReferenceAbMode[\s\S]*?referenceCount[\s\S]*?< 2/m.test(server)
  ],
  [
    "A 组继续使用原来的 buildLightweightImagePrompt",
    /multiReferenceAbMode === "role_table"[\s\S]*?buildPositiveMultiReferencePrompt[\s\S]*?: buildLightweightImagePrompt/m.test(server)
  ],
  [
    "B 组使用独立的正向角色表提示",
    server.includes("function buildPositiveMultiReferencePrompt")
      && server.includes("参考图角色表：")
      && server.includes("核心锁定")
  ],
  [
    "B 组区分产品身份与表面材质属性",
    server.includes('return "product_identity"')
      && server.includes('return "surface_attribute"')
      && server.includes('scopeLabel = "表面属性"')
  ],
  [
    "表面材质图继续提交，文字只作为用途说明",
    server.includes("const generationReferences = plannedGenerationReferences;")
      && !server.includes("buildPositiveTextOnlySurfaceAttributeTable")
      && server.includes("multiReferenceSurfaceReferenceCount")
      && server.includes("multiReferenceAllActiveImagesSubmitted")
  ],
  [
    "只有用户主动选择深度思考才启用生产增强",
    /function resolveMultiReferenceEnhancementMode[\s\S]*?normalizeAiThinkingMode\(options\.thinkingMode\) !== "deep"/m.test(server)
      && server.includes('"deep_user_choice"')
  ],
  [
    "Agent、画布续改和选中底图被硬排除",
    /function isMultiReferenceEnhancementExcluded[\s\S]*?isDetailPageAiWorkflow[\s\S]*?isEcommerceDesignAgentEnabled[\s\S]*?isSelectedBaseReference/m.test(server)
      && server.includes('workflow === "canvas_image_edit"')
  ],
  [
    "模型推测为软参考，用户明确材质关系只增加用途说明",
    server.includes("plannedExplicit: false")
      && /surfaceAttributeReferences[\s\S]*?item\?\.plannedExplicit/m.test(server)
  ],
  [
    "结果元数据记录 A/B 模式与角色表",
    server.includes("multiReferenceAbMode,")
      && server.includes("multiReferenceRoleTable:")
  ]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

if (failed) {
  console.error(`Multi-reference A/B isolation check failed: ${failed}`);
  process.exit(1);
}

console.log("Multi-reference A/B isolation check passed.");
