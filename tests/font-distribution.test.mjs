import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertNoBundledFontFiles,
  collectSourceFiles,
  findBundledFontFiles
} from "../scripts/source-package-policy.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

test("open-source source tree contains no distributable font binaries", async () => {
  const files = await collectSourceFiles(rootDir);
  assert.deepEqual(await findBundledFontFiles(rootDir, files), []);
});

test("font policy detects extensions and disguised font magic", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "canvas-font-policy-"));
  try {
    await mkdir(join(fixture, "fonts"), { recursive: true });
    await writeFile(join(fixture, "fonts", "unauthorized.ttf"), Buffer.from("not-a-real-font"));
    await writeFile(join(fixture, "fonts", "disguised.bin"), Buffer.from("OTTOtest"));
    const files = await collectSourceFiles(fixture);
    const blocked = await findBundledFontFiles(fixture, files);
    assert.deepEqual(blocked, ["fonts/disguised.bin", "fonts/unauthorized.ttf"]);
    await assert.rejects(() => assertNoBundledFontFiles(fixture, files), /font binaries/i);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("canvas and interface use a portable system font stack", async () => {
  const { readFile } = await import("node:fs/promises");
  const [state, objects, assets, employeeCss, adminCss, packager] = await Promise.all([
    readFile(join(rootDir, "public/src/app-state.js"), "utf8"),
    readFile(join(rootDir, "public/src/canvas-objects.js"), "utf8"),
    readFile(join(rootDir, "public/src/canvas-assets.js"), "utf8"),
    readFile(join(rootDir, "public/styles.css"), "utf8"),
    readFile(join(rootDir, "admin-public/styles.css"), "utf8"),
    readFile(join(rootDir, "scripts/package-source.mjs"), "utf8")
  ]);
  assert.match(state, /canvasSystemFontFamily/);
  assert.match(state, /system-ui/);
  assert.doesNotMatch(objects, /Microsoft YaHei/);
  assert.doesNotMatch(assets, /Microsoft YaHei/);
  assert.match(employeeCss, /ui-sans-serif,[\s\S]*system-ui/);
  assert.match(adminCss, /ui-sans-serif,\s*system-ui/);
  assert.match(packager, /assertNoBundledFontFiles/);
});
