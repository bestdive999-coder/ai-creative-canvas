import { open, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

export const fontBinaryExtensions = new Set([
  ".dfont",
  ".eot",
  ".fon",
  ".otf",
  ".pfa",
  ".pfb",
  ".ttc",
  ".ttf",
  ".woff",
  ".woff2"
]);

const excludedTopLevelDirectories = new Set([
  ".git",
  "coverage",
  "node_modules",
  "output",
  "outputs",
  "runtime",
  "tmp"
]);

const excludedFileNames = new Set([
  ".DS_Store",
  ".env",
  "Thumbs.db",
  "desktop.ini"
]);

const internalReleaseChecklist = ["OPEN_SOURCE", "RELEASE", "CHECKLIST.md"].join("_");
const internalVerificationDirectory = ["docs", "verification"].join("/");
const privateChineseName = String.fromCodePoint(0x70ed, 0x6d6a);

const publicTextExtensions = new Set([
  ".bat",
  ".cmd",
  ".css",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".txt",
  ".yaml",
  ".yml"
]);

const publicResiduePatterns = [
  { label: "private product name", pattern: new RegExp(privateChineseName, "iu") },
  { label: "private product name", pattern: new RegExp(`\\b${["heat", "wave"].join("")}\\b`, "iu") },
  { label: "original private checkout", pattern: new RegExp(["ecommerce-ai-worker-canvas", "beta"].join("-"), "iu") },
  { label: "developer home path", pattern: new RegExp(["", "Users", "bot"].join("/") + "\\b", "iu") },
  { label: "developer workspace path", pattern: new RegExp(["Documents", privateChineseName].join("[\\\\/]"), "iu") },
  { label: "removed workflow brand", pattern: /广审\s*套版/iu },
  { label: "removed workflow name", pattern: /\bppt[ _-]?agent\b/iu },
  { label: "removed workflow name", pattern: /\bpsd[ _-]?agent\b/iu },
  { label: "internal verification path", pattern: new RegExp(internalVerificationDirectory.replace("/", "[\\\\/]"), "iu") },
  { label: "internal release checklist", pattern: new RegExp(internalReleaseChecklist.replace(".", "\\."), "iu") }
];

function normalizedSourcePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function shouldExcludeSourcePath(relativePath) {
  const normalized = normalizedSourcePath(relativePath);
  if (normalized === internalReleaseChecklist
    || normalized.startsWith(`${internalVerificationDirectory}/`)) {
    return true;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return false;
  if (excludedTopLevelDirectories.has(parts[0])) return true;
  const fileName = parts.at(-1);
  if (excludedFileNames.has(fileName)) return true;
  const lower = fileName.toLowerCase();
  return lower.endsWith(".log")
    || lower.endsWith(".tmp")
    || lower.endsWith(".zip")
    || lower.endsWith(".zip.sha256");
}

export async function collectSourceFiles(rootDir) {
  const files = [];

  async function visit(relativeDir = "") {
    const absoluteDir = relativeDir ? join(rootDir, relativeDir) : rootDir;
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = normalizedSourcePath(join(relativeDir, entry.name));
      if (shouldExcludeSourcePath(relativePath)) continue;
      if (entry.isSymbolicLink()) {
        throw new Error(`Source package refuses symbolic links: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await visit();
  return files;
}

async function hasFontMagic(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 4) return false;
    const ascii = header.toString("ascii");
    return header.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))
      || ascii === "OTTO"
      || ascii === "ttcf"
      || ascii === "wOFF"
      || ascii === "wOF2";
  } finally {
    await handle.close();
  }
}

export async function findBundledFontFiles(rootDir, sourceFiles = null) {
  const files = sourceFiles || await collectSourceFiles(rootDir);
  const blocked = [];
  for (const relativePath of files) {
    const extension = extname(relativePath).toLowerCase();
    if (fontBinaryExtensions.has(extension) || await hasFontMagic(join(rootDir, relativePath))) {
      blocked.push(relativePath);
    }
  }
  return blocked;
}

export async function assertNoBundledFontFiles(rootDir, sourceFiles = null) {
  const blocked = await findBundledFontFiles(rootDir, sourceFiles);
  if (blocked.length) {
    throw new Error(
      `Source package contains font binaries. Remove them or document redistribution rights first:\n${blocked.map((item) => `- ${item}`).join("\n")}`
    );
  }
  return sourceFiles || await collectSourceFiles(rootDir);
}

function firstPartyCommentMatch(relativePath, source) {
  const extension = extname(relativePath).toLowerCase();
  if (extension === ".css") return source.match(/\/\*[\s\S]*?\*\//u);
  if (extension === ".html") return source.match(/<!--[\s\S]*?-->/u);
  if (extension === ".js" || extension === ".mjs") {
    return source.match(/^\s*\/\/.*$/mu)
      || source.match(/^\s*\/\*[\s\S]*?\*\//mu);
  }
  if (extension === ".ps1") return source.match(/^\s*#(?!requires\b).*$/imu);
  if (extension === ".bat" || extension === ".cmd") {
    return source.match(/^\s*(?:REM\b|::).*$/imu);
  }
  return null;
}

function lineNumberForMatch(source, index) {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

export async function findPublicSourceResidue(rootDir, sourceFiles = null) {
  const files = sourceFiles || await collectSourceFiles(rootDir);
  const findings = [];
  for (const relativePath of files) {
    if (relativePath.startsWith("public/vendor/")
      || relativePath.startsWith("third_party_licenses/")) {
      continue;
    }
    const extension = extname(relativePath).toLowerCase();
    if (!publicTextExtensions.has(extension)) continue;
    const source = await readFile(join(rootDir, relativePath), "utf8");
    for (const entry of publicResiduePatterns) {
      const match = source.match(entry.pattern);
      if (!match) continue;
      findings.push({
        path: relativePath,
        line: lineNumberForMatch(source, match.index),
        reason: entry.label
      });
    }
    const comment = firstPartyCommentMatch(relativePath, source);
    if (comment) {
      findings.push({
        path: relativePath,
        line: lineNumberForMatch(source, comment.index),
        reason: "first-party source comment"
      });
    }
  }
  return findings;
}

export async function assertPublicSourceCleanliness(rootDir, sourceFiles = null) {
  const files = sourceFiles || await collectSourceFiles(rootDir);
  const findings = await findPublicSourceResidue(rootDir, files);
  if (findings.length) {
    throw new Error(
      `Public source cleanliness check failed:\n${findings.map((item) => `- ${item.path}:${item.line} (${item.reason})`).join("\n")}`
    );
  }
  return files;
}
