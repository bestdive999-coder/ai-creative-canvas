import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, copyFile, cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, normalize, parse, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = process.env.ECOMMERCE_CANVAS_APP_ROOT || __dirname;
const runtimeDir = join(appRoot, "runtime");
const intranetDir = join(runtimeDir, "intranet");
const updatesDir = join(runtimeDir, "updates");
const updateWorkDir = join(tmpdir(), "ecommerce-ai-worker-updates");
const updateBackupRoot = join(appRoot, "..", "app-update-backups");
const exportStageRoot = join(appRoot, "..", "app-export-stages");
const logDir = join(runtimeDir, "logs");
const pythonRuntimeDir = join(runtimeDir, "python");
const pythonPackagesDir = join(runtimeDir, "python-packages");
const rembgModelsDir = join(runtimeDir, "rembg-models");
const pythonExecutablePath = join(pythonRuntimeDir, "python.exe");
const tokenPath = join(intranetDir, "maintenance-token.txt");
const updateStatusPath = join(intranetDir, "update-status.json");
const uninstallStatusPath = join(intranetDir, "uninstall-status.json");
const uninstallLocalChallengePath = join(intranetDir, "uninstall-local-confirmation.json");
const updateLogPath = join(logDir, "update.log");
const agentLogPath = join(logDir, "maintenance-agent.log");
const launcherLogPath = join(logDir, "update-launcher.log");
const host = process.env.ECOM_MAINTENANCE_HOST || "127.0.0.1";
const port = Number(process.env.ECOM_MAINTENANCE_PORT || 5199);
const employeeTaskName = "EcommerceAI-Main";
const adminTaskName = "EcommerceAI-Admin";
const guardianTaskName = "EcommerceAI-Guardian";
const maxUpdateBackups = 5;
const maxUpdateWorkEntries = 40;
const maxExportArchives = 8;
const uninstallRequestTtlMs = 15 * 60 * 1000;
const maxMaintenanceJsonBodyBytes = 1024 * 1024;
const maxRemoteDownloadBytes = 600 * 1024 * 1024;
const maxProbeDownloadBytes = 64 * 1024 * 1024;
const maxZipEntries = 20_000;
let updateInProgress = false;
let uninstallRequestInProgress = false;

function nowIso() {
  return new Date().toISOString();
}

async function log(message) {
  await mkdir(logDir, { recursive: true });
  await appendFile(agentLogPath, `[${new Date().toLocaleString("zh-CN", { hour12: false })}] ${message}\n`, "utf8");
}

