import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
const adminServer = await readFile(new URL("../admin-server.js", import.meta.url), "utf8");
const adminUi = await readFile(new URL("../admin-public/app.js", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("cloud sync is opt-in and reuses generic S3-compatible storage", () => {
  assert.match(server, /cloudSync:\s*\{\s*enabled: false/);
  assert.match(server, /function normalizeCloudSyncConfig\(value = \{\}\)/);
  assert.match(server, /function isCloudSyncReady\(config\)/);
  assert.match(server, /isObjectStorageReady\(config\)/);
  assert.match(adminServer, /cloudSync: normalizeCloudSyncConfig/);
  assert.match(adminUi, /id="cloudSyncEnabled"/);
  assert.match(adminUi, /id="cloudSyncIncludeProjects"/);
  assert.match(adminUi, /id="cloudSyncIncludeConversations"/);
});

test("local conversation and canvas writes happen before cloud backup is queued", () => {
  const conversationSave = server.match(
    /if \(req\.method === "POST" && parts\.length === 4 && parts\[3\] === "save"\) \{[\s\S]+?sendJson\(res, 200, saved\);/
  )?.[0] || "";
  assert.match(conversationSave, /writeFile\(aiConversationFilePath/);
  assert.match(conversationSave, /writeAiConversationIndex/);
  assert.match(conversationSave, /queueCloudSnapshot/);
  assert.ok(conversationSave.indexOf("writeAiConversationIndex") < conversationSave.indexOf("queueCloudSnapshot"));

  const canvasSave = server.match(
    /if \(req\.method === "POST" && parts\[2\] === "projects" && parts\[3\] === "save"\) \{[\s\S]+?sendJson\(res, 200, \{ project:/
  )?.[0] || "";
  assert.match(canvasSave, /writeFile\(join\(roots\.projects/);
  assert.match(canvasSave, /queueCloudSnapshot/);
  assert.ok(canvasSave.indexOf("writeFile(join(roots.projects") < canvasSave.indexOf("queueCloudSnapshot"));
});

test("cloud backup paths are user-scoped and documented as backup-only", () => {
  assert.match(server, /cloudBackupKey\(config, userId, kind, id, fileName = ""\)/);
  assert.match(server, /\[cloud\.pathPrefix, safeUserId, safeKind, safeId, safeFileName\]/);
  assert.match(readme, /## Optional cloud backup/);
  assert.match(readme, /local storage remains the source of truth/);
  assert.match(readme, /employee workspace continues to read from the local appliance/);
});
