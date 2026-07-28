import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const vendorPath = new URL("../public/vendor/xlsx.full.min.js", import.meta.url);
const expectedVersion = "0.20.3";
const expectedSha256 = "cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41";
const expectedFabricSha256 = "d4e908b3b3654db92c08ff0f31aa6a72ba1ddeeeb43a93bc41c833e51fe37f58";

async function loadSheetJs() {
  const source = await readFile(vendorPath, "utf8");
  const context = {
    ArrayBuffer,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    clearTimeout,
    console,
    setTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, {
    filename: "xlsx.full.min.js",
    timeout: 5_000
  });
  return { source, XLSX: context.XLSX };
}

test("vendored SheetJS is the reviewed 0.20.3 browser build", async () => {
  const { source, XLSX } = await loadSheetJs();
  assert.equal(XLSX?.version, expectedVersion);
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    expectedSha256
  );
});

test("vendored Fabric.js is the reviewed 7.4.0 browser build", async () => {
  const source = await readFile(new URL("../public/vendor/fabric.min.js", import.meta.url), "utf8");
  assert.match(source, /7\.4\.0/);
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedFabricSha256);
});

test("SheetJS 0.20.3 round-trips the detail planning workbook shape", async () => {
  const { XLSX } = await loadSheetJs();
  const sourceRows = [
    ["屏数", "模块", "线框"],
    [1, "首屏", "主视觉"],
    [2, "卖点", "左右结构"]
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sourceRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "详情页");

  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array"
  });
  const parsed = XLSX.read(bytes, {
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: true,
    type: "array"
  });
  const rows = XLSX.utils.sheet_to_json(parsed.Sheets["详情页"], {
    blankrows: true,
    defval: "",
    header: 1,
    raw: false
  });

  assert.deepEqual(Array.from(rows[0]), sourceRows[0]);
  assert.deepEqual(Array.from(rows[1]), ["1", "首屏", "主视觉"]);
  assert.deepEqual(Array.from(rows[2]), ["2", "卖点", "左右结构"]);
});

test("open-source rembg setup does not auto-download the unlicensed fine model", async () => {
  const [serverSource, setupSource, notices] = await Promise.all([
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare-rembg-runtime.ps1", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8")
  ]);

  assert.match(serverSource, /isnetGeneralUseModelPath/);
  assert.match(serverSource, /开源版不自动下载 isnet-general-use 模型/);
  assert.doesNotMatch(setupSource, /for model in \('u2net', 'isnet-general-use'\)/);
  assert.match(setupSource, /for model in \('u2net',\)/);
  assert.match(notices, /isnet-general-use.+不会由开源版脚本自动下载/s);
  assert.doesNotMatch(notices, /PaddleOCR|PaddlePaddle/);
});
