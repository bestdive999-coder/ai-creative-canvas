import { fileURLToPath } from "node:url";
import { assertNoBundledFontFiles, collectSourceFiles } from "./source-package-policy.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const sourceFiles = await collectSourceFiles(rootDir);
await assertNoBundledFontFiles(rootDir, sourceFiles);
console.log(`Font distribution check passed: ${sourceFiles.length} source files, 0 font binaries.`);
