import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const employeeServer = await readFile(new URL("../server.js", import.meta.url), "utf8");
const adminServer = await readFile(new URL("../admin-server.js", import.meta.url), "utf8");
const maintenanceAgent = await readFile(new URL("../maintenance-agent.js", import.meta.url), "utf8");

test("employee API is same-origin and does not advertise wildcard CORS", () => {
  assert.doesNotMatch(employeeServer, /access-control-allow-origin/);
  assert.doesNotMatch(employeeServer, /access-control-allow-headers/);
  assert.match(employeeServer, /function sendOptions\(res\)/);
});

test("all JSON readers enforce a body-size limit", () => {
  assert.match(employeeServer, /async function readJson\(req, maxBytes = maxJsonBodyBytes\)/);
  assert.match(employeeServer, /received > maxBytes/);
  assert.match(adminServer, /async function readJson\(req, maxBytes = maxAdminJsonBodyBytes\)/);
  assert.match(adminServer, /maxUpdateUploadJsonBytes/);
  assert.match(maintenanceAgent, /maxMaintenanceJsonBodyBytes = 1024 \* 1024/);
  assert.match(maintenanceAgent, /received > maxMaintenanceJsonBodyBytes/);
});

test("background removal accepts owned assets and data URLs but not remote HTTP sources", () => {
  const resolver = employeeServer.match(
    /async function resolveCanvasRemoveBackgroundSource[\s\S]+?\n}\n\nfunction normalizeRembgModel/
  )?.[0] || "";
  assert.match(resolver, /raw\.startsWith\("data:"\)/);
  assert.match(resolver, /pathname\.startsWith\("\/api\/canvas\/assets\/"\)/);
  assert.doesNotMatch(resolver, /fetch\(/);
  assert.match(resolver, /不读取远程地址/);
});

test("browser update upload is authenticated before its larger body allowance is used", () => {
  const handler = adminServer.match(
    /async function handleAdminUpdateUpload[\s\S]+?\n}\n\nasync function handleAdminMaintenance/
  )?.[0] || "";
  assert.match(handler, /requireAdminPermission\(req, res, "update\.write"\)/);
  assert.match(handler, /readJson\(req, maxUpdateUploadJsonBytes\)/);
});

test("maintenance downloads and ZIP extraction are bounded and checked", () => {
  assert.match(maintenanceAgent, /maxRemoteDownloadBytes = 600 \* 1024 \* 1024/);
  assert.match(maintenanceAgent, /maxProbeDownloadBytes = 64 \* 1024 \* 1024/);
  assert.match(maintenanceAgent, /Download exceeds the/);
  assert.match(maintenanceAgent, /async function assertSafeZipEntries/);
  assert.match(maintenanceAgent, /parts\.includes\("\.\."\)/);
  assert.match(maintenanceAgent, /async function assertExtractedTreeContained/);
  assert.match(maintenanceAgent, /contains a symbolic link/);
  assert.doesNotMatch(maintenanceAgent, /preview: data\.subarray/);
});