async function ensureToken() {
  await mkdir(intranetDir, { recursive: true });
  try {
    const existing = (await readFile(tokenPath, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
  }
  const token = randomBytes(32).toString("hex");
  await writeFile(tokenPath, token, "utf8");
  return token;
}

function secureCompare(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxMaintenanceJsonBodyBytes) {
    throw agentError("Request body exceeds the 1MB limit.", 413);
  }
  const chunks = [];
  let received = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    received += chunk.length;
    if (tooLarge || received > maxMaintenanceJsonBodyBytes) {
      chunks.length = 0;
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw agentError("Request body exceeds the 1MB limit.", 413);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw agentError("Request JSON is invalid.", 400);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function jsonHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
}

async function getTextTail(path, lines = 80) {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function defaultUpdateStatus() {
  return {
    status: "idle",
    message: "No update task.",
    packageUrl: "",
    packagePath: "",
    startedAt: "",
    finishedAt: ""
  };
}

async function readStoredUpdateStatus() {
  let status = defaultUpdateStatus();
  try {
    status = { ...status, ...JSON.parse(await readFile(updateStatusPath, "utf8")) };
  } catch {
  }
  delete status.logTail;
  delete status.launcherLogTail;
  return status;
}

async function readUpdateStatus() {
  const status = await readStoredUpdateStatus();
  return {
    ...status,
    logTail: await getTextTail(updateLogPath, 80),
    launcherLogTail: await getTextTail(launcherLogPath, 80)
  };
}

async function writeUpdateStatus(status) {
  await mkdir(intranetDir, { recursive: true });
  const current = await readStoredUpdateStatus();
  await writeFile(updateStatusPath, JSON.stringify({ ...current, ...status, updatedAt: nowIso() }, null, 2), "utf8");
}

async function appendUpdateLog(message) {
  await mkdir(logDir, { recursive: true });
  await appendFile(updateLogPath, `[${new Date().toLocaleString("zh-CN", { hour12: false })}] ${message}\n`, "utf8");
}

function defaultUninstallStatus() {
  return {
    status: "idle",
    message: "No uninstall request.",
    requestId: "",
    requestedBy: "",
    requestedAt: "",
    expiresAt: "",
    confirmedAt: ""
  };
}

async function readStoredUninstallStatus() {
  try {
    return { ...defaultUninstallStatus(), ...JSON.parse(await readFile(uninstallStatusPath, "utf8")) };
  } catch {
    return defaultUninstallStatus();
  }
}

function publicUninstallStatus(status = {}) {
  const {
    code: _code,
    codeHash: _codeHash,
    ...safe
  } = { ...defaultUninstallStatus(), ...status };
  return safe;
}

async function writeUninstallStatus(status) {
  await mkdir(intranetDir, { recursive: true });
  const current = await readStoredUninstallStatus();
  await writeFile(uninstallStatusPath, JSON.stringify({
    ...current,
    ...status,
    updatedAt: nowIso()
  }, null, 2), "utf8");
}

async function readUninstallStatus() {
  const status = await readStoredUninstallStatus();
  const expiresAt = new Date(status.expiresAt || "").getTime();
  if (status.status === "awaiting-local-confirmation" && expiresAt && expiresAt <= Date.now()) {
    await rm(uninstallLocalChallengePath, { force: true }).catch(() => {});
    await writeUninstallStatus({
      status: "expired",
      message: "Local confirmation expired. Start a new request.",
      codeHash: ""
    });
    return publicUninstallStatus({
      ...status,
      status: "expired",
      message: "Local confirmation expired. Start a new request.",
      codeHash: ""
    });
  }
  return publicUninstallStatus(status);
}

function isAdministrator() {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
    ], { windowsHide: true, stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: appRoot, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr || "Timeout" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message || String(error) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function toFileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const name = basename(parsed.pathname || "package.zip");
    return name || "package.zip";
  } catch {
    return "package.zip";
  }
}

async function downloadUrlToFile(url, targetPath, maxBytes = maxRemoteDownloadBytes) {
  await mkdir(join(targetPath, ".."), { recursive: true });
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  if (!response.body) throw new Error("Download failed: response body is empty.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Download exceeds the ${Math.ceil(maxBytes / 1024 / 1024)}MB limit.`);
  }
  let bytes = 0;
  const hash = createHash("sha256");
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`Download exceeds the ${Math.ceil(maxBytes / 1024 / 1024)}MB limit.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(targetPath));
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => {});
    throw error;
  }
  return {
    path: targetPath,
    bytes,
    sha256: hash.digest("hex"),
    contentType: response.headers.get("content-type") || ""
  };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function assertSha256(expected) {
  const value = String(expected || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("A trusted 64-character SHA-256 is required.");
  }
  return value;
}

function assertMatchingSha256(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || "").toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(assertSha256(expected), "hex");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error(`Package SHA-256 mismatch. Expected ${expected}; received ${actual}.`);
  }
}

async function probeDownload(body) {
  const url = String(body.url || body.packageUrl || "").trim();
  if (!url) throw new Error("Probe URL is required.");
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Probe URL must start with http or https.");
  const targetDir = join(runtimeDir, "maintenance-probes");
  const targetPath = join(targetDir, `${timestamp()}-${toFileNameFromUrl(url)}`);
  const result = await downloadUrlToFile(url, targetPath, maxProbeDownloadBytes);
  await log(`Probe download ok bytes=${result.bytes} url=${url}`);
  return { ok: true, ...result };
}

async function clearUpdateStatus() {
  await mkdir(intranetDir, { recursive: true });
  await writeFile(updateStatusPath, JSON.stringify({
    ...defaultUpdateStatus(),
    status: "idle",
    message: "No update task.",
    packageUrl: "",
    packagePath: "",
    startedAt: "",
    finishedAt: nowIso(),
    requestedBy: "",
    backup: "",
    uploadedAt: "",
    updatedAt: nowIso()
  }, null, 2), "utf8");
  await log("Update status cleared.");
  return { ok: true, update: await readUpdateStatus() };
}

async function fileCountAndBytes(root) {
  let files = 0;
  let bytes = 0;
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += Number((await stat(full)).size || 0);
        } catch {}
      }
    }
  }
  await walk(root);
  return { files, bytes };
}

async function pruneOldEntries(root, options = {}) {
  const keep = Math.max(0, Number(options.keep || 0));
  if (!keep || !existsSync(root)) return { removed: 0 };
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { removed: 0 };
  }
  const prefix = String(options.prefix || "");
  const includeFiles = options.files !== false;
  const includeDirectories = options.directories !== false;
  const rows = [];
  for (const entry of entries) {
    if (prefix && !entry.name.startsWith(prefix)) continue;
    if (entry.isFile() && !includeFiles) continue;
    if (entry.isDirectory() && !includeDirectories) continue;
    if (!entry.isFile() && !entry.isDirectory()) continue;
    const full = join(root, entry.name);
    const info = await stat(full).catch(() => null);
    rows.push({
      path: full,
      isDirectory: entry.isDirectory(),
      mtimeMs: Number(info?.mtimeMs || 0)
    });
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let removed = 0;
  for (const row of rows.slice(keep)) {
    await rm(row.path, { recursive: row.isDirectory, force: true }).catch(() => {});
    removed += 1;
  }
  return { removed };
}

function isValidPackageAppRoot(candidate) {
  return (
    existsSync(join(candidate, "server.js")) &&
    existsSync(join(candidate, "admin-server.js")) &&
    existsSync(join(candidate, "public")) &&
    existsSync(join(candidate, "admin-public"))
  );
}

async function resolvePackageAppRoot(extractRoot) {
  const candidates = [
    extractRoot,
    join(extractRoot, "app"),
    join(extractRoot, "update-app")
  ];
  async function walk(dir, depth = 0) {
    if (depth > 8 || candidates.length > 300) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      await appendUpdateLog(`scan warning ${dir}: ${error.message || error}`);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (/\\runtime(\\|$)/i.test(full)) continue;
      candidates.push(full);
      await walk(full, depth + 1);
    }
  }
  await walk(extractRoot);
  for (const candidate of [...new Set(candidates)]) {
    if (isValidPackageAppRoot(candidate)) {
      return candidate;
    }
  }
  const uniqueCandidates = [...new Set(candidates)];
  await appendUpdateLog(`scanned candidates: ${uniqueCandidates.slice(0, 80).join(" | ")}`);
  throw new Error("No valid app folder found in update package. Expected server.js, admin-server.js, public and admin-public in the same folder.");
}

async function backupCurrentApp() {
  const backupDir = join(updateBackupRoot, `agent-update-${timestamp()}`);
  const runtimeRoot = normalize(runtimeDir).toLowerCase();
  await mkdir(backupDir, { recursive: true });
  await cp(appRoot, backupDir, {
    recursive: true,
    force: true,
    filter: (source) => !normalize(source).toLowerCase().startsWith(runtimeRoot)
  });
  const pruned = await pruneOldEntries(updateBackupRoot, {
    keep: maxUpdateBackups,
    files: false,
    directories: true,
    prefix: "agent-update-"
  });
  if (pruned.removed) await appendUpdateLog(`pruned ${pruned.removed} old update backups`);
  return backupDir;
}

async function applyPackage(packageRoot) {
  const packageRuntime = normalize(join(packageRoot, "runtime")).toLowerCase();
  const packageTemplates = normalize(join(packageRoot, "templates")).toLowerCase();
  await cp(packageRoot, appRoot, {
    recursive: true,
    force: true,
    filter: (source) => {
      const value = normalize(source).toLowerCase();
      return !value.startsWith(packageRuntime) && !value.startsWith(packageTemplates);
    }
  });
  await applyBundledRuntimeDependencies(packageRoot);
}

async function copyBundledRuntimeDependency(packageRoot, name, targetDir) {
  const source = join(packageRoot, "runtime", name);
  if (!existsSync(source)) return false;
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(source, targetDir, { recursive: true, force: true });
  return true;
}

async function applyBundledRuntimeDependencies(packageRoot) {
  const copied = [];
  if (await copyBundledRuntimeDependency(packageRoot, "python", pythonRuntimeDir)) copied.push("runtime\\python");
  if (await copyBundledRuntimeDependency(packageRoot, "python-packages", pythonPackagesDir)) copied.push("runtime\\python-packages");
  if (await copyBundledRuntimeDependency(packageRoot, "rembg-models", rembgModelsDir)) copied.push("runtime\\rembg-models");
  if (copied.length) {
    await appendUpdateLog(`runtime dependency bundle applied: ${copied.join(", ")}`);
  }
}

async function expandZip(zipPath, extractRoot) {
  await assertSafeZipEntries(zipPath);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  const tarResult = await runCommand("tar.exe", ["-xf", zipPath, "-C", extractRoot], 180000);
  if (!tarResult.ok) {
    await appendUpdateLog(`tar extract failed; fallback to Expand-Archive: ${tarResult.stderr || tarResult.stdout || "unknown error"}`);
    const command = `Expand-Archive -LiteralPath '${psSingle(zipPath)}' -DestinationPath '${psSingle(extractRoot)}' -Force`;
    const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], 180000);
    if (!result.ok) throw new Error(result.stderr || result.stdout || `Expand-Archive failed with code ${result.code}`);
  }
  await assertExtractedTreeContained(extractRoot);
  return extractRoot;
}

function assertSafeZipEntryName(value) {
  const raw = String(value || "");
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (
    !normalized
    || normalized.length > 512
    || normalized.startsWith("/")
    || normalized.startsWith("//")
    || /^[A-Za-z]:/.test(normalized)
    || parts.includes("..")
    || raw.includes("\0")
  ) {
    throw new Error(`Unsafe path in ZIP package: ${raw.slice(0, 160) || "(empty)"}`);
  }
}

async function assertSafeZipEntries(zipPath) {
  const listing = await runCommand("tar.exe", ["-tf", zipPath], 60000);
  let entries = [];
  if (listing.ok) {
    entries = listing.stdout.split(/\r?\n/).filter(Boolean).map((fullName) => ({ fullName, externalAttributes: 0 }));
    const verbose = await runCommand("tar.exe", ["-tvf", zipPath], 60000);
    if (verbose.ok && verbose.stdout.split(/\r?\n/).some((line) => /^[lh]/i.test(line))) {
      throw new Error("ZIP package contains a symbolic or hard link.");
    }
  } else {
    const command = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `$zip = [IO.Compression.ZipFile]::OpenRead('${psSingle(zipPath)}')`,
      "try { @($zip.Entries | ForEach-Object { [pscustomobject]@{ FullName = $_.FullName; ExternalAttributes = $_.ExternalAttributes } }) | ConvertTo-Json -Compress } finally { $zip.Dispose() }"
    ].join("; ");
    const fallback = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], 60000);
    if (!fallback.ok) {
      throw new Error(fallback.stderr || fallback.stdout || "Unable to inspect ZIP package.");
    }
    const parsed = JSON.parse(fallback.stdout || "[]");
    entries = (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
      fullName: entry.FullName,
      externalAttributes: Number(entry.ExternalAttributes || 0)
    }));
  }
  if (!entries.length) throw new Error("ZIP package is empty.");
  if (entries.length > maxZipEntries) throw new Error(`ZIP package contains more than ${maxZipEntries} entries.`);
  for (const entry of entries) {
    assertSafeZipEntryName(entry.fullName);
    const unixMode = (entry.externalAttributes >>> 16) & 0xf000;
    if (unixMode === 0xa000) throw new Error(`ZIP package contains a symbolic link: ${entry.fullName}`);
  }
}

async function assertExtractedTreeContained(extractRoot) {
  const root = await realpath(extractRoot);
  const rootPrefix = `${normalize(root).toLowerCase()}${sep}`;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error(`Extracted package contains a symbolic link: ${entry.name}`);
      const canonical = normalize(await realpath(full)).toLowerCase();
      if (canonical !== normalize(root).toLowerCase() && !canonical.startsWith(rootPrefix)) {
        throw new Error(`Extracted package escaped the staging directory: ${entry.name}`);
      }
      if (info.isDirectory()) await walk(full);
    }
  }
  await walk(root);
}

function safeAsciiFileName(value, fallback = "package.zip") {
  const raw = basename(String(value || fallback));
  const cleaned = raw
    .replace(/\.zip$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${cleaned || fallback.replace(/\.zip$/i, "")}.zip`;
}

async function stagePackageForExtraction(packagePath) {
  await mkdir(updateWorkDir, { recursive: true });
  const original = String(packagePath || "").trim();
  if (!original) throw new Error("Update package path is empty.");
  if (!existsSync(original)) throw new Error(`Update package not found: ${original}`);
  if (extname(original).toLowerCase() !== ".zip") throw new Error(`Update package must be a ZIP file: ${original}`);
  const target = join(updateWorkDir, `${timestamp()}-${randomBytes(4).toString("hex")}-${safeAsciiFileName(original)}`);
  await copyFile(original, target);
  await appendUpdateLog(`staged package for extraction: ${target}`);
  return target;
}

async function startRestartFinalizer(backupDir) {
  const applianceScript = join(appRoot, "scripts", "start-intranet-appliance.ps1");
  if (!existsSync(applianceScript)) throw new Error("Missing scripts\\start-intranet-appliance.ps1.");
  await mkdir(updateWorkDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const finalizerPath = join(updateWorkDir, `restart-finalize-${Date.now()}.ps1`);
  const agentStarter = join(appRoot, "scripts", "start-maintenance-agent.ps1");
  const script = [
    "$ErrorActionPreference = 'Continue'",
    "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}",
    `$StatusPath = '${psSingle(updateStatusPath)}'`,
    `$UpdateLogPath = '${psSingle(updateLogPath)}'`,
    `$LauncherLogPath = '${psSingle(launcherLogPath)}'`,
    `$ApplianceScript = '${psSingle(applianceScript)}'`,
    `$AgentStarter = '${psSingle(agentStarter)}'`,
    `$BackupDir = '${psSingle(backupDir)}'`,
    "function Add-UpdateLog($Text) {",
    "  try { Add-Content -LiteralPath $UpdateLogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Text) } catch {}",
    "}",
    "function Write-Status($Status, $Message) {",
    "  try {",
    "    $current = @{}",
    "    if (Test-Path -LiteralPath $StatusPath) {",
    "      try {",
    "        $obj = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json",
    "        if ($obj) { $obj.PSObject.Properties | ForEach-Object { $current[$_.Name] = $_.Value } }",
    "      } catch {}",
    "    }",
    "    $current['status'] = $Status",
    "    $current['message'] = $Message",
    "    $current['backup'] = $BackupDir",
    "    $current['updatedAt'] = (Get-Date -Format 'o')",
    "    if ($Status -eq 'failed' -or $Status -eq 'complete') { $current['finishedAt'] = (Get-Date -Format 'o') }",
    "    $current | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusPath -Encoding UTF8",
    "  } catch {}",
    "}",
    "function Test-Url($Url) {",
    "  try {",
    "    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3",
    "    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)",
    "  } catch { return $false }",
    "}",
    "function Get-PortPids($Port) {",
    "  $processIds = @()",
    "  try {",
    "    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | ForEach-Object {",
    "      if ($_.OwningProcess -and $_.OwningProcess -gt 0) { $processIds += [int]$_.OwningProcess }",
    "    }",
    "  } catch {}",
    "  return @($processIds | Sort-Object -Unique)",
    "}",
    "try {",
    "  Add-UpdateLog 'restart finalizer started'",
    "  Write-Status 'restarting' 'Restarting services.'",
    "  $beforePids = @((Get-PortPids 5173) + (Get-PortPids 5188))",
    "  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ApplianceScript,'-SkipMaintenanceAgent') -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $ApplianceScript) | Out-Null",
    "  Add-UpdateLog 'appliance restart launched'",
    "  for ($i = 1; $i -le 90; $i += 1) {",
    "    $afterPids = @((Get-PortPids 5173) + (Get-PortPids 5188))",
    "    $changed = $false",
    "    foreach ($afterPid in $afterPids) { if ($beforePids -notcontains $afterPid) { $changed = $true } }",
    "    if ($changed -and (Test-Url 'http://127.0.0.1:5173/api/health') -and (Test-Url 'http://127.0.0.1:5188/')) {",
    "      Write-Status 'complete' 'Update completed.'",
    "      Add-UpdateLog 'agent update complete'",
    "      if (Test-Path -LiteralPath $AgentStarter) {",
    "        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$AgentStarter) -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $ApplianceScript) | Out-Null",
    "      }",
    "      exit 0",
    "    }",
    "    Start-Sleep -Seconds 1",
    "  }",
    "  throw 'Services did not become healthy within 90 seconds.'",
    "} catch {",
    "  Add-UpdateLog ('agent update failed during restart: ' + $_.Exception.Message)",
    "  Write-Status 'failed' ('Restart failed: ' + $_.Exception.Message)",
    "  exit 1",
    "}"
  ].join("\r\n");
  await writeFile(finalizerPath, `\uFEFF${script}`, "utf8");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${psSingle(finalizerPath)}') -WorkingDirectory '${psSingle(updateWorkDir)}' -WindowStyle Hidden`
  ].join("; ");
  const launched = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], 10000);
  if (!launched.ok) throw new Error(launched.stderr || launched.stdout || "Failed to launch restart finalizer.");
  await appendUpdateLog(`restart finalizer launched script=${finalizerPath}`);
  return { ok: true, scriptPath: finalizerPath };
}

