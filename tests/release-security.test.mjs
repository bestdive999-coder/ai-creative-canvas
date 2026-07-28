import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deleteUserRecords,
  loadAccountDb,
  loadAccountSessions,
  loadUsageDailyDb,
  saveAccountDb,
  saveAccountSessions,
  saveUsageDailyDb
} from "../account-store.js";
import {
  createDataDeletionRequest,
  defaultPrivacyConfig,
  findPendingDataDeletionRequest,
  normalizePrivacyConfig,
  readDataDeletionRequest,
  updateDataDeletionRequest
} from "../data-governance.js";
import { createSecretStore } from "../secret-store.js";

const employeeServer = await readFile(new URL("../server.js", import.meta.url), "utf8");
const adminServer = await readFile(new URL("../admin-server.js", import.meta.url), "utf8");
const maintenanceAgent = await readFile(new URL("../maintenance-agent.js", import.meta.url), "utf8");
const adminUi = await readFile(new URL("../admin-public/app.js", import.meta.url), "utf8");
const employeeUi = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const employeeAuth = await readFile(new URL("../public/src/auth.js", import.meta.url), "utf8");

test("runtime secrets use authenticated encryption and a private local key", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-secret-store-"));
  try {
    const keyPath = join(root, "secret-key.bin");
    const store = createSecretStore(keyPath);
    const encrypted = store.encryptConfig({
      ai: {
        primaryImageApiKey: "test-primary-secret",
        remoteImageBed: { token: "test-storage-token" },
        objectStorage: { secretAccessKey: "test-object-secret" }
      }
    });
    const serialized = JSON.stringify(encrypted);
    assert.doesNotMatch(serialized, /test-primary-secret|test-storage-token|test-object-secret/);
    assert.match(serialized, /enc:v1:/);
    const decrypted = store.decryptConfig(encrypted);
    assert.equal(decrypted.ai.primaryImageApiKey, "test-primary-secret");
    assert.equal(decrypted.ai.remoteImageBed.token, "test-storage-token");
    assert.equal(decrypted.ai.objectStorage.secretAccessKey, "test-object-secret");
    if (process.platform !== "win32") {
      assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("account database encrypts user keys and restricts local file permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-account-store-"));
  const paths = {
    accountsDir: join(root, "accounts"),
    dbPath: join(root, "accounts", "accounts.sqlite"),
    secretKeyPath: join(root, "intranet", "secret-key.bin")
  };
  try {
    await saveAccountDb(paths, {
      users: [{
        id: "release-test-user",
        username: "release-test",
        aiKeys: { primaryImageApiKey: "user-secret-value" }
      }]
    });
    const disk = await readFile(paths.dbPath);
    assert.equal(disk.includes(Buffer.from("user-secret-value")), false);
    const loaded = await loadAccountDb(paths);
    assert.equal(loaded.users[0].aiKeys.primaryImageApiKey, "user-secret-value");
    await saveAccountSessions(paths, new Map([[
      "test-session-key",
      {
        userId: "release-test-user",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        remembered: false
      }
    ]]));
    await saveUsageDailyDb(paths, {
      days: {
        "2026-07-28": {
          users: { "release-test-user": { aiImages: 1 } },
          tokenUsage: { users: { "release-test-user": { input: 10 } } }
        }
      }
    });
    await deleteUserRecords(paths, "release-test-user");
    const sessionsAfterDeletion = new Map();
    await loadAccountSessions(paths, sessionsAfterDeletion);
    assert.equal(sessionsAfterDeletion.size, 0);
    const usageAfterDeletion = await loadUsageDailyDb(paths);
    assert.equal(usageAfterDeletion.days["2026-07-28"].users["release-test-user"], undefined);
    assert.equal(usageAfterDeletion.days["2026-07-28"].tokenUsage.users["release-test-user"], undefined);
    if (process.platform !== "win32") {
      assert.equal((await stat(paths.accountsDir)).mode & 0o777, 0o700);
      assert.equal((await stat(paths.dbPath)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("services bind to loopback by default and first admin setup is local-only", () => {
  assert.match(employeeServer, /ECOM_EMPLOYEE_HOST \|\| "127\.0\.0\.1"/);
  assert.match(adminServer, /ECOM_ADMIN_HOST \|\| "127\.0\.0\.1"/);
  assert.match(employeeServer, /server\.listen\(port, host/);
  assert.match(adminServer, /server\.listen\(adminPort, adminHost/);
  const setup = adminServer.match(/async function handleAdminSetup[\s\S]+?\n}\n\nasync function handleAdminLogin/)?.[0] || "";
  assert.match(setup, /loopbackRequest\(req\)/);
});

test("update packages require a trusted digest and remote downloads are opt-in HTTPS", () => {
  assert.match(adminUi, /id="runUpdatePackageSha256"/);
  assert.match(adminServer, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(adminServer, /ECOM_ALLOW_REMOTE_UPDATE/);
  assert.match(maintenanceAgent, /assertMatchingSha256/);
  assert.match(maintenanceAgent, /Remote update packages must use HTTPS/);
  assert.match(maintenanceAgent, /ECOM_ALLOW_REMOTE_UPDATE/);
});

test("account deletion removes local user data and queues remote cleanup", () => {
  assert.match(adminServer, /async function removeUserOwnedLocalData/);
  assert.match(adminServer, /accountStore\.deleteUserRecords/);
  assert.match(adminServer, /pending-cloud-cleanup/);
  assert.match(employeeServer, /async function processDataDeletionQueue/);
  assert.match(employeeServer, /deleteObjectStoragePrefix/);
  assert.match(employeeServer, /deleteRemoteImageBedUpload/);
});

test("account deletion persists a retryable job before disabling or removing the account", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-deletion-queue-"));
  try {
    const request = await createDataDeletionRequest(root, {
      userId: "employee-1",
      username: "employee"
    });
    assert.equal(request.status, "created");
    const onDisk = await readDataDeletionRequest(root, request.requestId);
    assert.equal(onDisk.userId, "employee-1");
    const pending = await updateDataDeletionRequest(root, request.requestId, {
      status: "pending-local-cleanup"
    });
    assert.equal(pending.status, "pending-local-cleanup");
    assert.equal((await findPendingDataDeletionRequest(root, "employee-1"))?.requestId, request.requestId);
    if (process.platform !== "win32") {
      assert.equal((await stat(join(root, `${request.requestId}.json`))).mode & 0o777, 0o600);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const handler = adminServer.match(
    /async function handleDeleteUser[\s\S]+?\n}\n\nasync function handleAdminConfig/
  )?.[0] || "";
  const createIndex = handler.indexOf("createDataDeletionRequest");
  const pendingIndex = handler.indexOf('target.status = "deletion_pending"');
  const cleanupIndex = handler.indexOf("runLocalDataDeletionRequest", pendingIndex);
  assert.ok(createIndex >= 0 && pendingIndex > createIndex && cleanupIndex > pendingIndex);
  assert.match(adminServer, /processLocalDataDeletionQueue/);
});

test("privacy retention is bounded, enabled by default, and disclosed to employees", () => {
  const defaults = defaultPrivacyConfig();
  assert.equal(defaults.retention.enabled, true);
  assert.equal(defaults.retention.automaticFailureDays, 30);
  const normalized = normalizePrivacyConfig({
    operatorContact: " support@example.test ",
    retention: {
      automaticFailureDays: 0,
      feedbackDays: 99999,
      cleanupIntervalHours: 0
    }
  });
  assert.equal(normalized.operatorContact, "support@example.test");
  assert.equal(normalized.retention.automaticFailureDays, 1);
  assert.equal(normalized.retention.feedbackDays, 3650);
  assert.equal(normalized.retention.cleanupIntervalHours, 1);
  assert.match(employeeServer, /async function runDataRetentionCleanup/);
  assert.match(employeeServer, /cleanupFeedbackByRetention/);
  assert.match(employeeServer, /cleanupConversationsByRetention/);
  assert.match(employeeServer, /cleanupCanvasByRetention/);
  assert.match(employeeServer, /cleanupGalleryByRetention/);
  assert.match(employeeServer, /logType: "automatic-failure"/);
  assert.match(employeeUi, /id="privacyNoticeDialog"/);
  assert.match(employeeUi, /data-i18n="privacyFailureLog"/);
  assert.match(employeeAuth, /showPrivacyNoticeIfNeeded/);
  assert.match(employeeAuth, /privacyRetentionSummary/);
});
