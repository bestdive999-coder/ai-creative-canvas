import { open, readdir } from "node:fs/promises";
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

function normalizedSourcePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function shouldExcludeSourcePath(relativePath) {
  const normalized = normalizedSourcePath(relativePath);
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