async function runUpdateTask(input) {
  if (updateInProgress) throw new Error("Another update task is already running.");
  updateInProgress = true;
  let backupDir = "";
  try {
    await appendUpdateLog(`agent update started ${input.mode}=${input.value}`);
    await writeUpdateStatus({
      status: "downloading",
      message: "Downloading update package.",
      packageUrl: input.mode === "url" ? input.value : "",
      packagePath: input.mode === "path" ? input.value : "",
      packageSha256: input.sha256,
      startedAt: nowIso(),
      finishedAt: ""
    });

    let packagePath = input.value;
    let download = null;
    if (input.mode === "url") {
      const packageName = toFileNameFromUrl(input.value);
      packagePath = join(updateWorkDir, `download-${timestamp()}-${safeAsciiFileName(packageName)}`);
      download = await downloadUrlToFile(input.value, packagePath);
      await appendUpdateLog(`downloaded ${download.bytes} bytes sha256=${download.sha256}`);
      assertMatchingSha256(download.sha256, input.sha256);
    }
    if (extname(packagePath).toLowerCase() !== ".zip") {
      throw new Error(`Downloaded ${download?.bytes || 0} bytes, but update package is not a ZIP: ${packagePath}`);
    }

    await writeUpdateStatus({ status: "extracting", message: "Extracting update package." });
    const stagedPackagePath = input.mode === "path" ? await stagePackageForExtraction(packagePath) : packagePath;
    if (input.mode === "path") {
      const actualSha256 = await sha256File(stagedPackagePath);
      await appendUpdateLog(`staged package sha256=${actualSha256}`);
      assertMatchingSha256(actualSha256, input.sha256);
    }
    await writeUpdateStatus({ packagePath: stagedPackagePath });
    const extractRoot = join(updateWorkDir, `extract-${timestamp()}-${randomBytes(3).toString("hex")}`);
    await expandZip(stagedPackagePath, extractRoot);
    const packageRoot = await resolvePackageAppRoot(extractRoot);
    const packageStats = await fileCountAndBytes(packageRoot);
    await appendUpdateLog(`package root ${packageRoot}; ${packageStats.files} files / ${packageStats.bytes} bytes`);

    await writeUpdateStatus({ status: "backing-up", message: "Backing up current app." });
    backupDir = await backupCurrentApp();
    await appendUpdateLog(`backup ${backupDir}`);

    await writeUpdateStatus({ status: "applying", message: "Applying update files.", backup: backupDir });
    await applyPackage(packageRoot);

    await writeUpdateStatus({ status: "post-update", message: "Skipping font installation during update.", backup: backupDir });
    await appendUpdateLog("font install skipped during update");

    await writeUpdateStatus({ status: "restarting", message: "Restarting services.", backup: backupDir });
    await startRestartFinalizer(backupDir);
  } catch (error) {
    await appendUpdateLog(`agent update failed: ${error.stack || error.message || error}`);
    await writeUpdateStatus({
      status: "failed",
      message: error.message || String(error),
      backup: backupDir,
      finishedAt: nowIso()
    });
  } finally {
    updateInProgress = false;
  }
}

