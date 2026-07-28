import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const deletionRequestStatuses = new Set([
  "created",
  "pending-local-cleanup",
  "pending-account-removal",
  "pending-cloud-cleanup",
  "completed",
  "completed-no-cloud-sync-configured",
  "cancelled"
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

export function defaultPrivacyConfig() {
  return {
    operatorContact: "",
    retention: {
      enabled: true,
      automaticFailureDays: 30,
      feedbackDays: 180,
      conversationsDays: 365,
      canvasProjectsDays: 365,
      generatedImagesDays: 90,
      cleanupIntervalHours: 24,
      updatedAt: ""
    }
  };
}

export function normalizePrivacyConfig(value = {}) {
  const defaults = defaultPrivacyConfig();
  const retention = value?.retention && typeof value.retention === "object"
    ? value.retention
    : {};
  return {
    operatorContact: String(value?.operatorContact || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 240),
    retention: {
      enabled: retention.enabled !== false,
      automaticFailureDays: boundedInteger(
        retention.automaticFailureDays,
        defaults.retention.automaticFailureDays,
        1,
        3650
      ),
      feedbackDays: boundedInteger(
        retention.feedbackDays,
        defaults.retention.feedbackDays,
        1,
        3650
      ),
      conversationsDays: boundedInteger(
        retention.conversationsDays,
        defaults.retention.conversationsDays,
        1,
        3650
      ),
      canvasProjectsDays: boundedInteger(
        retention.canvasProjectsDays,
        defaults.retention.canvasProjectsDays,
        1,
        3650
      ),
      generatedImagesDays: boundedInteger(
        retention.generatedImagesDays,
        defaults.retention.generatedImagesDays,
        1,
        3650
      ),
      cleanupIntervalHours: boundedInteger(
        retention.cleanupIntervalHours,
        defaults.retention.cleanupIntervalHours,
        1,
        168
      ),
      updatedAt: String(retention.updatedAt || "").trim().slice(0, 80)
    }
  };
}

export function dataOlderThanDays(value, days, now = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return timestamp < now - boundedInteger(days, 1, 1, 3650) * 24 * 60 * 60 * 1000;
}

function safeDeletionRequestId(value) {
  const id = basename(String(value || "")).replace(/\.json$/i, "");
  return /^[a-z0-9-]{8,120}$/i.test(id) ? id : "";
}

function normalizeDeletionRequest(value = {}) {
  const requestId = safeDeletionRequestId(value.requestId);
  const userId = String(value.userId || "").trim().slice(0, 120);
  const status = deletionRequestStatuses.has(String(value.status || ""))
    ? String(value.status)
    : "created";
  return {
    version: Math.max(2, Number(value.version || 2)),
    requestId,
    userId,
    username: String(value.username || "").trim().slice(0, 120),
    status,
    remoteImages: (Array.isArray(value.remoteImages) ? value.remoteImages : [])
      .slice(0, 1000)
      .map((item) => ({
        owner: String(item?.owner || "").trim().slice(0, 160),
        repo: String(item?.repo || "").trim().slice(0, 160),
        branch: String(item?.branch || "").trim().slice(0, 160),
        path: String(item?.path || "").trim().replace(/^\/+/, "").slice(0, 900),
        sha: String(item?.sha || "").trim().slice(0, 160)
      }))
      .filter((item) => item.owner && item.repo && item.path),
    localCleanup: value.localCleanup && typeof value.localCleanup === "object"
      ? value.localCleanup
      : null,
    attempts: Math.max(0, Number(value.attempts || 0)),
    lastError: String(value.lastError || "").slice(0, 1000),
    requestedAt: String(value.requestedAt || new Date().toISOString()),
    localCleanupCompletedAt: String(value.localCleanupCompletedAt || ""),
    accountRemovedAt: String(value.accountRemovedAt || ""),
    completedAt: String(value.completedAt || ""),
    updatedAt: String(value.updatedAt || new Date().toISOString())
  };
}

function deletionRequestPath(queueDir, requestId) {
  const safeId = safeDeletionRequestId(requestId);
  if (!safeId) throw new Error("数据删除任务 ID 无效。");
  return join(queueDir, `${safeId}.json`);
}

export async function writePrivateJsonAtomic(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    await chmod(tempPath, 0o600).catch(() => {});
    await rename(tempPath, path);
    await chmod(path, 0o600).catch(() => {});
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function createDataDeletionRequest(queueDir, input = {}) {
  const requestedAt = new Date().toISOString();
  const request = normalizeDeletionRequest({
    ...input,
    version: 2,
    requestId: input.requestId || `${Date.now()}-${randomBytes(6).toString("hex")}`,
    status: "created",
    requestedAt,
    updatedAt: requestedAt
  });
  if (!request.requestId || !request.userId) throw new Error("无法创建无效的数据删除任务。");
  await writePrivateJsonAtomic(deletionRequestPath(queueDir, request.requestId), request);
  return request;
}

export async function readDataDeletionRequest(queueDir, requestId) {
  const raw = await readFile(deletionRequestPath(queueDir, requestId), "utf8");
  return normalizeDeletionRequest(JSON.parse(raw));
}

export async function updateDataDeletionRequest(queueDir, requestId, patch = {}) {
  const current = await readDataDeletionRequest(queueDir, requestId);
  const next = normalizeDeletionRequest({
    ...current,
    ...patch,
    requestId: current.requestId,
    userId: current.userId,
    updatedAt: new Date().toISOString()
  });
  await writePrivateJsonAtomic(deletionRequestPath(queueDir, requestId), next);
  return next;
}

export async function listDataDeletionRequests(queueDir) {
  let entries = [];
  try {
    entries = await readdir(queueDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const requests = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).slice(0, 500)) {
    try {
      requests.push(await readDataDeletionRequest(queueDir, entry.name));
    } catch {
    }
  }
  return requests.sort((left, right) => String(left.requestedAt).localeCompare(String(right.requestedAt)));
}

export async function findPendingDataDeletionRequest(queueDir, userId) {
  const id = String(userId || "").trim();
  const requests = await listDataDeletionRequests(queueDir);
  return requests.find((item) => (
    item.userId === id
    && !["completed", "completed-no-cloud-sync-configured", "cancelled"].includes(item.status)
  )) || null;
}
