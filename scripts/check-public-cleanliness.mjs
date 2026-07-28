import { fileURLToPath } from "node:url";
import {
  assertPublicSourceCleanliness,
  collectSourceFiles
} from "./source-package-policy.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const sourceFiles = await collectSourceFiles(rootDir);
await assertPublicSourceCleanliness(rootDir, sourceFiles);
console.log(`Public source cleanliness check passed (${sourceFiles.length} files).`);