function assertPackageInput(body) {
  const packageUrl = String(body.packageUrl || "").trim();
  const packagePath = String(body.packagePath || "").trim();
  const packageSha256 = assertSha256(body.packageSha256);
  if (packageUrl.includes("\"") || packagePath.includes("\"")) {
    throw new Error("Update package path cannot contain double quotes.");
  }
  if (packageUrl) {
    const parsed = new URL(packageUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("Remote update packages must use HTTPS.");
    }
    if (String(process.env.ECOM_ALLOW_REMOTE_UPDATE || "") !== "1") {
      throw new Error("Remote URL updates are disabled. Upload a local ZIP, or explicitly set ECOM_ALLOW_REMOTE_UPDATE=1.");
    }
    return { mode: "url", value: packageUrl, sha256: packageSha256 };
  }
  if (packagePath) {
    if (!/\.zip$/i.test(packagePath)) throw new Error("Local update package must be a ZIP file.");
    return { mode: "path", value: packagePath, sha256: packageSha256 };
  }
  throw new Error("Update package URL or path is required.");
}

function psSingle(value) {
  return String(value || "").replace(/'/g, "''");
}

function isFreshUpdate(status) {
  const activeStatuses = ["starting", "running", "downloading", "extracting", "backing-up", "applying", "post-update", "restarting"];
  if (!activeStatuses.includes(String(status?.status || ""))) return false;
  const startedAt = Date.parse(status?.startedAt || status?.updatedAt || "");
  return Number.isFinite(startedAt) && Date.now() - startedAt < 20 * 60 * 1000;
}

function agentError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function assertManagedAppRoot() {
  const managedRoot = resolve(appRoot);
  const volumeRoot = parse(managedRoot).root;
  if (!managedRoot || managedRoot === volumeRoot || managedRoot.length < volumeRoot.length + 10) {
    throw agentError("Managed app root is unsafe. Full uninstall refused.", 409);
  }
  const [rootInfo, canonicalRoot] = await Promise.all([
    lstat(managedRoot).catch(() => null),
    realpath(managedRoot).catch(() => "")
  ]);
  if (!rootInfo?.isDirectory()
      || rootInfo.isSymbolicLink()
      || normalize(canonicalRoot).toLowerCase() !== normalize(managedRoot).toLowerCase()) {
    throw agentError("Managed app root cannot be a symbolic link or directory junction.", 409);
  }
  const requiredFiles = ["server.js", "admin-server.js", "maintenance-agent.js"];
  const requiredDirectories = ["public", "admin-public", "scripts"];
  if (!requiredFiles.every((name) => existsSync(join(managedRoot, name)))) {
    throw agentError("Managed app identity check failed. Full uninstall refused.", 409);
  }
  for (const name of requiredDirectories) {
    const info = await stat(join(managedRoot, name)).catch(() => null);
    if (!info?.isDirectory()) {
      throw agentError("Managed app directory check failed. Full uninstall refused.", 409);
    }
  }
  return managedRoot;
}

async function startFullUninstallRequest(body = {}) {
  if (uninstallRequestInProgress) {
    throw agentError("A full uninstall request is already being created.", 409);
  }
  uninstallRequestInProgress = true;
  try {
    if (!await isAdministrator()) {
      throw agentError("Maintenance agent must run as Windows administrator.", 409);
    }
    await assertManagedAppRoot();
    const update = await readUpdateStatus();
    if (updateInProgress || isFreshUpdate(update)) {
      throw agentError("An update is running. Full uninstall request refused.", 409);
    }
    const current = await readUninstallStatus();
    if (current.status === "awaiting-local-confirmation") {
      throw agentError("A full uninstall request is already waiting for local confirmation.", 409);
    }

    const requestId = randomBytes(16).toString("hex");
    const localCode = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
    const requestedAt = nowIso();
    const expiresAt = new Date(Date.now() + uninstallRequestTtlMs).toISOString();
    const requestedBy = String(body.requestedBy || "super_admin").trim().slice(0, 80);
    await writeFile(uninstallLocalChallengePath, JSON.stringify({
      requestId,
      code: localCode,
      requestedBy,
      requestedAt,
      expiresAt
    }, null, 2), "utf8");
    await writeUninstallStatus({
      status: "awaiting-local-confirmation",
      message: "Waiting for a local Windows administrator to confirm.",
      requestId,
      requestedBy,
      requestedAt,
      expiresAt,
      confirmedAt: "",
      codeHash: ""
    });
    await log(`Full uninstall request created requestId=${requestId} requestedBy=${requestedBy}`);
    return {
      ok: true,
      uninstall: await readUninstallStatus(),
      localConfirmation: "Run Confirm-Full-Uninstall-Admin.bat on this appliance as Windows administrator."
    };
  } finally {
    uninstallRequestInProgress = false;
  }
}

async function cancelFullUninstallRequest() {
  if (uninstallRequestInProgress) {
    throw agentError("The uninstall request is still being created. Try again.", 409);
  }
  const current = await readUninstallStatus();
  if (current.status !== "awaiting-local-confirmation") {
    return { ok: true, uninstall: current };
  }
  await rm(uninstallLocalChallengePath, { force: true }).catch(() => {});
  await writeUninstallStatus({
    status: "cancelled",
    message: "Full uninstall request cancelled.",
    codeHash: ""
  });
  await log(`Full uninstall request cancelled requestId=${current.requestId}`);
  return { ok: true, uninstall: await readUninstallStatus() };
}

async function createUpdateLauncher(input) {
  const script = join(appRoot, "scripts", "update-app.ps1");
  if (!existsSync(script)) throw new Error("Missing scripts\\update-app.ps1.");
  await mkdir(updatesDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const launcherPath = join(updatesDir, `maintenance-update-${Date.now()}.ps1`);
  const flag = input.mode === "url" ? "-PackageUrl" : "-PackagePath";
  const launcher = [
    "$ErrorActionPreference = 'Continue'",
    `$StatusPath = '${psSingle(updateStatusPath)}'`,
    `$LogPath = '${psSingle(launcherLogPath)}'`,
    `$UpdateScript = '${psSingle(script)}'`,
    `$Flag = '${flag}'`,
    `$Value = '${psSingle(input.value)}'`,
    "function Write-Status($Status, $Message) {",
    "  try {",
    "    $current = @{}",
    "    if (Test-Path -LiteralPath $StatusPath) { $current = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json -AsHashtable }",
    "    $current.status = $Status",
    "    $current.message = $Message",
    "    $current.updatedAt = (Get-Date -Format 'o')",
    "    if ($Status -eq 'failed' -or $Status -eq 'complete') { $current.finishedAt = (Get-Date -Format 'o') }",
    "    $current | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusPath -Encoding UTF8",
    "  } catch {}",
    "}",
    "try {",
    "  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] launcher started')",
    "  Write-Status 'running' 'Update script started.'",
    "  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $UpdateScript $Flag $Value *>> $LogPath",
    "  $code = $LASTEXITCODE",
    "  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] launcher exit code=' + $code)",
    "  if ($code -ne 0) { Write-Status 'failed' ('Update script exit code: ' + $code + '. Check runtime\\logs\\update-launcher.log.') }",
    "} catch {",
    "  try { Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] launcher error: ' + $_.Exception.Message) } catch {}",
    "  Write-Status 'failed' ('Update launcher failed: ' + $_.Exception.Message)",
    "}"
  ].join("\r\n");
  await writeFile(launcherPath, launcher, "utf8");
  return launcherPath;
}

async function startUpdate(body) {
  const input = assertPackageInput(body);
  const uninstall = await readUninstallStatus();
  if (["awaiting-local-confirmation", "starting"].includes(uninstall.status)) {
    throw agentError("A full uninstall request is active. Update refused.", 409);
  }
  const current = await readUpdateStatus();
  if (isFreshUpdate(current)) {
    const error = new Error("An update task is already running.");
    error.statusCode = 409;
    throw error;
  }
  await pruneOldEntries(updateWorkDir, { keep: maxUpdateWorkEntries, files: true, directories: true }).catch(() => {});
  await writeUpdateStatus({
    status: "starting",
    message: "Maintenance agent accepted update task.",
    packageUrl: input.mode === "url" ? input.value : "",
    packagePath: input.mode === "path" ? input.value : "",
    packageSha256: input.sha256,
    startedAt: nowIso(),
    finishedAt: ""
  });
  runUpdateTask(input).catch((error) => log(`runUpdateTask crash ${error.stack || error.message || error}`));
  await log(`Update task accepted ${input.mode}=${input.value}`);
  return { ok: true, update: await readUpdateStatus() };
}

async function installFonts() {
  const script = join(appRoot, "scripts", "install-fonts.ps1");
  if (!existsSync(script)) throw new Error("Missing scripts\\install-fonts.ps1.");
  const result = await runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-Force"
  ], 180000);
  await log(`Install fonts ok=${result.ok}`);
  if (!result.ok) throw new Error(result.stderr || result.stdout || "Font installation failed.");
  return result;
}

