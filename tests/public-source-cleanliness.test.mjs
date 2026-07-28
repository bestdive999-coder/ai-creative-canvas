import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  collectSourceFiles,
  findPublicSourceResidue,
  shouldExcludeSourcePath
} from "../scripts/source-package-policy.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

test("public source excludes internal release history and passes the residue scan", async () => {
  assert.equal(shouldExcludeSourcePath(["OPEN_SOURCE", "RELEASE", "CHECKLIST.md"].join("_")), true);
  assert.equal(shouldExcludeSourcePath(["docs", "verification", "example.md"].join("/")), true);
  const files = await collectSourceFiles(rootDir);
  assert.deepEqual(await findPublicSourceResidue(rootDir, files), []);
});

test("public residue scan detects private names, local paths, and source comments", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "canvas-public-cleanliness-"));
  await mkdir(join(fixture, "public"), { recursive: true });
  const privateName = String.fromCodePoint(0x70ed, 0x6d6a);
  const privatePath = ["", "Users", "bot", "Documents", privateName].join("/");
  await writeFile(join(fixture, "public", "app.js"), `// internal note\nconst source = '${privatePath}';\n`);
  const findings = await findPublicSourceResidue(fixture);
  assert.ok(findings.some((item) => item.reason === "first-party source comment"));
  assert.ok(findings.some((item) => item.reason === "private product name"));
  assert.ok(findings.some((item) => item.reason === "developer home path"));
});
