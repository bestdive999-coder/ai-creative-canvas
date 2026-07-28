import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, `server.js is missing ${name}`);
  const endOffset = serverSource.slice(start).indexOf("\n}\n");
  assert.notEqual(endOffset, -1, `could not extract ${name}`);
  return serverSource.slice(start, start + endOffset + 2);
}

const dimensionHelpers = new Function(`
  ${extractFunction("isDetailPageAiWorkflow")}
  ${extractFunction("normalizeImageServiceAspectRatio")}
  ${extractFunction("normalizeImageServiceResolutionTier")}
  ${extractFunction("normalizeImageServiceSize")}
  ${extractFunction("normalizeSecondaryApiImageResolution")}
  ${extractFunction("resolveImageServiceRequestDimensions")}
  return { normalizeImageServiceSize, resolveImageServiceRequestDimensions };
`)();

test("detail-page 3:4 4K keeps one resolution tier across providers", () => {
  const dimensions = dimensionHelpers.resolveImageServiceRequestDimensions("3:4", "4K", "detail_page_design_plan");
  assert.deepEqual(dimensions, {
    aspectRatio: "3:4",
    resolutionTier: "4K",
    primarySize: "2448x3264"
  });

  const [width, height] = dimensions.primarySize.split("x").map(Number);
  assert.equal(width / height, 3 / 4);
  assert.equal(width % 16, 0);
  assert.equal(height % 16, 0);
  assert.ok(Math.max(width, height) <= 3840);
  assert.ok(width * height <= 8_294_400);
  assert.ok((width + 48) * (height + 64) > 8_294_400, "the next exact 3:4 multiple-of-16 size must exceed 服务 A's pixel cap");
  assert.ok(width > 1024 && height > 1536, "detail-page 4K must not silently fall back to 1024x1536");

  assert.match(serverSource, /resolutionTier:\s*requestDimensions\.resolutionTier/);
  assert.match(serverSource, /resolution:\s*options\.resolutionTier\s*\|\|\s*normalizeSecondaryApiImageResolution/g);
});

test("detail-page alias uses the same exact 3:4 4K mapping", () => {
  assert.equal(
    dimensionHelpers.normalizeImageServiceSize("3:4", "4K", { workflow: "detail_page" }),
    "2448x3264"
  );
});

test("ordinary image-service size mapping is unchanged", () => {
  const legacyNormalize = (aspectRatio, requestedSize) => {
    const size = String(requestedSize || "").trim();
    const allowed = new Set(["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"]);
    if (allowed.has(size)) return size;
    const ratio = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"].includes(aspectRatio) ? aspectRatio : "1:1";
    const tier = ["1K", "2K", "4K"].includes(String(requestedSize || "1K").toUpperCase())
      ? String(requestedSize || "1K").toUpperCase()
      : "1K";
    if (ratio === "1:1") return tier === "1K" ? "1024x1024" : "2048x2048";
    if (ratio === "3:2" || ratio === "4:3") return "1536x1024";
    if (ratio === "2:3" || ratio === "3:4") return "1024x1536";
    if (ratio === "16:9") return tier === "4K" ? "3840x2160" : "2048x1152";
    if (ratio === "9:16") return "2160x3840";
    return "1024x1024";
  };
  const ratios = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "invalid"];
  const sizes = ["", "1K", "2K", "4K", "auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"];
  ratios.forEach((ratio) => sizes.forEach((size) => {
    assert.equal(
      dimensionHelpers.normalizeImageServiceSize(ratio, size),
      legacyNormalize(ratio, size),
      `ordinary mapping changed for ${ratio} ${size || "default"}`
    );
  }));
  assert.equal(
    dimensionHelpers.normalizeImageServiceSize("3:4", "1024x1536", { workflow: "detail_page_design_plan" }),
    "1024x1536"
  );
});

test("图片服务请求 still use pixel size while 备用服务回退 uses the shared tier", () => {
  assert.match(serverSource, /body:\s*JSON\.stringify\(\{[\s\S]*?size:\s*options\.size,[\s\S]*?quality:\s*options\.quality/);
  assert.match(serverSource, /aspect_ratio:\s*normalizeSecondaryApiAspectRatio\(options\.aspectRatio\),\s*\n\s*resolution:\s*options\.resolutionTier/);
});