async function repairFontCache() {
  const script = join(appRoot, "scripts", "repair-font-cache.ps1");
  if (!existsSync(script)) throw new Error("Missing scripts\\repair-font-cache.ps1.");
  const result = await runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-SkipMaintenanceAgent"
  ], 180000);
  await log(`Repair font cache ok=${result.ok}`);
  if (!result.ok) throw new Error(result.stderr || result.stdout || "Font cache repair failed.");
  return result;
}

async function repairWindowsChineseFonts() {
  const script = join(appRoot, "scripts", "repair-windows-chinese-fonts.ps1");
  if (!existsSync(script)) throw new Error("Missing scripts\\repair-windows-chinese-fonts.ps1.");
  const result = await runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-SkipMaintenanceAgent"
  ], 180000);
  await log(`Repair Windows Chinese fonts ok=${result.ok}`);
  if (!result.ok) throw new Error(result.stderr || result.stdout || "Windows Chinese font repair failed.");
  return result;
}

async function findPythonPackageRoot(root, depth = 0) {
  if (existsSync(join(root, "python.exe"))) return root;
  if (depth >= 3) return "";
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findPythonPackageRoot(join(root, entry.name), depth + 1);
    if (found) return found;
  }
  return "";
}

async function installPythonRuntime(body = {}) {
  const url = String(body.url || body.pythonUrl || body.packageUrl || "").trim();
  const packagePathInput = String(body.packagePath || body.pythonPath || "").trim();
  let expectedSha256 = String(body.sha256 || body.packageSha256 || "").trim().toLowerCase();
  let packagePath = "";
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Python runtime URL must use HTTPS.");
    if (String(process.env.ECOM_ALLOW_REMOTE_RUNTIME_DOWNLOAD || "") !== "1") {
      throw new Error("Remote Python runtime download is disabled. Use a verified local package.");
    }
    expectedSha256 = assertSha256(expectedSha256);
    packagePath = join(updatesDir, `python-runtime-${timestamp()}-${toFileNameFromUrl(url)}`);
    const downloaded = await downloadUrlToFile(url, packagePath);
    await log(`Python runtime downloaded bytes=${downloaded.bytes} sha256=${downloaded.sha256}`);
    assertMatchingSha256(downloaded.sha256, expectedSha256);
  } else if (packagePathInput) {
    packagePath = packagePathInput;
    expectedSha256 = assertSha256(expectedSha256);
  } else {
    packagePath = join(appRoot, "scripts", "python-runtime.zip");
    const digestPath = `${packagePath}.sha256`;
    if (!existsSync(digestPath)) {
      throw new Error("Bundled Python runtime requires scripts\\python-runtime.zip.sha256.");
    }
    expectedSha256 = assertSha256((await readFile(digestPath, "utf8")).split(/\s+/)[0]);
  }
  if (!existsSync(packagePath)) throw new Error(`Python runtime package not found: ${packagePath}`);
  if (extname(packagePath).toLowerCase() !== ".zip") throw new Error("Python runtime package must be a ZIP file.");
  const actualSha256 = await sha256File(packagePath);
  assertMatchingSha256(actualSha256, expectedSha256);

  const extractRoot = join(updatesDir, `python-runtime-extract-${timestamp()}`);
  await expandZip(packagePath, extractRoot);
  const packageRoot = await findPythonPackageRoot(extractRoot);
  if (!packageRoot) throw new Error("Python runtime package is missing python.exe.");

  await rm(pythonRuntimeDir, { recursive: true, force: true });
  await mkdir(pythonRuntimeDir, { recursive: true });
  await cp(packageRoot, pythonRuntimeDir, { recursive: true, force: true });

  const check = await runCommand(pythonExecutablePath, [
    "-c",
    "import sys; from PIL import Image; print(sys.version.split()[0]); print('PIL', Image.__version__)"
  ], 60000);
  if (!check.ok) throw new Error(check.stderr || check.stdout || "Python runtime check failed. Pillow is required.");
  await log(`Python runtime installed: ${check.stdout.trim().replace(/\s+/g, " ")}`);
  const restart = await restartServices();
  return {
    ok: true,
    python: pythonExecutablePath,
    check: check.stdout.trim(),
    restart
  };
}

