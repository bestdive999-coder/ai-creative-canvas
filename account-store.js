import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createSecretStore } from "./secret-store.js";

const stores = new Map();

function nowIso() {
  return new Date().toISOString();
}

function backupStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, fallback) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return safeJsonParse(readFileSync(filePath, "utf8"), fallback);
}

function backupJsonFile(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  const target = join(
    dirname(filePath),
    `${basename(filePath)}.backup-${backupStamp()}`
  );
  copyFileSync(filePath, target);
  try { chmodSync(target, 0o600); } catch {}
  return target;
}

function tightenAccountPermissions(paths) {
  try { chmodSync(paths.accountsDir, 0o700); } catch {}
  for (const filePath of [paths.dbPath, `${paths.dbPath}-wal`, `${paths.dbPath}-shm`]) {
    if (!existsSync(filePath)) continue;
    try { chmodSync(filePath, 0o600); } catch {}
  }
}

function normalizeStorePaths(paths = {}) {
  const accountsDir = paths.accountsDir;
  if (!accountsDir) throw new Error("accountsDir is required for account SQLite store.");
  return {
    accountsDir,
    dbPath: paths.dbPath || join(accountsDir, "accounts.sqlite"),
    accountsPath: paths.accountsPath || join(accountsDir, "accounts.json"),
    accountSessionsPath: paths.accountSessionsPath || join(accountsDir, "sessions.json"),
    usageDailyPath: paths.usageDailyPath || join(accountsDir, "usage-daily.json"),
    secretKeyPath: paths.secretKeyPath || join(accountsDir, "secret-key.bin")
  };
}

