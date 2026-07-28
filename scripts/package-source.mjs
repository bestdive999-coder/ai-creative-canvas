import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  assertNoBundledFontFiles,
  assertPublicSourceCleanliness,
  collectSourceFiles
} from "./source-package-policy.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
const defaultOutput = join(dirname(rootDir), `${basename(rootDir)}-${packageJson.version}-source.zip`);
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const requestedOutput = outputIndex >= 0 ? args[outputIndex + 1] : "";
if (outputIndex >= 0 && !requestedOutput) {
  throw new Error("--output requires a path.");
}
const outputPath = requestedOutput
  ? (isAbsolute(requestedOutput) ? requestedOutput : resolve(process.cwd(), requestedOutput))
  : defaultOutput;
const checksumPath = `${outputPath}.sha256`;
const force = args.includes("--force");
if (!force && (existsSync(outputPath) || existsSync(checksumPath))) {
  throw new Error(`Output already exists. Remove it or rerun with --force: ${outputPath}`);
}

const sourceFiles = await collectSourceFiles(rootDir);
await assertNoBundledFontFiles(rootDir, sourceFiles);
await assertPublicSourceCleanliness(rootDir, sourceFiles);

const moduleRef = { exports: {} };
const context = {
  module: moduleRef,
  exports: moduleRef.exports,
  Buffer,
  console,
  setTimeout,
  clearTimeout,
  setImmediate,
  clearImmediate,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  Promise
};
context.window = context;
context.self = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(await readFile(join(rootDir, "public/vendor/jszip.min.js"), "utf8"), context);
const JSZip = moduleRef.exports || context.JSZip;
if (typeof JSZip !== "function") {
  throw new Error("Bundled JSZip runtime could not be loaded.");
}

const zip = new JSZip();
const deterministicDate = new Date("1980-01-01T00:00:00.000Z");
for (const relativePath of sourceFiles) {
  zip.file(relativePath, await readFile(join(rootDir, relativePath)), {
    binary: true,
    date: deterministicDate,
    createFolders: false
  });
}
const archive = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
  platform: "UNIX"
});
const digest = createHash("sha256").update(archive).digest("hex");
const temporaryOutput = `${outputPath}.tmp`;
const temporaryChecksum = `${checksumPath}.tmp`;
await writeFile(temporaryOutput, archive, { mode: 0o644 });
await writeFile(temporaryChecksum, `${digest}  ${basename(outputPath)}\n`, { mode: 0o644 });
await rename(temporaryOutput, outputPath);
await rename(temporaryChecksum, checksumPath);

console.log(`Created ${outputPath}`);
console.log(`Files: ${sourceFiles.length}`);
console.log(`SHA-256: ${digest}`);