async function exportCurrentApp() {
  const exportsDir = join(runtimeDir, "exports");
  const id = `current-app-${timestamp()}`;
  const stageRoot = join(exportStageRoot, `stage-${id}`);
  const payloadRoot = join(stageRoot, "update-app");
  const zipPath = join(exportsDir, `${id}.zip`);
  const tempZipPath = join(exportsDir, `.${id}.tmp.zip`);
  await mkdir(exportsDir, { recursive: true });
  await rm(stageRoot, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await rm(tempZipPath, { force: true });
  await mkdir(payloadRoot, { recursive: true });

  try {
    const runtimeRoot = normalize(runtimeDir).toLowerCase();
    await cp(appRoot, payloadRoot, {
      recursive: true,
      force: true,
      filter: (source) => !normalize(source).toLowerCase().startsWith(runtimeRoot)
    });

    const nodeRoot = join(runtimeDir, "node");
    if (existsSync(nodeRoot)) {
      await mkdir(join(payloadRoot, "runtime"), { recursive: true });
      await cp(nodeRoot, join(payloadRoot, "runtime", "node"), { recursive: true, force: true });
    }
    for (const name of ["python", "python-packages", "rembg-models"]) {
      const source = join(runtimeDir, name);
      if (existsSync(source)) {
        await mkdir(join(payloadRoot, "runtime"), { recursive: true });
        await cp(source, join(payloadRoot, "runtime", name), { recursive: true, force: true });
      }
    }

    const stats = await fileCountAndBytes(payloadRoot);
    let result = await runCommand("tar.exe", ["-a", "-cf", tempZipPath, "-C", stageRoot, "update-app"], 300000);
    if (!result.ok || !existsSync(tempZipPath)) {
      await rm(tempZipPath, { force: true }).catch(() => {});
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `Compress-Archive -LiteralPath '${psSingle(payloadRoot)}' -DestinationPath '${psSingle(tempZipPath)}' -Force`,
        `if (!(Test-Path -LiteralPath '${psSingle(tempZipPath)}')) { throw 'Archive file was not created.' }`
      ].join("; ");
      result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], 300000);
    }
    if (!result.ok || !existsSync(tempZipPath)) {
      throw new Error(result.stderr || result.stdout || "Export current app failed: archive file was not created.");
    }

    const tempZipStat = await stat(tempZipPath);
    if (Number(tempZipStat.size || 0) < 22) {
      throw new Error("Export current app failed: archive file is empty.");
    }
    await rename(tempZipPath, zipPath);
    await rm(stageRoot, { recursive: true, force: true });
    await pruneOldEntries(exportsDir, {
      keep: maxExportArchives,
      files: true,
      directories: false,
      prefix: "current-app-"
    }).catch(() => {});
    await log(`Export current app ${basename(zipPath)} ${tempZipStat.size} bytes`);
    return {
      ok: true,
      fileName: basename(zipPath),
      path: zipPath,
      bytes: Number(tempZipStat.size || 0),
      signature: `${stats.files} files / ${stats.bytes} bytes`
    };
  } catch (error) {
    await rm(tempZipPath, { force: true }).catch(() => {});
    await log(`Export current app failed stage=${stageRoot}: ${error.message || error}`);
    throw error;
  }
}