function initSchema(db) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS sessions (
      token_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      remembered INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS usage_days (
      date_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function getMeta(db, key) {
  return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value || "";
}

function setMeta(db, key, value) {
  db.prepare(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value || ""));
}

function insertUser(db, user, secretStore) {
  if (!user?.id) return;
  const storedUser = secretStore.encryptUser(user);
  db.prepare(`
    INSERT INTO users (id, username, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(
    String(storedUser.id),
    String(storedUser.username || ""),
    JSON.stringify(storedUser),
    String(storedUser.updatedAt || storedUser.createdAt || nowIso())
  );
}

function insertSession(db, session) {
  const tokenKey = String(session?.tokenKey || "");
  const userId = String(session?.userId || "");
  const expiresAt = Number(session?.expiresAt || 0);
  if (!tokenKey || !userId || expiresAt <= Date.now()) return;
  db.prepare(`
    INSERT INTO sessions (token_key, user_id, created_at, expires_at, remembered)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token_key) DO UPDATE SET
      user_id = excluded.user_id,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      remembered = excluded.remembered
  `).run(
    tokenKey,
    userId,
    Number(session.createdAt || Date.now()),
    expiresAt,
    session.remembered ? 1 : 0
  );
}

function insertUsageDay(db, dateKey, day) {
  if (!dateKey) return;
  db.prepare(`
    INSERT INTO usage_days (date_key, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(date_key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(String(dateKey), JSON.stringify(day || {}), nowIso());
}

function migrateLegacyJsonIfNeeded(db, paths, secretStore) {
  db.exec("BEGIN IMMEDIATE");
  const backups = [];
  try {
    if (getMeta(db, "legacy_json_migrated") === "1") {
      db.exec("COMMIT");
      return;
    }

    const accounts = readJsonFile(paths.accountsPath, { version: 1, users: [] });
    const users = Array.isArray(accounts?.users) ? accounts.users : [];
    users.forEach((user) => insertUser(db, user, secretStore));

    const sessionsDb = readJsonFile(paths.accountSessionsPath, { version: 1, sessions: [] });
    const sessions = Array.isArray(sessionsDb?.sessions) ? sessionsDb.sessions : [];
    sessions.forEach((session) => insertSession(db, session));

    const usageDaily = readJsonFile(paths.usageDailyPath, { version: 1, days: {} });
    const days = usageDaily && typeof usageDaily.days === "object" && usageDaily.days ? usageDaily.days : {};
    Object.entries(days).forEach(([dateKey, day]) => insertUsageDay(db, dateKey, day));

    setMeta(db, "schema_version", "1");
    setMeta(db, "legacy_json_migrated", "1");
    setMeta(db, "legacy_json_migrated_at", nowIso());

    for (const filePath of [paths.accountsPath, paths.accountSessionsPath, paths.usageDailyPath]) {
      const backup = backupJsonFile(filePath);
      if (backup) backups.push(backup);
    }
    if (backups.length) setMeta(db, "legacy_json_backups", JSON.stringify(backups));

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

function getStore(paths = {}) {
  const safePaths = normalizeStorePaths(paths);
  const cacheKey = safePaths.dbPath;
  if (stores.has(cacheKey)) return stores.get(cacheKey);
  mkdirSync(safePaths.accountsDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(safePaths.dbPath);
  const secretStore = createSecretStore(safePaths.secretKeyPath);
  initSchema(db);
  migrateLegacyJsonIfNeeded(db, safePaths, secretStore);
  tightenAccountPermissions(safePaths);
  const store = { db, paths: safePaths, secretStore };
  stores.set(cacheKey, store);
  return store;
}

export async function loadAccountDb(paths = {}) {
  const { db, secretStore } = getStore(paths);
  const rows = db.prepare("SELECT id, data FROM users ORDER BY username COLLATE NOCASE, id").all();
  const plaintextRows = rows.filter((row) => {
    const user = safeJsonParse(row.data, null);
    const keys = user?.aiKeys && typeof user.aiKeys === "object" ? user.aiKeys : {};
    return Object.values(keys).some((value) => value && !secretStore.isEncrypted(value));
  });
  if (plaintextRows.length) {
    const update = db.prepare("UPDATE users SET data = ? WHERE id = ?");
    db.exec("BEGIN IMMEDIATE");
    try {
      plaintextRows.forEach((row) => {
        const user = safeJsonParse(row.data, null);
        if (user) update.run(JSON.stringify(secretStore.encryptUser(user)), String(row.id));
      });
      setMeta(db, "user_secrets_encrypted_at", nowIso());
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }
  const users = rows
    .map((row) => safeJsonParse(row.data, null))
    .map((user) => user ? secretStore.decryptUser(user) : null)
    .filter((user) => user && user.id);
  return { version: 1, users };
}

export async function saveAccountDb(paths = {}, accountDb = {}) {
  const { db, secretStore } = getStore(paths);
  const users = Array.isArray(accountDb?.users) ? accountDb.users : [];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM users");
    users.forEach((user) => insertUser(db, user, secretStore));
    setMeta(db, "accounts_updated_at", nowIso());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export async function deleteUserRecords(paths = {}, userId) {
  const id = String(userId || "").trim();
  if (!id) return;
  const { db } = getStore(paths);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    const rows = db.prepare("SELECT date_key, data FROM usage_days").all();
    const updateDay = db.prepare("UPDATE usage_days SET data = ?, updated_at = ? WHERE date_key = ?");
    rows.forEach((row) => {
      const day = safeJsonParse(row.data, {});
      if (day?.users && typeof day.users === "object") delete day.users[id];
      if (day?.tokenUsage?.users && typeof day.tokenUsage.users === "object") delete day.tokenUsage.users[id];
      updateDay.run(JSON.stringify(day), nowIso(), String(row.date_key));
    });
    setMeta(db, "user_records_deleted_at", nowIso());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export async function loadAccountSessions(paths = {}, targetMap) {
  const { db } = getStore(paths);
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  const rows = db.prepare("SELECT token_key, user_id, created_at, expires_at, remembered FROM sessions").all();
  if (targetMap?.clear) targetMap.clear();
  rows.forEach((row) => {
    targetMap?.set?.(String(row.token_key), {
      userId: String(row.user_id),
      createdAt: Number(row.created_at || now),
      expiresAt: Number(row.expires_at || now),
      remembered: Boolean(row.remembered)
    });
  });
}

export async function saveAccountSessions(paths = {}, sourceMap) {
  const { db } = getStore(paths);
  const now = Date.now();
  const sessions = [];
  for (const [tokenKey, session] of sourceMap?.entries?.() || []) {
    if (!session || Number(session.expiresAt || 0) <= now) {
      sourceMap.delete(tokenKey);
      continue;
    }
    sessions.push({
      tokenKey,
      userId: session.userId,
      createdAt: Number(session.createdAt || now),
      expiresAt: Number(session.expiresAt || now),
      remembered: Boolean(session.remembered)
    });
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM sessions");
    sessions.forEach((session) => insertSession(db, session));
    setMeta(db, "sessions_updated_at", nowIso());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export async function loadUsageDailyDb(paths = {}) {
  const { db } = getStore(paths);
  const rows = db.prepare("SELECT date_key, data FROM usage_days ORDER BY date_key").all();
  const days = {};
  rows.forEach((row) => {
    days[String(row.date_key)] = safeJsonParse(row.data, {});
  });
  return { version: 1, days };
}

export async function saveUsageDailyDb(paths = {}, usageDailyDb = {}) {
  const { db } = getStore(paths);
  const days = usageDailyDb && typeof usageDailyDb.days === "object" && usageDailyDb.days ? usageDailyDb.days : {};
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM usage_days");
    Object.entries(days).forEach(([dateKey, day]) => insertUsageDay(db, dateKey, day));
    setMeta(db, "usage_daily_updated_at", nowIso());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export async function backupAccountDatabase(paths = {}, targetPath) {
  if (!targetPath) throw new Error("targetPath is required for account SQLite backup.");
  const { db } = getStore(paths);
  await backup(db, targetPath);
  return targetPath;
}
