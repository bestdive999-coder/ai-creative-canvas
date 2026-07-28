import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminServer = fs.readFileSync(new URL("../admin-server.js", import.meta.url), "utf8");
const agent = fs.readFileSync(new URL("../maintenance-agent.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../admin-public/index.html", import.meta.url), "utf8");
const adminApp = fs.readFileSync(new URL("../admin-public/app.js", import.meta.url), "utf8");
const adminCss = fs.readFileSync(new URL("../admin-public/styles.css", import.meta.url), "utf8");
const localConfirm = fs.readFileSync(new URL("../scripts/confirm-full-uninstall.ps1", import.meta.url), "utf8");

test("only the super administrator can start a full uninstall request", () => {
  assert.match(adminServer, /"uninstall\.write"/);
  assert.match(adminServer, /requireAdminPermission\(req, res, "uninstall\.write"\)/);
  assert.match(adminServer, /isSuperAdminUser\(admin\.user\)/);
  assert.match(adminServer, /verifyUserPassword\(password, admin\.user\)/);
  assert.match(adminServer, /phrase !== "彻底卸载电商 AI 画布"/);
});

test("full uninstall refuses to start while AI or local work exists", () => {
  assert.match(adminServer, /\/api\/health/);
  assert.match(adminServer, /activeAi \|\| queuedAi \|\| activeLocal \|\| queuedLocal/);
  assert.match(adminServer, /health\.localPython\?\.queue\?\.running/);
  assert.match(adminServer, /无法确认员工端任务状态，已拒绝发起卸载/);
});

test("remote services can request or cancel but cannot confirm deletion", () => {
  assert.match(adminServer, /\/api\/maintenance\/uninstall\/request/);
  assert.match(adminServer, /\/api\/maintenance\/uninstall\/cancel/);
  assert.doesNotMatch(adminServer, /\/api\/maintenance\/uninstall\/confirm/);
  assert.doesNotMatch(agent, /\/api\/maintenance\/uninstall\/confirm/);
  assert.doesNotMatch(localConfirm, /Invoke-RestMethod/);
});

test("maintenance agent keeps the confirmation code local and expires it", () => {
  assert.match(agent, /uninstall-local-confirmation\.json/);
  assert.match(agent, /uninstallRequestTtlMs = 15 \* 60 \* 1000/);
  assert.match(agent, /code: _code,/);
  assert.match(agent, /codeHash: _codeHash,/);
  assert.match(agent, /status: "expired"/);
});

test("full uninstall deletion scope is fixed to verified EcommerceCanvas-owned paths", () => {
  assert.match(agent, /async function assertManagedAppRoot/);
  assert.match(agent, /\["server\.js", "admin-server\.js", "maintenance-agent\.js"\]/);
  assert.match(agent, /\["public", "admin-public", "scripts"\]/);
  assert.match(agent, /rootInfo\.isSymbolicLink\(\)/);
  assert.match(agent, /realpath\(managedRoot\)/);
  assert.match(localConfirm, /\$AppRoot = Split-Path -Parent \$PSScriptRoot/);
  assert.match(localConfirm, /\$UpdateBackupRoot = Join-Path \$AppParent "app-update-backups"/);
  assert.match(localConfirm, /\$ExportStageRoot = Join-Path \$AppParent "app-export-stages"/);
  assert.match(localConfirm, /\$UpdateWorkDir = Join-Path \(\[IO\.Path\]::GetTempPath\(\)\) "ecommerce-ai-worker-updates"/);
  assert.match(localConfirm, /\$PackagedRuntimeRoot = Join-Path \(\[IO\.Path\]::GetTempPath\(\)\) "ecommerce-canvas-app-runtime"/);
  assert.doesNotMatch(agent, /body\.(path|appRoot|deletePath|targetPath)/);
  assert.doesNotMatch(localConfirm, /\$Ports = @\(5173, 5188, 5199, 5266\)/);
  assert.doesNotMatch(localConfirm, /Get-NetTCPConnection -LocalPort \$Port/);
  assert.match(localConfirm, /CommandLine\.IndexOf\(\$ResolvedAppRoot/);
  assert.match(localConfirm, /Attributes ReparsePoint/);
});

test("local Windows administrator must retype the one-time code and phrase", () => {
  assert.match(localConfirm, /WindowsBuiltInRole\]::Administrator/);
  assert.match(localConfirm, /一次性确认码/);
  assert.match(localConfirm, /Read-Host "请重新输入上方 6 位确认码"/);
  assert.match(localConfirm, /Read-Host "请输入：彻底卸载电商 AI 画布"/);
  assert.match(localConfirm, /Start-Process -FilePath "powershell\.exe"/);
  assert.match(localConfirm, /ecommerce-canvas-full-uninstall-\$RequestId/);
});

test("admin UI clearly separates remote request from local confirmation", () => {
  assert.match(adminHtml, /open-source-preview-22/);
  assert.match(adminApp, /发起彻底卸载/);
  assert.match(adminApp, /Confirm-Full-Uninstall-Admin\.bat/);
  assert.match(adminApp, /data-uninstall-password/);
  assert.match(adminApp, /data-uninstall-phrase/);
  assert.match(adminCss, /\.full-uninstall-panel/);
  assert.match(adminCss, /\.primary\.destructive/);
});