function nodeExecutable() {
  const packaged = join(appRoot, "runtime", "node", "node.exe");
  return existsSync(packaged) ? packaged : "node.exe";
}

function taskCommand(scriptName) {
  if (scriptName.toLowerCase().endsWith(".bat")) {
    return `"${join(appRoot, scriptName)}"`;
  }
  return `"${nodeExecutable()}" "${join(appRoot, scriptName)}"`;
}

async function queryScheduledTask(name) {
  if (process.platform !== "win32") return { enabled: false, available: false, detail: "Windows only" };
  const result = await runCommand("schtasks.exe", ["/Query", "/TN", name, "/FO", "LIST"], 30000);
  return { enabled: result.ok, available: true, detail: result.ok ? "已启用" : "未启用" };
}

async function setScheduledTask(name, scriptName, enabled) {
  if (process.platform !== "win32") return { ok: false, detail: "Windows only" };
  if (!enabled) {
    const result = await runCommand("schtasks.exe", ["/Delete", "/TN", name, "/F"], 30000);
    return {
      ok: result.ok || /cannot find|not found|找不到|不存在/i.test(result.stderr + result.stdout),
      detail: result.stderr || result.stdout
    };
  }
  const result = await runCommand("schtasks.exe", [
    "/Create",
    "/SC",
    "ONLOGON",
    "/TN",
    name,
    "/TR",
    taskCommand(scriptName),
    "/RL",
    "HIGHEST",
    "/F"
  ], 30000);
  return { ok: result.ok, detail: result.stderr || result.stdout };
}

async function getAutostartStatus() {
  const [employee, admin, guardian] = await Promise.all([
    queryScheduledTask(employeeTaskName),
    queryScheduledTask(adminTaskName),
    queryScheduledTask(guardianTaskName)
  ]);
  return { employee, admin, guardian };
}

async function setAutostart(body = {}) {
  const target = String(body.target || "both");
  const enabled = Boolean(body.enabled);
  const results = {};
  if (target === "guardian" || target === "both") {
    results.guardian = await setScheduledTask(guardianTaskName, "Start-Unattended-Guardian.bat", enabled);
    if (!enabled) {
      results.employee = await setScheduledTask(employeeTaskName, "server.js", false);
      results.admin = await setScheduledTask(adminTaskName, "admin-server.js", false);
    }
  } else if (target === "employee") {
    results.employee = await setScheduledTask(employeeTaskName, "server.js", enabled);
  }
  if (target === "admin") {
    results.admin = await setScheduledTask(adminTaskName, "admin-server.js", enabled);
  }
  await log(`Autostart target=${target} enabled=${enabled} ok=${Object.values(results).every((item) => item.ok !== false)}`);
  return { results, autostart: await getAutostartStatus() };
}

async function restartServices() {
  const script = join(appRoot, "scripts", "start-intranet-appliance.ps1");
  if (!existsSync(script)) throw new Error("Missing scripts\\start-intranet-appliance.ps1.");
  await mkdir(updateWorkDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const launcherPath = join(updateWorkDir, `manual-restart-${Date.now()}.ps1`);
  const restartLogPath = join(logDir, "restart-services.log");
  const launcher = [
    "$ErrorActionPreference = 'Continue'",
    "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}",
    `$ApplianceScript = '${psSingle(script)}'`,
    `$RestartLogPath = '${psSingle(restartLogPath)}'`,
    "try {",
    "  Add-Content -LiteralPath $RestartLogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] restart launcher started')",
    "  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ApplianceScript -SkipMaintenanceAgent",
    "  Add-Content -LiteralPath $RestartLogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] restart launcher exit code=' + $LASTEXITCODE)",
    "} catch {",
    "  try { Add-Content -LiteralPath $RestartLogPath -Encoding UTF8 -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] restart launcher error: ' + $_.Exception.Message) } catch {}",
    "  exit 1",
    "}"
  ].join("\r\n");
  await writeFile(launcherPath, `\uFEFF${launcher}`, "utf8");
  await log("Restart services via Start-Process launcher.");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${psSingle(launcherPath)}') -WorkingDirectory '${psSingle(updateWorkDir)}' -WindowStyle Hidden`
  ].join("; ");
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], 10000);
  if (!result.ok) {
    await log(`Restart services failed: ${result.stderr || result.stdout}`);
    throw new Error(result.stderr || result.stdout || "Restart services failed.");
  }
  await log("Restart services launcher started.");
  return { ok: true, mode: "start-process-launcher" };
}

async function handle(req, res, token) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers["x-maintenance-token"] || "");
  if (!secureCompare(auth, token)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/maintenance/health") {
    sendJson(res, 200, {
      ok: true,
      role: "maintenance-agent",
      appRoot,
      pid: process.pid,
      isAdmin: await isAdministrator(),
      update: await readUpdateStatus(),
      uninstall: await readUninstallStatus()
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/maintenance/status") {
    sendJson(res, 200, {
      ok: true,
      appRoot,
      pid: process.pid,
      isAdmin: await isAdministrator(),
      update: await readUpdateStatus(),
      uninstall: await readUninstallStatus(),
      logs: {
        agent: await getTextTail(agentLogPath, 80),
        update: await getTextTail(updateLogPath, 80),
        launcher: await getTextTail(launcherLogPath, 80)
      }
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/update") {
    sendJson(res, 202, await startUpdate(await readJson(req)));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/maintenance/uninstall/status") {
    sendJson(res, 200, { ok: true, uninstall: await readUninstallStatus() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/uninstall/request") {
    sendJson(res, 202, await startFullUninstallRequest(await readJson(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/uninstall/cancel") {
    sendJson(res, 200, await cancelFullUninstallRequest());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/probe-download") {
    sendJson(res, 200, await probeDownload(await readJson(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/clear-update") {
    sendJson(res, 200, await clearUpdateStatus());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/install-fonts") {
    sendJson(res, 200, { ok: true, result: await installFonts() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/repair-font-cache") {
    sendJson(res, 200, { ok: true, result: await repairFontCache() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/repair-system-fonts") {
    sendJson(res, 200, { ok: true, result: await repairWindowsChineseFonts() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/install-python") {
    sendJson(res, 200, await installPythonRuntime(await readJson(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/autostart") {
    sendJson(res, 200, await setAutostart(await readJson(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/export-current-app") {
    sendJson(res, 200, await exportCurrentApp());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/maintenance/restart-services") {
    sendJson(res, 202, await restartServices());
    return;
  }
  sendJson(res, 404, { error: "Not found" });
}

const token = await ensureToken();
const server = http.createServer((req, res) => {
  handle(req, res, token).catch((error) => {
    log(`ERROR ${error.stack || error.message || error}`).catch(() => {});
    sendJson(res, error.statusCode || 500, { error: error.message || "Maintenance agent failed." });
  });
});

server.listen(port, host, async () => {
  await log(`Maintenance agent listening on http://${host}:${port}, admin=${await isAdministrator()}`);
  console.log(`Maintenance agent: http://${host}:${port}`);
});
