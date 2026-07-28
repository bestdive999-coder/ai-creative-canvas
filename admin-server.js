import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { hostname, networkInterfaces, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as accountStore from "./account-store.js";
import {
  createDataDeletionRequest,
  defaultPrivacyConfig,
  findPendingDataDeletionRequest,
  listDataDeletionRequests,
  normalizePrivacyConfig,
  readDataDeletionRequest,
  updateDataDeletionRequest
} from "./data-governance.js";
import { createSecretStore } from "./secret-store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = process.env.ECOMMERCE_CANVAS_APP_ROOT || __dirname;
const adminPublicDir = join(appRoot, "admin-public");
const runtimeDir = join(appRoot, "runtime");
const updatesDir = join(runtimeDir, "updates");
const autoBackupRoot = join(runtimeDir, "backups", "auto");
const autoBackupStatePath = join(autoBackupRoot, "backup-state.json");
const updateUploadDir = join(tmpdir(), "ecommerce-ai-worker-updates");
const aiGalleryDir = join(runtimeDir, "ai-gallery");
const aiGalleryDownloadsDir = join(runtimeDir, "ai-gallery-downloads");
const aiGalleryIndexPath = join(aiGalleryDir, "index.json");
const aiFeedbackDir = join(runtimeDir, "ai-feedback");
const aiFeedbackPath = join(aiFeedbackDir, "feedback.json");
const aiFeedbackAssetsDir = join(aiFeedbackDir, "assets");
const aiConversationsDir = join(runtimeDir, "ai-conversations");
const canvasBetaDir = join(runtimeDir, "canvas-beta");
const canvasProjectsDir = join(canvasBetaDir, "projects");
const canvasAssetsDir = join(canvasBetaDir, "assets");
const canvasRembgDir = join(canvasBetaDir, "rembg");
const dataDeletionQueueDir = join(runtimeDir, "data-deletion");
const accountsDir = join(runtimeDir, "accounts");
const accountsPath = join(accountsDir, "accounts.json");
const accountSessionsPath = join(accountsDir, "sessions.json");
const usageDailyPath = join(accountsDir, "usage-daily.json");
const intranetDir = join(appRoot, "runtime", "intranet");
const intranetConfigPath = join(intranetDir, "config.json");
const secretKeyPath = join(intranetDir, "secret-key.bin");
const configSecretStore = createSecretStore(secretKeyPath);
const updateStatusPath = join(intranetDir, "update-status.json");
const maintenanceTokenPath = join(intranetDir, "maintenance-token.txt");
const updateLogPath = join(runtimeDir, "logs", "update.log");
const adminPort = Number(process.env.ADMIN_PORT || 5188);
const employeePort = Number(process.env.PORT || 5173);
const adminHost = String(process.env.ECOM_ADMIN_HOST || "127.0.0.1").trim() || "127.0.0.1";
const maintenanceAgentUrl = String(process.env.ECOM_MAINTENANCE_URL || "http://127.0.0.1:5199").replace(/\/+$/, "");
const adminCookieName = "eps_admin_session";
const sessionTtlMs = 8 * 60 * 60 * 1000;
const autoBackupRetentionCount = Math.max(3, Math.min(60, Number(process.env.AUTO_BACKUP_RETENTION_COUNT || 14)));
const autoBackupIntervalMs = Math.max(60 * 60 * 1000, Number(process.env.AUTO_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const adminSessions = new Map();
const passwordHashPrefix = "scrypt:v1:";
const loginAttemptWindowMs = Math.max(60_000, Number(process.env.ADMIN_LOGIN_ATTEMPT_WINDOW_MS || process.env.LOGIN_ATTEMPT_WINDOW_MS || 10 * 60 * 1000));
const loginAttemptBlockMs = Math.max(60_000, Number(process.env.ADMIN_LOGIN_ATTEMPT_BLOCK_MS || process.env.LOGIN_ATTEMPT_BLOCK_MS || 10 * 60 * 1000));
const loginAttemptMaxFailures = Math.max(3, Number(process.env.ADMIN_LOGIN_ATTEMPT_MAX_FAILURES || process.env.LOGIN_ATTEMPT_MAX_FAILURES || 8));
const loginAttemptBuckets = new Map();
const employeeTaskName = "EcommerceAI-Main";
const adminTaskName = "EcommerceAI-Admin";
const guardianTaskName = "EcommerceAI-Guardian";
const legacyDefaultAdminPassword = "";
const maxAdminJsonBodyBytes = 2 * 1024 * 1024;
const maxUpdateUploadMb = boundedEnvInteger("MAX_UPDATE_UPLOAD_MB", 256, 1, 600);
const maxUpdateUploadBytes = maxUpdateUploadMb * 1024 * 1024;
const maxUpdateUploadJsonBytes = Math.ceil(maxUpdateUploadBytes * 4 / 3) + 2 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};
const securityHeaders = {
  "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};
const configuredKeyPlaceholder = "__configured__";

function boundedEnvInteger(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function accountStorePaths() {
  return {
    accountsDir,
    accountsPath,
    accountSessionsPath,
    usageDailyPath,
    secretKeyPath
  };
}
const defaultImageServiceEditModel = String(process.env.PRIMARY_IMAGE_EDIT_MODEL || "").trim();
const defaultImageServiceTextModel = defaultImageServiceEditModel;
const defaultImageServiceStandardPlannerModel = String(process.env.PRIMARY_REASONING_MODEL || "").trim();
const defaultImageServicePlannerModel = String(process.env.PRIMARY_DEEP_REASONING_MODEL || "").trim();
const defaultSecondaryApiBaseUrl = String(process.env.SECONDARY_IMAGE_API_BASE_URL || "").trim();
const remoteImageStorageApiBase = String(process.env.REMOTE_IMAGE_STORAGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const remoteImageStorageRawBase = String(process.env.REMOTE_IMAGE_STORAGE_RAW_BASE_URL || "").trim().replace(/\/+$/, "");
const defaultSecondaryApiImageModel = String(process.env.SECONDARY_IMAGE_MODEL || "").trim();
const usageStatKeys = ["aiImages", "copywriting"];
const usageModuleMeta = [
  { key: "aiImages", label: "AI 生图", unit: "张" },
  { key: "copywriting", label: "AI 文案", unit: "次" }
];

function defaultTokenPricingConfig() {
  return {
    usdToCnyRate: 0,
    saleMultiplier: 1,
    models: []
  };
}

function defaultImagePricingConfig() {
  return {
    balanceCny: 0,
    saleMultiplier: 1,
    native: {
      "1K": { usdPerImage: 0 },
      "2K": { usdPerImage: 0 },
      "4K": { usdPerImage: 0 }
    }
  };
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTokenPriceRow(row = {}) {
  const model = String(row.model || "").trim();
  if (!model) return null;
  const currency = String(row.currency || (row.inputCnyPer1M !== undefined || row.outputCnyPer1M !== undefined ? "CNY" : "USD")).trim().toUpperCase() === "CNY" ? "CNY" : "USD";
  return {
    provider: String(row.provider || "").trim().toLowerCase(),
    model,
    currency,
    inputUsdPer1M: Math.max(0, finiteNumber(row.inputUsdPer1M, 0)),
    cachedInputUsdPer1M: Math.max(0, finiteNumber(row.cachedInputUsdPer1M, 0)),
    outputUsdPer1M: Math.max(0, finiteNumber(row.outputUsdPer1M, 0)),
    inputCnyPer1M: Math.max(0, finiteNumber(row.inputCnyPer1M, 0)),
    cachedInputCnyPer1M: Math.max(0, finiteNumber(row.cachedInputCnyPer1M, row.inputCnyPer1M ?? 0)),
    outputCnyPer1M: Math.max(0, finiteNumber(row.outputCnyPer1M, 0))
  };
}

function normalizeTokenPricingConfig(value = {}) {
  const defaults = defaultTokenPricingConfig();
  const configuredRows = Array.isArray(value?.models) ? value.models : [];
  const rows = configuredRows.length ? [...defaults.models, ...configuredRows] : defaults.models;
  const modelMap = new Map();
  for (const row of rows.map(normalizeTokenPriceRow).filter(Boolean)) {
    modelMap.set(`${row.provider}:${String(row.model || "").toLowerCase()}`, row);
  }
  const models = [...modelMap.values()];
  return {
    usdToCnyRate: Math.max(0, finiteNumber(value?.usdToCnyRate, defaults.usdToCnyRate)),
    saleMultiplier: Math.max(0, finiteNumber(value?.saleMultiplier, defaults.saleMultiplier)),
    models: models.length ? models : defaults.models.map(normalizeTokenPriceRow).filter(Boolean)
  };
}

function normalizeImagePricingConfig(value = {}) {
  const defaults = defaultImagePricingConfig();
  const native = value?.native && typeof value.native === "object" ? value.native : {};
  return {
    balanceCny: Math.max(0, finiteNumber(value?.balanceCny, defaults.balanceCny)),
    saleMultiplier: Math.max(0, finiteNumber(value?.saleMultiplier, defaults.saleMultiplier)),
    native: {
      "1K": { usdPerImage: Math.max(0, finiteNumber(native["1K"]?.usdPerImage, defaults.native["1K"].usdPerImage)) },
      "2K": { usdPerImage: Math.max(0, finiteNumber(native["2K"]?.usdPerImage, defaults.native["2K"].usdPerImage)) },
      "4K": { usdPerImage: Math.max(0, finiteNumber(native["4K"]?.usdPerImage, defaults.native["4K"].usdPerImage)) }
    }
  };
}

function normalizeAiCostPricingConfig(value = {}) {
  const source = value?.tokenPricing || value?.models || value?.usdToCnyRate ? value : value?.ai || {};
  return {
    tokenPricing: normalizeTokenPricingConfig(source.tokenPricing || source || {}),
    imagePricing: normalizeImagePricingConfig(source.imagePricing || {})
  };
}
const adminPermissionIds = [
  "overview.read",
  "accounts.read",
  "accounts.write",
  "accounts.resetUsage",
  "accounts.delete",
  "usage.read",
  "feedback.read",
  "config.ai.read",
  "config.ai.write",
  "gallery.read",
  "gallery.download",
  "diagnostics.read",
  "maintenance.write",
  "config.system.read",
  "config.system.write",
  "update.read",
  "update.write",
  "uninstall.write",
  "autostart.write",
  "export.write",
  "admin.roles.manage"
];
const adminRoleDefinitions = {
  super_admin: {
    label: "超级管理员",
    modules: ["overview", "accounts", "usage", "feedback", "ai", "diagnostics", "system"],
    permissions: adminPermissionIds
  },
  account_admin: {
    label: "账户运营",
    modules: ["overview", "accounts", "usage", "feedback"],
    permissions: ["overview.read", "accounts.read", "accounts.write", "accounts.resetUsage", "accounts.delete", "usage.read", "feedback.read"]
  },
  usage_viewer: {
    label: "用量查看",
    modules: ["overview", "usage", "feedback"],
    permissions: ["overview.read", "usage.read", "feedback.read"]
  },
  ai_template_admin: {
    label: "AI 管理员",
    modules: ["overview", "feedback", "ai"],
    permissions: [
      "overview.read",
      "config.ai.read",
      "config.ai.write",
      "gallery.read",
      "gallery.download",
      "feedback.read"
    ]
  },
  tech_admin: {
    label: "技术维护",
    modules: ["overview", "diagnostics", "system"],
    permissions: [
      "overview.read",
      "diagnostics.read",
      "maintenance.write",
      "config.system.read",
      "config.system.write",
      "update.read",
      "update.write",
      "autostart.write",
      "export.write"
    ]
  }
};


function nowIso() {
  return new Date().toISOString();
}

function hashPasswordLegacy(password, salt) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function hashPassword(password, salt) {
  const derived = scryptSync(String(password || ""), String(salt || ""), 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  }).toString("hex");
  return `${passwordHashPrefix}${derived}`;
}

function secureCompare(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, passwordHash: hashPassword(password, salt), passwordScheme: "scrypt" };
}

function verifyUserPassword(password, user) {
  if (!user || !user.salt || !user.passwordHash) return false;
  const stored = String(user.passwordHash || "");
  const expected = stored.startsWith(passwordHashPrefix)
    ? hashPassword(password, user.salt)
    : hashPasswordLegacy(password, user.salt);
  return secureCompare(expected, stored);
}

function upgradePasswordHashIfNeeded(user, password) {
  if (!user || String(user.passwordHash || "").startsWith(passwordHashPrefix)) return false;
  Object.assign(user, createPasswordRecord(password));
  return true;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .replace(/^::ffff:/, "") || "unknown";
}

function loginAttemptKey(req, username, scope) {
  return `${scope}:${clientIp(req)}:${String(username || "").trim().toLowerCase()}`;
}

function loginRateLimitError(req, username, scope = "admin") {
  const key = loginAttemptKey(req, username, scope);
  const now = Date.now();
  const current = loginAttemptBuckets.get(key);
  if (!current) return "";
  if (current.blockedUntil && current.blockedUntil > now) {
    const seconds = Math.max(1, Math.ceil((current.blockedUntil - now) / 1000));
    return `登录失败次数过多，请 ${seconds} 秒后再试。`;
  }
  if (current.resetAt <= now) {
    loginAttemptBuckets.delete(key);
  }
  return "";
}

function recordLoginFailure(req, username, scope = "admin") {
  const key = loginAttemptKey(req, username, scope);
  const now = Date.now();
  const current = loginAttemptBuckets.get(key);
  const next = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + loginAttemptWindowMs, blockedUntil: 0 };
  next.count += 1;
  if (next.count >= loginAttemptMaxFailures) {
    next.blockedUntil = now + loginAttemptBlockMs;
  }
  loginAttemptBuckets.set(key, next);
}

function clearLoginFailures(req, username, scope = "admin") {
  loginAttemptBuckets.delete(loginAttemptKey(req, username, scope));
}

async function saveAccountDb(db) {
  await accountStore.saveAccountDb(accountStorePaths(), db);
}

async function loadAccountDb() {
  const db = await accountStore.loadAccountDb(accountStorePaths());
  if (!Array.isArray(db.users)) db.users = [];
  return db;
}

function isLegacyDefaultAdmin(user) {
  if (!legacyDefaultAdminPassword || !user || (user.role || "user") !== "admin" || !user.salt || !user.passwordHash) return false;
  return verifyUserPassword(legacyDefaultAdminPassword, user);
}

function accountSetupRequired(db) {
  const admins = (db.users || []).filter((user) => (
    (user.role || "user") === "admin" && (user.status || "active") === "active"
  ));
  return admins.length === 0 || admins.some(isLegacyDefaultAdmin);
}

function validateAdminSetup(username, password, confirmPassword = "") {
  if (!username || username.length < 3) return "管理员账号至少 3 位。";
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return "管理员账号只能包含字母、数字、点、下划线和横线。";
  if (!password || password.length < 8) return "管理员密码至少 8 位。";
  if (!confirmPassword) return "请再次输入管理员密码。";
  if (password !== confirmPassword) return "两次输入的密码不一致。";
  if (legacyDefaultAdminPassword && password === legacyDefaultAdminPassword) return "不能继续使用旧默认密码。";
  if (password.toLowerCase().includes(username.toLowerCase())) return "密码不能包含管理员账号。";
  return "";
}

function defaultAdminQuota() {
  return { aiImages: -1, copywriting: -1 };
}

function defaultUsage() {
  return { aiImages: 0, copywriting: 0 };
}

function normalizeAdminRole(value, fallback = "super_admin") {
  const role = String(value || "").trim();
  return adminRoleDefinitions[role] ? role : fallback;
}

function adminRoleForUser(user) {
  if (!user || (user.role || "user") !== "admin") return "";
  return normalizeAdminRole(user.adminRole || user.adminType || user.adminScope, "super_admin");
}

function adminRoleLabel(role) {
  return adminRoleDefinitions[normalizeAdminRole(role)]?.label || adminRoleDefinitions.super_admin.label;
}

function adminPermissionsForUser(user) {
  const role = adminRoleForUser(user);
  return role ? [...adminRoleDefinitions[role].permissions] : [];
}

function adminVisibleModulesForUser(user) {
  const role = adminRoleForUser(user);
  return role ? [...adminRoleDefinitions[role].modules] : [];
}

function publicAdminRoles() {
  return Object.entries(adminRoleDefinitions).map(([id, role]) => ({
    id,
    label: role.label,
    modules: [...role.modules],
    permissions: [...role.permissions]
  }));
}

function isSuperAdminUser(user) {
  return (user?.role || "user") === "admin" && adminRoleForUser(user) === "super_admin";
}

function hasActiveSuperAdmin(db) {
  return (db.users || []).some((user) => isSuperAdminUser(user) && (user.status || "active") === "active");
}

function adminHasPermission(admin, permission) {
  return adminPermissionsForUser(admin?.user).includes(permission);
}

function adminHasAnyPermission(admin, permissions) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return list.some((permission) => adminHasPermission(admin, permission));
}

function emptyUsageTotals() {
  return Object.fromEntries(usageStatKeys.map((key) => [key, 0]));
}

function sumUsageValues(usage = {}) {
  return usageStatKeys.reduce((sum, key) => sum + Number(usage[key] || 0), 0);
}

function emptyTokenUsageTotals() {
  return {
    calls: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    imageCount: 0,
    estimatedCostUsd: 0,
    estimatedCostCny: 0,
    byModel: {}
  };
}

function roundCost(value) {
  return Math.round(Math.max(0, finiteNumber(value, 0)) * 1000000) / 1000000;
}

function normalizeTokenUsageAggregate(value = {}) {
  const result = emptyTokenUsageTotals();
  result.calls = Math.max(0, Math.round(finiteNumber(value.calls, 0)));
  result.pricedCalls = Math.max(0, Math.round(finiteNumber(value.pricedCalls, 0)));
  result.unpricedCalls = Math.max(0, Math.round(finiteNumber(value.unpricedCalls, 0)));
  result.inputTokens = Math.max(0, Math.round(finiteNumber(value.inputTokens, 0)));
  result.cachedInputTokens = Math.max(0, Math.round(finiteNumber(value.cachedInputTokens, 0)));
  result.outputTokens = Math.max(0, Math.round(finiteNumber(value.outputTokens, 0)));
  result.totalTokens = Math.max(result.inputTokens + result.outputTokens, Math.round(finiteNumber(value.totalTokens, 0)));
  result.imageCount = Math.max(0, Math.round(finiteNumber(value.imageCount, 0)));
  result.estimatedCostUsd = roundCost(value.estimatedCostUsd);
  result.estimatedCostCny = roundCost(value.estimatedCostCny);
  const byModel = value.byModel && typeof value.byModel === "object" ? value.byModel : {};
  for (const [key, row] of Object.entries(byModel)) {
    result.byModel[key] = {
      ...normalizeTokenUsageAggregate({ ...row, byModel: {} }),
      provider: String(row?.provider || "").trim(),
      model: String(row?.model || "").trim(),
      unitType: String(row?.unitType || "").trim(),
      resolution: String(row?.resolution || "").trim(),
      imageCount: Math.max(0, Math.round(finiteNumber(row?.imageCount, 0))),
      lastSource: String(row?.lastSource || "").trim(),
      lastUsedAt: String(row?.lastUsedAt || "").trim()
    };
  }
  return result;
}

function tokenPriceMatches(row, provider, model) {
  const wantedProvider = String(provider || "").trim().toLowerCase();
  const rowProvider = String(row.provider || "").trim().toLowerCase();
  if (rowProvider && rowProvider !== wantedProvider) return false;
  const modelText = String(model || "").trim().toLowerCase();
  const priceModel = String(row.model || "").trim().toLowerCase();
  if (["*", "all", "default"].includes(priceModel)) return true;
  return Boolean(priceModel && (modelText === priceModel || modelText.startsWith(`${priceModel}-`)));
}

function findTokenPriceFromPricing(pricing, provider, model) {
  const safe = normalizeTokenPricingConfig(pricing || {});
  const matches = safe.models
    .slice()
    .sort((a, b) => String(b.model || "").length - String(a.model || "").length)
    .filter((row) => tokenPriceMatches(row, provider, model));
  const match = matches.find((row) => row.provider) || matches[0] || null;
  return match ? { ...match, saleMultiplier: safe.saleMultiplier } : null;
}

function estimateTokenCostFromPricing(usage, price, usdToCnyRate) {
  if (!price) return { estimatedCostUsd: 0, estimatedCostCny: 0, priceMatched: false };
  const billableInputTokens = Math.max(0, Number(usage.inputTokens || 0) - Number(usage.cachedInputTokens || 0));
  const multiplier = Math.max(0, finiteNumber(price.saleMultiplier, 1));
  const rate = Math.max(0, finiteNumber(usdToCnyRate, 0));
  const isCny = String(price.currency || "").toUpperCase() === "CNY"
    || Number(price.inputCnyPer1M || 0) > 0
    || Number(price.outputCnyPer1M || 0) > 0;
  const rawCost = (
    (billableInputTokens * Number(isCny ? price.inputCnyPer1M : price.inputUsdPer1M || 0))
    + (Number(usage.cachedInputTokens || 0) * Number(isCny ? price.cachedInputCnyPer1M : price.cachedInputUsdPer1M || 0))
    + (Number(usage.outputTokens || 0) * Number(isCny ? price.outputCnyPer1M : price.outputUsdPer1M || 0))
  ) / 1000000;
  const estimatedCostCny = (isCny ? rawCost : rawCost * rate) * multiplier;
  const estimatedCostUsd = (isCny ? (rate > 0 ? rawCost / rate : 0) : rawCost) * multiplier;
  return {
    estimatedCostUsd: roundCost(estimatedCostUsd),
    estimatedCostCny: roundCost(estimatedCostCny),
    priceMatched: true
  };
}

function normalizeBillableImageResolution(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text.includes("4K")) return "4K";
  if (text.includes("2K")) return "2K";
  return "1K";
}

function estimateImageUnitCostFromPricing(usage, costPricing = {}) {
  const pricing = normalizeAiCostPricingConfig(costPricing);
  const tokenPricing = pricing.tokenPricing;
  const imagePricing = pricing.imagePricing;
  const resolution = normalizeBillableImageResolution(usage.resolution || usage.model || "1K");
  const count = Math.max(0, Math.round(finiteNumber(usage.imageCount || usage.calls, 0)));
  const unit = Math.max(0, finiteNumber(imagePricing.native?.[resolution]?.usdPerImage, 0));
  const multiplier = Math.max(0, finiteNumber(imagePricing.saleMultiplier, tokenPricing.saleMultiplier || 1));
  const estimatedCostUsd = unit * count * multiplier;
  return {
    estimatedCostUsd: roundCost(estimatedCostUsd),
    estimatedCostCny: roundCost(estimatedCostUsd * Math.max(0, finiteNumber(tokenPricing.usdToCnyRate, 0))),
    priceMatched: unit > 0
  };
}

function repriceTokenUsageAggregate(value = {}, pricing = null) {
  const aggregate = normalizeTokenUsageAggregate(value);
  if (!pricing) return aggregate;
  const costPricing = normalizeAiCostPricingConfig(pricing);
  const safePricing = costPricing.tokenPricing;
  const entries = Object.entries(aggregate.byModel || {});
  if (!entries.length) {
    const price = findTokenPriceFromPricing(safePricing, value.provider, value.model);
    const cost = aggregate.totalTokens
      ? estimateTokenCostFromPricing(aggregate, price, safePricing.usdToCnyRate)
      : estimateImageUnitCostFromPricing(value, costPricing);
    aggregate.estimatedCostUsd = cost.estimatedCostUsd;
    aggregate.estimatedCostCny = cost.estimatedCostCny;
    aggregate.pricedCalls = cost.priceMatched ? aggregate.calls : 0;
    aggregate.unpricedCalls = cost.priceMatched ? 0 : aggregate.calls;
    return aggregate;
  }

  aggregate.byModel = {};
  aggregate.estimatedCostUsd = 0;
  aggregate.estimatedCostCny = 0;
  aggregate.pricedCalls = 0;
  aggregate.unpricedCalls = 0;
  for (const [key, row] of entries) {
    const normalized = normalizeTokenUsageAggregate({ ...row, byModel: {} });
    const provider = String(row?.provider || "").trim();
    const model = String(row?.model || "").trim();
    const price = findTokenPriceFromPricing(safePricing, provider, model);
    normalized.unitType = String(row?.unitType || "").trim();
    normalized.resolution = String(row?.resolution || "").trim();
    normalized.imageCount = Math.max(0, Math.round(finiteNumber(row?.imageCount, 0)));
    const cost = normalized.totalTokens
      ? estimateTokenCostFromPricing(normalized, price, safePricing.usdToCnyRate)
      : estimateImageUnitCostFromPricing({ ...row, provider, model }, costPricing);
    normalized.estimatedCostUsd = cost.estimatedCostUsd;
    normalized.estimatedCostCny = cost.estimatedCostCny;
    normalized.pricedCalls = cost.priceMatched ? normalized.calls : 0;
    normalized.unpricedCalls = cost.priceMatched ? 0 : normalized.calls;
    normalized.provider = provider;
    normalized.model = model;
    normalized.lastSource = String(row?.lastSource || "").trim();
    normalized.lastUsedAt = String(row?.lastUsedAt || "").trim();
    aggregate.byModel[key] = normalized;
    aggregate.estimatedCostUsd = roundCost(aggregate.estimatedCostUsd + normalized.estimatedCostUsd);
    aggregate.estimatedCostCny = roundCost(aggregate.estimatedCostCny + normalized.estimatedCostCny);
    aggregate.pricedCalls += normalized.pricedCalls;
    aggregate.unpricedCalls += normalized.unpricedCalls;
  }
  return aggregate;
}

function addTokenUsageTotals(target, source = {}) {
  const next = target || emptyTokenUsageTotals();
  const usage = normalizeTokenUsageAggregate(source);
  next.calls += usage.calls;
  next.pricedCalls += usage.pricedCalls;
  next.unpricedCalls += usage.unpricedCalls;
  next.inputTokens += usage.inputTokens;
  next.cachedInputTokens += usage.cachedInputTokens;
  next.outputTokens += usage.outputTokens;
  next.totalTokens += usage.totalTokens;
  next.imageCount = Math.max(0, Math.round(Number(next.imageCount || 0) + Number(usage.imageCount || 0)));
  next.estimatedCostUsd = roundCost(next.estimatedCostUsd + usage.estimatedCostUsd);
  next.estimatedCostCny = roundCost(next.estimatedCostCny + usage.estimatedCostCny);
  next.byModel = next.byModel && typeof next.byModel === "object" ? next.byModel : {};
  for (const [key, row] of Object.entries(usage.byModel || {})) {
    const existing = next.byModel[key] || { provider: row.provider, model: row.model, calls: 0, pricedCalls: 0, unpricedCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, estimatedCostCny: 0 };
    existing.provider = row.provider || existing.provider || "";
    existing.model = row.model || existing.model || "";
    existing.unitType = row.unitType || existing.unitType || "";
    existing.resolution = row.resolution || existing.resolution || "";
    existing.imageCount = Math.max(0, Math.round(Number(existing.imageCount || 0) + Number(row.imageCount || 0)));
    existing.calls += row.calls;
    existing.pricedCalls += row.pricedCalls;
    existing.unpricedCalls += row.unpricedCalls;
    existing.inputTokens += row.inputTokens;
    existing.cachedInputTokens += row.cachedInputTokens;
    existing.outputTokens += row.outputTokens;
    existing.totalTokens += row.totalTokens;
    existing.estimatedCostUsd = roundCost(existing.estimatedCostUsd + row.estimatedCostUsd);
    existing.estimatedCostCny = roundCost(existing.estimatedCostCny + row.estimatedCostCny);
    existing.lastSource = row.lastSource || existing.lastSource || "";
    existing.lastUsedAt = row.lastUsedAt || existing.lastUsedAt || "";
    next.byModel[key] = existing;
  }
  return next;
}

function publicTokenUsage(value = {}, pricing = null) {
  const aggregate = pricing ? repriceTokenUsageAggregate(value, pricing) : normalizeTokenUsageAggregate(value);
  aggregate.models = Object.values(aggregate.byModel)
    .sort((a, b) => Number(b.estimatedCostCny || 0) - Number(a.estimatedCostCny || 0) || Number(b.totalTokens || 0) - Number(a.totalTokens || 0))
    .slice(0, 20);
  return aggregate;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentDateKeys(count) {
  const total = Math.max(1, Number(count || 1));
  const today = new Date();
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (total - 1 - index));
    return localDateKey(date);
  });
}

async function loadUsageDailyDb() {
  return accountStore.loadUsageDailyDb(accountStorePaths());
}

function collectDailyUsage(dailyDb, dateKeys) {
  const totals = emptyUsageTotals();
  const userTotals = new Map();
  for (const dateKey of dateKeys) {
    const users = dailyDb?.days?.[dateKey]?.users || {};
    for (const [userId, usage] of Object.entries(users)) {
      const current = userTotals.get(userId) || emptyUsageTotals();
      for (const key of usageStatKeys) {
        const value = Number(usage?.[key] || 0);
        totals[key] += value;
        current[key] += value;
      }
      userTotals.set(userId, current);
    }
  }
  return { totals, userTotals };
}

function collectDailyTokenUsage(dailyDb, dateKeys, pricing = null) {
  const totals = emptyTokenUsageTotals();
  const userTotals = new Map();
  const groupTotals = new Map();
  for (const dateKey of dateKeys) {
    const users = dailyDb?.days?.[dateKey]?.tokenUsage?.users || {};
    for (const [userId, usage] of Object.entries(users)) {
      const current = userTotals.get(userId) || emptyTokenUsageTotals();
      const pricedUsage = pricing ? repriceTokenUsageAggregate(usage, pricing) : usage;
      addTokenUsageTotals(totals, pricedUsage);
      addTokenUsageTotals(current, pricedUsage);
      userTotals.set(userId, current);
    }
    const groups = dailyDb?.days?.[dateKey]?.tokenUsage?.groups || {};
    for (const [groupKey, usage] of Object.entries(groups)) {
      const current = groupTotals.get(groupKey) || {
        ...emptyTokenUsageTotals(),
        groupId: usage.groupId || groupKey,
        groupName: usage.groupName || usage.name || groupKey,
        department: usage.department || ""
      };
      addTokenUsageTotals(current, pricing ? repriceTokenUsageAggregate(usage, pricing) : usage);
      current.groupId = current.groupId || usage.groupId || groupKey;
      current.groupName = current.groupName || usage.groupName || usage.name || groupKey;
      current.department = current.department || usage.department || "";
      groupTotals.set(groupKey, current);
    }
  }
  return { totals, userTotals, groupTotals };
}

function tokenModelRows(usage, pricing = null) {
  const aggregate = pricing ? repriceTokenUsageAggregate(usage, pricing) : normalizeTokenUsageAggregate(usage);
  return Object.values(aggregate.byModel || {})
    .sort((a, b) => Number(b.estimatedCostCny || 0) - Number(a.estimatedCostCny || 0) || Number(b.totalTokens || 0) - Number(a.totalTokens || 0))
    .slice(0, 8);
}

async function readAiFeedbackStore() {
  try {
    const raw = await readFile(aiFeedbackPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function feedbackDateKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeFeedbackReferences(itemId = "", references = []) {
  const safeId = String(itemId || "").replace(/[^a-z0-9-]/gi, "");
  return (Array.isArray(references) ? references : []).slice(0, 12).map((item, index) => {
    const fileName = basename(String(item?.fileName || item?.file_name || ""));
    const hasLocalAsset = safeId && /^[^\\/:*?"<>|]+\.(png|jpe?g|webp)$/i.test(fileName);
    return {
      index: Number(item?.index || index + 1),
      name: String(item?.name || `参考图${index + 1}`).trim(),
      role: String(item?.role || "").trim(),
      url: String(item?.url || "").trim(),
      imageUrl: hasLocalAsset
        ? `/api/admin/feedback/asset/${encodeURIComponent(safeId)}/${encodeURIComponent(fileName)}`
        : String(item?.imageUrl || item?.image_url || "").trim(),
      fileName,
      mime: String(item?.mime || "").trim(),
      bytes: Number(item?.bytes || 0),
      error: String(item?.error || "").trim()
    };
  });
}

function normalizeFeedbackItem(item = {}) {
  const parsedImageIndex = Math.floor(Number(item.imageIndex || 0));
  const id = String(item.id || "");
  return {
    id,
    rating: String(item.rating || "").toLowerCase() === "up" ? "up" : "down",
    issue: String(item.issue || "").trim(),
    prompt: String(item.prompt || "").trim(),
    originalPrompt: String(item.originalPrompt || item.original_prompt || "").trim(),
    plannedPrompt: String(item.plannedPrompt || item.planned_prompt || "").trim(),
    imageName: String(item.imageName || "").trim(),
    imageUrl: String(item.imageUrl || "").trim(),
    references: normalizeFeedbackReferences(id, item.references || item.referenceImages || item.reference_images || []),
    aiLabel: String(item.aiLabel || "").trim(),
    workflow: String(item.workflow || "").trim(),
    jobId: String(item.jobId || item.job_id || "").trim(),
    provider: String(item.provider || "").trim(),
    model: String(item.model || "").trim(),
    reasonType: String(item.reasonType || item.reason_type || "").trim(),
    conversationId: String(item.conversationId || "").trim(),
    messageId: String(item.messageId || "").trim(),
    imageIndex: Number.isFinite(parsedImageIndex) && parsedImageIndex >= 0 ? parsedImageIndex : 0,
    userId: String(item.userId || "").trim(),
    username: String(item.username || "").trim(),
    displayName: String(item.displayName || item.username || "").trim(),
    groupId: String(item.groupId || "").trim(),
    groupName: String(item.groupName || "").trim(),
    createdAt: String(item.createdAt || item.updatedAt || "").trim(),
    updatedAt: String(item.updatedAt || item.createdAt || "").trim()
  };
}

function collapseAutomaticFailureDuplicates(items = []) {
  const collapsed = [];
  for (const item of items) {
    const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    const duplicateIndex = collapsed.findIndex((candidate) => {
      const candidateTime = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime();
      const exactlyOneHasJobId = Boolean(item.jobId) !== Boolean(candidate.jobId);
      return exactlyOneHasJobId
        && item.rating === "down"
        && candidate.rating === "down"
        && item.userId === candidate.userId
        && item.workflow === candidate.workflow
        && item.conversationId === candidate.conversationId
        && item.issue === candidate.issue
        && Number.isFinite(itemTime)
        && Number.isFinite(candidateTime)
        && Math.abs(itemTime - candidateTime) <= 10000;
    });
    if (duplicateIndex < 0) {
      collapsed.push(item);
      continue;
    }
    const current = collapsed[duplicateIndex];
    const detailed = item.jobId ? item : current;
    const fallback = item.jobId ? current : item;
    collapsed[duplicateIndex] = {
      ...fallback,
      ...detailed,
      originalPrompt: detailed.originalPrompt || fallback.originalPrompt,
      plannedPrompt: detailed.plannedPrompt || fallback.plannedPrompt,
      prompt: detailed.prompt || fallback.prompt,
      references: detailed.references?.length ? detailed.references : fallback.references,
      createdAt: String(detailed.createdAt || "").localeCompare(String(fallback.createdAt || "")) <= 0
        ? detailed.createdAt
        : fallback.createdAt,
      updatedAt: String(detailed.updatedAt || "").localeCompare(String(fallback.updatedAt || "")) >= 0
        ? detailed.updatedAt
        : fallback.updatedAt
    };
  }
  return collapsed;
}

async function buildAiFeedbackReport(days = 7) {
  const windowDays = Math.max(1, Math.min(31, Number(days || 7)));
  const now = Date.now();
  const sinceMs = now - windowDays * 24 * 60 * 60 * 1000;
  const store = await readAiFeedbackStore();
  const allItems = collapseAutomaticFailureDuplicates(
    store.items.map(normalizeFeedbackItem).filter((item) => item.id && item.createdAt)
  );
  const recent = allItems
    .filter((item) => {
      const time = new Date(item.updatedAt || item.createdAt).getTime();
      return Number.isFinite(time) && time >= sinceMs;
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const downs = recent.filter((item) => item.rating === "down");
  const ups = recent.filter((item) => item.rating === "up");
  const dayBuckets = new Map();
  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const key = new Date(now - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dayBuckets.set(key, { date: key, up: 0, down: 0, total: 0 });
  }
  for (const item of recent) {
    const key = feedbackDateKey(item.updatedAt || item.createdAt);
    if (!dayBuckets.has(key)) dayBuckets.set(key, { date: key, up: 0, down: 0, total: 0 });
    const bucket = dayBuckets.get(key);
    bucket[item.rating] += 1;
    bucket.total += 1;
  }
  const byUser = new Map();
  for (const item of recent) {
    const key = item.userId || item.username || "unknown";
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: item.userId,
        username: item.username,
        displayName: item.displayName || item.username || "未知用户",
        groupName: item.groupName,
        up: 0,
        down: 0,
        total: 0
      });
    }
    const row = byUser.get(key);
    row[item.rating] += 1;
    row.total += 1;
  }
  const byIssue = new Map();
  for (const item of downs) {
    const key = item.issue || "未填写问题";
    if (!byIssue.has(key)) byIssue.set(key, { issue: key, count: 0, latestAt: "", users: new Set() });
    const row = byIssue.get(key);
    row.count += 1;
    row.latestAt = String(row.latestAt || "").localeCompare(item.updatedAt || item.createdAt) < 0 ? (item.updatedAt || item.createdAt) : row.latestAt;
    row.users.add(item.displayName || item.username || "未知用户");
  }
  return {
    windowDays,
    generatedAt: nowIso(),
    since: new Date(sinceMs).toISOString(),
    summary: {
      total: recent.length,
      up: ups.length,
      down: downs.length,
      downRate: recent.length ? Math.round((downs.length / recent.length) * 1000) / 10 : 0
    },
    trend: [...dayBuckets.values()].sort((a, b) => a.date.localeCompare(b.date)),
    users: [...byUser.values()]
      .sort((a, b) => b.down - a.down || b.total - a.total || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"))
      .slice(0, 20),
    issues: [...byIssue.values()]
      .map((item) => ({
        issue: item.issue,
        count: item.count,
        latestAt: item.latestAt,
        users: [...item.users].slice(0, 8)
      }))
      .sort((a, b) => b.count - a.count || String(b.latestAt || "").localeCompare(String(a.latestAt || "")))
      .slice(0, 20),
    recent: downs.slice(0, 80),
    positiveRecent: ups.slice(0, 20),
    allTime: {
      total: allItems.length,
      up: allItems.filter((item) => item.rating === "up").length,
      down: allItems.filter((item) => item.rating === "down").length
    }
  };
}

function buildUsageDashboard(users, dailyDb, config = null) {
  const costPricing = normalizeAiCostPricingConfig(config?.ai || config || {});
  const tokenPricing = costPricing;
  const userList = Array.isArray(users) ? users : [];
  const userMap = new Map(userList.map((user) => [String(user.id || ""), user]));
  const todayKeys = [localDateKey()];
  const weekKeys = recentDateKeys(7);
  const monthKeys = recentDateKeys(30);
  const today = collectDailyUsage(dailyDb, todayKeys);
  const week = collectDailyUsage(dailyDb, weekKeys);
  const month = collectDailyUsage(dailyDb, monthKeys);
  const todayToken = collectDailyTokenUsage(dailyDb, todayKeys, tokenPricing);
  const weekToken = collectDailyTokenUsage(dailyDb, weekKeys, tokenPricing);
  const monthToken = collectDailyTokenUsage(dailyDb, monthKeys, tokenPricing);
  const allToken = collectDailyTokenUsage(dailyDb, Object.keys(dailyDb?.days || {}).sort(), tokenPricing);
  const cumulativeTotals = userList.reduce((sum, user) => {
    for (const key of usageStatKeys) sum[key] += Number(user.usage?.[key] || 0);
    return sum;
  }, emptyUsageTotals());
  const cumulativeTokenTotals = userList.reduce((sum, user) => addTokenUsageTotals(sum, repriceTokenUsageAggregate(user.tokenUsage, tokenPricing)), emptyTokenUsageTotals());

  const enrichUser = (userId, usage) => {
    const user = userMap.get(String(userId)) || {};
    return {
      userId,
      username: user.username || "",
      displayName: user.displayName || user.username || "未知账户",
      usage,
      total: sumUsageValues(usage)
    };
  };
  const rankUsers = (rows) => rows
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"))
    .slice(0, 10);
  const dailyRows = (userTotals) => [...userTotals.entries()].map(([userId, usage]) => enrichUser(userId, usage));
  const tokenRows = (userTotals) => [...userTotals.entries()].map(([userId, usage]) => {
    const user = userMap.get(String(userId)) || {};
    const tokenUsage = publicTokenUsage(usage, tokenPricing);
    return {
      userId,
      username: user.username || "",
      displayName: user.displayName || user.username || "未知账户",
      tokenUsage,
      totalTokens: tokenUsage.totalTokens,
      imageCount: tokenUsage.imageCount,
      estimatedCostCny: tokenUsage.estimatedCostCny,
      estimatedCostUsd: tokenUsage.estimatedCostUsd
    };
  }).sort((a, b) => Number(b.estimatedCostCny || 0) - Number(a.estimatedCostCny || 0) || Number(b.totalTokens || 0) - Number(a.totalTokens || 0)).slice(0, 10);
  const tokenGroupRows = (groupTotals) => [...groupTotals.entries()].map(([groupId, usage]) => {
    const tokenUsage = publicTokenUsage(usage, tokenPricing);
    return {
      groupId: usage.groupId || groupId,
      groupName: usage.groupName || usage.name || groupId,
      department: usage.department || "",
      tokenUsage,
      totalTokens: tokenUsage.totalTokens,
      imageCount: tokenUsage.imageCount,
      estimatedCostCny: tokenUsage.estimatedCostCny,
      estimatedCostUsd: tokenUsage.estimatedCostUsd
    };
  }).sort((a, b) => Number(b.estimatedCostCny || 0) - Number(a.estimatedCostCny || 0) || Number(b.totalTokens || 0) - Number(a.totalTokens || 0)).slice(0, 10);

  const cumulativeUsers = userList
    .map((user) => enrichUser(user.id, {
      aiImages: Number(user.usage?.aiImages || 0),
      copywriting: Number(user.usage?.copywriting || 0)
    }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
  const cumulativeTokenUsers = userList
    .map((user) => {
      const tokenUsage = publicTokenUsage(user.tokenUsage, tokenPricing);
      return {
        userId: user.id,
        username: user.username || "",
        displayName: user.displayName || user.username || "未知账户",
        tokenUsage,
        totalTokens: tokenUsage.totalTokens,
        imageCount: tokenUsage.imageCount,
        estimatedCostCny: tokenUsage.estimatedCostCny,
        estimatedCostUsd: tokenUsage.estimatedCostUsd
      };
    })
    .sort((a, b) => Number(b.estimatedCostCny || 0) - Number(a.estimatedCostCny || 0) || Number(b.totalTokens || 0) - Number(a.totalTokens || 0))
    .slice(0, 10);

  const moduleRankingsFromRows = (rows) => {
    const rankings = {};
    for (const meta of usageModuleMeta) {
      rankings[meta.key] = rows
        .map((row) => ({
          userId: row.userId,
          username: row.username || "",
          displayName: row.displayName || row.username || "未知账户",
          value: Number(row.usage?.[meta.key] || 0)
        }))
        .sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"))
        .slice(0, 5);
    }
    return rankings;
  };
  const moduleShareFromTotals = (totals) => {
    const total = sumUsageValues(totals);
    return usageModuleMeta.map((meta) => {
      const value = Number(totals[meta.key] || 0);
      return {
        ...meta,
        value,
        percent: total ? Math.round((value / total) * 1000) / 10 : 0
      };
    });
  };

  const moduleRankings = {};
  for (const meta of usageModuleMeta) {
    moduleRankings[meta.key] = userList
      .map((user) => ({
        userId: user.id,
        username: user.username || "",
        displayName: user.displayName || user.username || "未知账户",
        value: Number(user.usage?.[meta.key] || 0)
      }))
      .sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"))
      .slice(0, 5);
  }

  const cumulativeTotal = sumUsageValues(cumulativeTotals);
  const todayRows = dailyRows(today.userTotals);
  const weekRows = dailyRows(week.userTotals);
  const monthRows = dailyRows(month.userTotals);
  const todayRanking = rankUsers([...todayRows]);
  const weekRanking = rankUsers([...weekRows]);
  const monthRanking = rankUsers([...monthRows]);
  return {
    generatedAt: new Date().toISOString(),
    modules: usageModuleMeta,
    summary: {
      today: sumUsageValues(today.totals),
      week: sumUsageValues(week.totals),
      month: sumUsageValues(month.totals),
      total: cumulativeTotal,
      activeUsersToday: [...today.userTotals.values()].filter((usage) => sumUsageValues(usage) > 0).length,
      activeUsersWeek: [...week.userTotals.values()].filter((usage) => sumUsageValues(usage) > 0).length
    },
    moduleTotals: {
      today: today.totals,
      week: week.totals,
      month: month.totals,
      total: cumulativeTotals
    },
    periodRankings: {
      today: todayRanking,
      week: weekRanking,
      month: monthRanking,
      total: cumulativeUsers.slice(0, 10)
    },
    periodModuleRankings: {
      today: moduleRankingsFromRows(todayRows),
      week: moduleRankingsFromRows(weekRows),
      month: moduleRankingsFromRows(monthRows),
      total: moduleRankings
    },
    periodModuleShare: {
      today: moduleShareFromTotals(today.totals),
      week: moduleShareFromTotals(week.totals),
      month: moduleShareFromTotals(month.totals),
      total: moduleShareFromTotals(cumulativeTotals)
    },
    compositeRanking: cumulativeUsers.slice(0, 10),
    moduleRankings,
    moduleShare: moduleShareFromTotals(cumulativeTotals),
    tokenUsage: {
      billing: {
        balanceCny: costPricing.imagePricing.balanceCny,
        saleMultiplier: costPricing.imagePricing.saleMultiplier || costPricing.tokenPricing.saleMultiplier || 1,
        consumedCny: publicTokenUsage(cumulativeTokenTotals, tokenPricing).estimatedCostCny,
        remainingCny: roundCost(costPricing.imagePricing.balanceCny - publicTokenUsage(cumulativeTokenTotals, tokenPricing).estimatedCostCny)
      },
      summary: {
        today: publicTokenUsage(todayToken.totals, tokenPricing),
        week: publicTokenUsage(weekToken.totals, tokenPricing),
        month: publicTokenUsage(monthToken.totals, tokenPricing),
        total: publicTokenUsage(cumulativeTokenTotals, tokenPricing)
      },
      periodUsers: {
        today: tokenRows(todayToken.userTotals),
        week: tokenRows(weekToken.userTotals),
        month: tokenRows(monthToken.userTotals),
        total: cumulativeTokenUsers
      },
      periodGroups: {
        today: tokenGroupRows(todayToken.groupTotals),
        week: tokenGroupRows(weekToken.groupTotals),
        month: tokenGroupRows(monthToken.groupTotals),
        total: tokenGroupRows(allToken.groupTotals)
      },
      periodModels: {
        today: tokenModelRows(todayToken.totals, tokenPricing),
        week: tokenModelRows(weekToken.totals, tokenPricing),
        month: tokenModelRows(monthToken.totals, tokenPricing),
        total: tokenModelRows(cumulativeTokenTotals, tokenPricing)
      }
    },
    trend: weekKeys.map((dateKey) => {
      const day = collectDailyUsage(dailyDb, [dateKey]).totals;
      return { date: dateKey, total: sumUsageValues(day), usage: day };
    })
  };
}

function usageQuotaValue(user, usageKey) {
  const quota = user?.quota || {};
  return Number(quota[usageKey] ?? 0);
}

function defaultAiImageSkills() {
  return [
    {
      id: "none",
      name: "未选择",
      type: "通用",
      description: "不追加品牌或行业约束，只按当前对话需求生成。",
      prompt: "",
      enabled: true
    },
    {
      id: "ecommerce-design-agent",
      name: "电商设计 Agent",
      type: "AI Agent",
      description: "点选后才启用电商主图规划、卖点版式和设计复盘。",
      prompt: "启用电商设计 Agent：仅当本 Agent 被选择时，才为电商主图、商品推广图、平台主图生成高转化规划、卖点区、版式建议和设计复盘。不要把汇报页、表格页或普通截图美化自动归为电商主图。",
      enabled: true
    },
    {
      id: "white-bg-product",
      name: "白底商品图规范",
      type: "图片用途",
      description: "商品主体完整，白底或浅灰棚拍，方便后续构图和抠图。",
      prompt: "遵循白底商品图规范：商品主体完整、边缘清晰、白底或浅灰棚拍、方便后续构图，不要裁切主体，不要生成文字。",
      enabled: true
    }
  ];
}

function normalizeAiImageSkills(value) {
  const source = Array.isArray(value) && value.length ? value : defaultAiImageSkills();
  const seen = new Set();
  const normalized = source
    .map((item) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim(),
      type: String(item?.type || "通用").trim(),
      description: String(item?.description || "").trim(),
      prompt: String(item?.prompt || "").trim(),
      allowMainComposer: item?.allowMainComposer !== false,
      allowCanvasImageEdit: item?.allowCanvasImageEdit !== false,
      enabled: item?.enabled !== false
    }))
    .filter((item) => item.id && item.name && !["generic-brand", "generic-apparel-brand"].includes(item.id) && !seen.has(item.id) && seen.add(item.id));
  if (!normalized.some((item) => item.id === "none")) {
    normalized.unshift(defaultAiImageSkills()[0]);
  }
  const builtIns = defaultAiImageSkills();
  const builtInById = new Map(builtIns.map((item) => [item.id, item]));
  for (const item of normalized) {
    if (!["ecommerce-design-agent"].includes(item.id)) continue;
    const builtIn = builtInById.get(item.id);
    if (!builtIn) continue;
    const enabled = item.enabled !== false;
    Object.assign(item, { ...builtIn, enabled });
  }
  let insertIndex = normalized.some((item) => item.id === "none") ? 1 : 0;
  for (const builtInSkill of builtIns.filter((item) => ["ecommerce-design-agent"].includes(item.id))) {
    if (normalized.some((item) => item.id === builtInSkill.id)) continue;
    normalized.splice(insertIndex, 0, builtInSkill);
    insertIndex += 1;
  }
  return normalized.length ? normalized : defaultAiImageSkills();
}

function defaultMaintenanceConfig() {
  return {
    enabled: false,
    title: "系统维护中",
    message: "电商 AI 画布系统正在维护升级，预计维护结束后恢复使用。",
    detail: "维护期间暂无法登录使用，请稍后再试。",
    endsAt: "",
    allowlist: [],
    updatedAt: ""
  };
}

function normalizeMaintenanceAllowlist(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n\r,，;；]+/);
  const seen = new Set();
  return source
    .map((item) => String(item || "").trim().slice(0, 80))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeMaintenanceConfig(value = {}) {
  const defaults = defaultMaintenanceConfig();
  return {
    enabled: value.enabled === true,
    title: String(value.title ?? defaults.title).trim().slice(0, 80) || defaults.title,
    message: String(value.message ?? defaults.message).trim().slice(0, 600) || defaults.message,
    detail: String(value.detail ?? defaults.detail).trim().slice(0, 600),
    endsAt: String(value.endsAt || "").trim().slice(0, 80),
    allowlist: normalizeMaintenanceAllowlist(value.allowlist ?? defaults.allowlist),
    updatedAt: String(value.updatedAt || "").trim().slice(0, 80)
  };
}

function isMaintenanceActive(maintenance) {
  const safe = normalizeMaintenanceConfig(maintenance);
  if (!safe.enabled) return false;
  if (!safe.endsAt) return true;
  const endsAt = new Date(safe.endsAt).getTime();
  return !Number.isFinite(endsAt) || endsAt > Date.now();
}

function defaultIntranetConfig() {
  return {
    version: 1,
    appliance: {
      name: "AI 创作画布",
      companyName: "",
      employeePort,
      adminPort
    },
    ai: {
      primaryImageApiKey: "",
      secondaryImageApiKey: "",
      secondaryImageBaseUrl: defaultSecondaryApiBaseUrl,
      imageApiProvider: "primary",
      textServiceBApiKey: "",
      textServiceCApiKey: "",
      groupKeys: [],
      primaryTextModel: String(process.env.PRIMARY_TEXT_MODEL || "").trim(),
      imageTextModel: defaultImageServiceTextModel,
      imageEditModel: defaultImageServiceEditModel,
      standardReasoningModel: defaultImageServiceStandardPlannerModel,
      deepReasoningModel: defaultImageServicePlannerModel,
      remoteImageBed: {
        enabled: false,
        owner: "",
        repo: "",
        branch: "main",
        basePath: "images",
        token: ""
      },
      objectStorage: {
        enabled: false,
        endpoint: "",
        region: "auto",
        bucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        pathPrefix: "images",
        expiresSeconds: 3600,
        forcePathStyle: true
      },
      cloudSync: {
        enabled: false,
        includeProjects: true,
        includeConversations: true,
        includeAssets: true,
        pathPrefix: "backups",
        timeoutSeconds: 45
      },
      textServiceBModel: "",
      textServiceCModel: "",
      aiImageSkills: defaultAiImageSkills(),
      tokenPricing: defaultTokenPricingConfig(),
      imagePricing: defaultImagePricingConfig()
    },
    updates: {
      currentVersion: "0.1.0-preview.23",
      latestVersion: "0.1.0-preview.23",
      packageUrl: "",
      releaseNote: "",
      forceUpdate: false
    },
    maintenance: defaultMaintenanceConfig(),
    privacy: defaultPrivacyConfig()
  };
}


function normalizeApiKey(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").trim().replace(/^Bearer\s+/i, "").trim();
}

function safeGroupId(value, fallback = "") {
  const text = String(value || "").trim();
  const normalized = text
    .replace(/[^a-z0-9_.-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function normalizeGroupText(value, maxLength = 60) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeUserBillingGroup(user = {}) {
  const department = normalizeGroupText(user.department);
  const groupId = safeGroupId(user.groupId || user.group_id || "", "");
  const groupName = normalizeGroupText(user.groupName || user.group_name || "");
  return {
    department,
    groupId,
    groupName: groupName || groupId
  };
}

function normalizeAiGroupKeyConfig(value = {}, index = 0) {
  const department = normalizeGroupText(value.department);
  const name = normalizeGroupText(value.name || value.groupName);
  const id = safeGroupId(value.id || value.groupId || name || department, `group-${index + 1}`);
  return {
    id,
    name: name || id,
    department,
    enabled: value.enabled !== false,
    primaryImageApiKey: normalizeApiKey(value.primaryImageApiKey || value.primaryApiKey || ""),
    secondaryImageApiKey: normalizeApiKey(value.secondaryImageApiKey || ""),
    textServiceBApiKey: normalizeApiKey(value.textServiceBApiKey || ""),
    textServiceCApiKey: normalizeApiKey(value.textServiceCApiKey || "")
  };
}

function normalizeAiGroupKeyConfigs(value = []) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows
    .map((item, index) => normalizeAiGroupKeyConfig(item, index))
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return item.enabled || item.primaryImageApiKey || item.secondaryImageApiKey || item.textServiceBApiKey || item.textServiceCApiKey;
    });
}

function normalizeAiUserKeys(value = {}, existing = {}) {
  const source = value && typeof value === "object" ? value : {};
  const previous = existing && typeof existing === "object" ? existing : {};
  const read = (field) => {
    if (!Object.prototype.hasOwnProperty.call(source, field)) return normalizeApiKey(previous[field] || "");
    const raw = String(source[field] ?? "").trim();
    if (raw === configuredKeyPlaceholder) return normalizeApiKey(previous[field] || "");
    return normalizeApiKey(raw);
  };
  return {
    primaryImageApiKey: read("primaryImageApiKey"),
    secondaryImageApiKey: read("secondaryImageApiKey"),
    textServiceBApiKey: read("textServiceBApiKey"),
    textServiceCApiKey: read("textServiceCApiKey")
  };
}

function publicAiUserKeys(keys = {}) {
  const safe = normalizeAiUserKeys(keys);
  return {
    primaryImageApiKey: safe.primaryImageApiKey ? configuredKeyPlaceholder : "",
    secondaryImageApiKey: safe.secondaryImageApiKey ? configuredKeyPlaceholder : "",
    textServiceBApiKey: safe.textServiceBApiKey ? configuredKeyPlaceholder : "",
    textServiceCApiKey: safe.textServiceCApiKey ? configuredKeyPlaceholder : ""
  };
}

function normalizeCompatibleBaseUrl(value, fallback = defaultSecondaryApiBaseUrl) {
  const text = String(value || fallback || "").trim().replace(/\/+$/, "");
  if (!text) return fallback;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return /\/v1$/i.test(withProtocol) ? withProtocol : `${withProtocol}/v1`;
}

function normalizeImageServiceApiProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return provider === "secondary" ? "secondary" : "primary";
}

function normalizeRemoteImageBedConfig(value = {}) {
  return {
    enabled: value.enabled === true,
    owner: String(value.owner || value.namespace || "").trim(),
    repo: String(value.repo || value.project || "").trim(),
    branch: String(value.branch || value.revision || "main").trim() || "main",
    basePath: String(value.basePath || value.pathPrefix || "images").trim().replace(/^\/+|\/+$/g, "") || "images",
    apiBaseUrl: String(value.apiBaseUrl || remoteImageStorageApiBase || "").trim().replace(/\/+$/, ""),
    rawBaseUrl: String(value.rawBaseUrl || remoteImageStorageRawBase || "").trim().replace(/\/+$/, ""),
    token: normalizeApiKey(value.token || ""),
    namespace: String(value.namespace || value.owner || "").trim(),
    project: String(value.project || value.repo || "").trim(),
    revision: String(value.revision || value.branch || "main").trim() || "main",
    pathPrefix: String(value.pathPrefix || value.basePath || "images").trim().replace(/^\/+|\/+$/g, "") || "images"
  };
}

function normalizeObjectStorageConfig(value = {}) {
  return {
    enabled: value.enabled === true,
    endpoint: String(value.endpoint || "").trim().replace(/\/+$/, ""),
    region: String(value.region || "auto").trim() || "auto",
    bucket: String(value.bucket || "").trim(),
    accessKeyId: String(value.accessKeyId || value.accessKey || "").trim(),
    secretAccessKey: normalizeApiKey(value.secretAccessKey || value.secretKey || ""),
    pathPrefix: String(value.pathPrefix || "images").trim().replace(/^\/+|\/+$/g, "") || "images",
    expiresSeconds: Math.max(60, Math.min(604800, Math.round(Number(value.expiresSeconds || value.expires || 3600)))),
    forcePathStyle: value.forcePathStyle !== false
  };
}

function normalizeCloudSyncConfig(value = {}) {
  const parsedTimeout = Number(value.timeoutSeconds);
  return {
    enabled: value.enabled === true,
    includeProjects: value.includeProjects !== false,
    includeConversations: value.includeConversations !== false,
    includeAssets: value.includeAssets !== false,
    pathPrefix: String(value.pathPrefix || "backups")
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\\+/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .slice(0, 8)
      .join("/") || "backups",
    timeoutSeconds: Number.isFinite(parsedTimeout) ? Math.max(5, Math.min(120, Math.round(parsedTimeout))) : 45
  };
}

function mergeIntranetConfig(value = {}) {
  const defaults = defaultIntranetConfig();
  const ai = value.ai || {};
  const config = {
    ...defaults,
    ...value,
    appliance: { ...defaults.appliance, ...(value.appliance || {}) },
    ai: {
      ...defaults.ai,
      primaryImageApiKey: ai.primaryImageApiKey ?? defaults.ai.primaryImageApiKey,
      secondaryImageApiKey: ai.secondaryImageApiKey ?? defaults.ai.secondaryImageApiKey,
      secondaryImageBaseUrl: normalizeCompatibleBaseUrl(ai.secondaryImageBaseUrl ?? defaults.ai.secondaryImageBaseUrl),
      imageApiProvider: normalizeImageServiceApiProvider(ai.imageApiProvider ?? defaults.ai.imageApiProvider),
      textServiceBApiKey: ai.textServiceBApiKey ?? defaults.ai.textServiceBApiKey,
      textServiceCApiKey: ai.textServiceCApiKey ?? defaults.ai.textServiceCApiKey,
      groupKeys: normalizeAiGroupKeyConfigs(ai.groupKeys ?? defaults.ai.groupKeys),
      primaryTextModel: ai.primaryTextModel ?? defaults.ai.primaryTextModel,
      imageTextModel: ai.imageTextModel ?? ai.imageService1Model ?? defaults.ai.imageTextModel,
      imageEditModel: ai.imageEditModel ?? ai.imageService2Model ?? defaults.ai.imageEditModel,
      standardReasoningModel: ai.standardReasoningModel ?? defaults.ai.standardReasoningModel,
      deepReasoningModel: ai.deepReasoningModel ?? defaults.ai.deepReasoningModel,
      remoteImageBed: normalizeRemoteImageBedConfig(ai.remoteImageBed ?? defaults.ai.remoteImageBed),
      objectStorage: normalizeObjectStorageConfig(ai.objectStorage ?? defaults.ai.objectStorage),
      cloudSync: normalizeCloudSyncConfig(ai.cloudSync ?? defaults.ai.cloudSync),
      textServiceBModel: ai.textServiceBModel ?? defaults.ai.textServiceBModel,
      textServiceCModel: ai.textServiceCModel ?? defaults.ai.textServiceCModel,
      aiImageSkills: ai.aiImageSkills ?? defaults.ai.aiImageSkills,
      tokenPricing: normalizeTokenPricingConfig(ai.tokenPricing ?? defaults.ai.tokenPricing),
      imagePricing: normalizeImagePricingConfig(ai.imagePricing ?? defaults.ai.imagePricing)
    },
    updates: { ...defaults.updates, ...(value.updates || {}) },
    maintenance: normalizeMaintenanceConfig(value.maintenance ?? defaults.maintenance),
    privacy: normalizePrivacyConfig(value.privacy ?? defaults.privacy)
  };
  config.ai.aiImageSkills = normalizeAiImageSkills(config.ai.aiImageSkills);
  return config;
}

async function loadIntranetConfig() {
  await mkdir(intranetDir, { recursive: true });
  if (!existsSync(intranetConfigPath)) {
    const config = defaultIntranetConfig();
    await saveIntranetConfig(config);
    return config;
  }
  try {
    const raw = await readFile(intranetConfigPath, "utf8");
    const stored = raw ? JSON.parse(raw) : {};
    const decrypted = configSecretStore.decryptConfig(stored);
    if (configSecretStore.configNeedsEncryption(stored)) {
      await writeFile(intranetConfigPath, JSON.stringify(configSecretStore.encryptConfig(decrypted), null, 2), {
        encoding: "utf8",
        mode: 0o600
      });
      await chmod(intranetConfigPath, 0o600).catch(() => {});
    }
    return mergeIntranetConfig(decrypted);
  } catch {
    return defaultIntranetConfig();
  }
}

async function saveIntranetConfig(config) {
  await mkdir(intranetDir, { recursive: true });
  const merged = mergeIntranetConfig(config);
  await writeFile(intranetConfigPath, JSON.stringify(configSecretStore.encryptConfig(merged), null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(intranetConfigPath, 0o600).catch(() => {});
  return merged;
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req, maxBytes = maxAdminJsonBodyBytes) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createHttpError(413, `请求体超过 ${Math.ceil(maxBytes / 1024 / 1024)}MB 限制。`);
  }
  const chunks = [];
  let received = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    received += chunk.length;
    if (tooLarge || received > maxBytes) {
      chunks.length = 0;
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    throw createHttpError(413, `请求体超过 ${Math.ceil(maxBytes / 1024 / 1024)}MB 限制。`);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error("请求 JSON 格式错误。");
    error.statusCode = 400;
    throw error;
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}


function decodeUpdatePackageUpload(body) {
  const originalName = basename(String(body.fileName || body.name || "update-package.zip")).replace(/[\\/:*?"<>|]/g, "_");
  const safeName = /\.zip$/i.test(originalName) ? originalName : `${originalName || "update-package"}.zip`;
  const raw = String(body.dataUrl || body.base64 || "").trim();
  if (!raw) throw createHttpError(400, "请先选择更新包 ZIP。");
  const match = raw.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  const base64 = (match ? match[2] : raw).replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 22) throw createHttpError(400, "更新包为空。");
  if (buffer.length > maxUpdateUploadBytes) {
    throw createHttpError(413, `更新包超过 ${maxUpdateUploadMb}MB，暂不支持网页上传。`);
  }
  const signature = buffer.subarray(0, 4).toString("binary");
  if (!signature.startsWith("PK")) throw createHttpError(400, "文件不是有效 ZIP 更新包。");
  return { fileName: safeName, buffer };
}

function safeFileBase(value) {
  return String(value || "template")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 72) || "template";
}


function sendRouteError(res, error) {
  if (res.writableEnded) return;
  if (res.headersSent) {
    res.end();
    return;
  }
  const statusCode = error.statusCode || 500;
  sendJson(res, statusCode, {
    error: statusCode >= 500 ? "服务器处理失败" : error.message,
    detail: statusCode >= 500 ? (error.message || String(error)) : undefined
  });
}

function route(handler, req, res) {
  try {
    Promise.resolve(handler(req, res)).catch((error) => sendRouteError(res, error));
  } catch (error) {
    sendRouteError(res, error);
  }
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index > -1) cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function secureCookieAttribute(req) {
  if (String(process.env.ECOM_COOKIE_SECURE || "") === "1") return "; Secure";
  if (req?.socket?.encrypted) return "; Secure";
  if (String(process.env.ECOM_TRUST_PROXY || "") === "1" && String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https") {
    return "; Secure";
  }
  return "";
}

function sessionCookie(token, req = null) {
  return `${adminCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secureCookieAttribute(req)}`;
}

function clearSessionCookie(req = null) {
  return `${adminCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieAttribute(req)}`;
}

function trustedWriteOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())) return true;
  if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === String(req.headers.host || "");
  } catch {
    return false;
  }
}

function loopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || "").replace(/^::ffff:/i, "");
  return address === "::1" || /^127(?:\.\d{1,3}){3}$/.test(address);
}

function pathInside(root, target) {
  const rel = relative(normalize(root), normalize(target));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"));
}

function publicAccountUser(user) {
  const usage = user.usage || {};
  const quota = user.quota || {};
  const result = {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || "user",
    status: user.status || "active",
    department: normalizeGroupText(user.department),
    groupId: safeGroupId(user.groupId || "", ""),
    groupName: normalizeGroupText(user.groupName || user.groupId || ""),
    aiKeys: publicAiUserKeys(user.aiKeys || {}),
    plan: user.plan || "基础版",
    expiresAt: user.expiresAt || null,
    quota: {
      aiImages: Number(quota.aiImages ?? 0),
      copywriting: Number(quota.copywriting ?? 0)
    },
    usage: {
      aiImages: Number(usage.aiImages || 0),
      copywriting: Number(usage.copywriting || 0)
    },
    deviceLimit: Number(user.deviceLimit || 20),
    deviceCount: Array.isArray(user.devices) ? user.devices.length : 0
  };
  if ((result.role || "user") === "admin") {
    const adminRole = adminRoleForUser(user);
    Object.assign(result, {
      adminRole,
      adminRoleLabel: adminRoleLabel(adminRole),
      permissions: adminPermissionsForUser(user),
      visibleModules: adminVisibleModulesForUser(user)
    });
  }
  return result;
}

function adminUserView(user, tokenPricing = null) {
  return {
    ...publicAccountUser(user),
    tokenUsage: publicTokenUsage(user.tokenUsage, tokenPricing),
    devices: Array.isArray(user.devices)
      ? user.devices.map((device) => ({
          id: device.id,
          name: device.name || "Unknown device",
          createdAt: device.createdAt || "",
          lastSeenAt: device.lastSeenAt || ""
        }))
      : [],
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
}

function accountLicenseError(user) {
  if ((user.status || "active") !== "active") return "账户已停用。";
  if (user.expiresAt && new Date(user.expiresAt).getTime() < Date.now()) return "账户授权已到期。";
  return "";
}

async function currentAdmin(req) {
  const token = parseCookies(req.headers.cookie)[adminCookieName];
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  const db = await loadAccountDb();
  if (accountSetupRequired(db)) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user || (user.role || "user") !== "admin") return null;
  return { token, session, user, db };
}

async function requireAdmin(req, res) {
  const admin = await currentAdmin(req);
  if (!admin) {
    sendJson(res, 401, { error: "请先登录管理员账户。" });
    return null;
  }
  const denial = accountLicenseError(admin.user);
  if (denial) {
    sendJson(res, 403, { error: denial });
    return null;
  }
  return admin;
}

async function requireAdminPermission(req, res, permissions) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (!adminHasAnyPermission(admin, permissions)) {
    sendJson(res, 403, { error: "当前管理员没有权限执行这个操作。" });
    return null;
  }
  return admin;
}

async function handleAdminSetup(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = await readJson(req);
  const db = await loadAccountDb();
  if (!accountSetupRequired(db)) {
    sendJson(res, 409, { error: "中控台管理员已经初始化。" });
    return;
  }
  if (!loopbackRequest(req)) {
    sendJson(res, 403, { error: "首次管理员初始化只能在运行服务的本机完成。", setupRequired: true });
    return;
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const validationError = validateAdminSetup(username, password, confirmPassword);
  if (validationError) {
    sendJson(res, 400, { error: validationError, setupRequired: true });
    return;
  }

  const now = nowIso();
  let user = db.users.find(isLegacyDefaultAdmin)
    || db.users.find((item) => (item.role || "user") === "admin")
    || null;
  const usernameKey = username.toLowerCase();
  const duplicate = db.users.find((item) => item !== user && String(item.username || "").toLowerCase() === usernameKey);
  if (duplicate) {
    sendJson(res, 400, { error: "账户名已存在。", setupRequired: true });
    return;
  }
  if (!user) {
    user = {
      id: randomUUID(),
      usage: defaultUsage(),
      devices: [],
      createdAt: now
    };
    db.users.push(user);
  }

  Object.assign(user, {
    username,
    displayName: String(body.displayName || "").trim() || "系统管理员",
    role: "admin",
    adminRole: "super_admin",
    status: "active",
    plan: "中控管理员",
    expiresAt: null,
    quota: defaultAdminQuota(),
    usage: { ...defaultUsage(), ...(user.usage || {}) },
    devices: Array.isArray(user.devices) ? user.devices : [],
    deviceLimit: Number(user.deviceLimit || 5),
    updatedAt: now,
    ...createPasswordRecord(password)
  });

  await saveAccountDb(db);
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + sessionTtlMs
  });
  sendJson(res, 200, { user: publicAccountUser(user), setupRequired: false }, { "set-cookie": sessionCookie(token, req) });
}

async function handleAdminLogin(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = await readJson(req);
  const username = String(body.username || "").trim();
  if (!username || !String(body.password || "")) {
    sendJson(res, 400, { error: "请输入管理员账户和密码。" });
    return;
  }
  const rateLimitMessage = loginRateLimitError(req, username, "admin");
  if (rateLimitMessage) {
    sendJson(res, 429, { error: rateLimitMessage });
    return;
  }
  const db = await loadAccountDb();
  if (accountSetupRequired(db)) {
    sendJson(res, 409, { error: "请先初始化中控台管理员账号密码。", setupRequired: true });
    return;
  }
  const user = db.users.find((item) => item.username === username);
  if (!user || (user.role || "user") !== "admin") {
    recordLoginFailure(req, username, "admin");
    sendJson(res, 401, { error: "管理员账户或密码错误。" });
    return;
  }
  const password = String(body.password || "");
  if (!verifyUserPassword(password, user)) {
    recordLoginFailure(req, username, "admin");
    sendJson(res, 401, { error: "管理员账户或密码错误。" });
    return;
  }
  clearLoginFailures(req, username, "admin");
  const denial = accountLicenseError(user);
  if (denial) {
    sendJson(res, 403, { error: denial });
    return;
  }
  const upgradedPasswordHash = upgradePasswordHashIfNeeded(user, password);
  if (upgradedPasswordHash) {
    user.updatedAt = nowIso();
    await saveAccountDb(db);
  }
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + sessionTtlMs
  });
  sendJson(res, 200, { user: publicAccountUser(user), passwordUpgraded: upgradedPasswordHash }, { "set-cookie": sessionCookie(token, req) });
}

async function handleAdminLogout(req, res) {
  const token = parseCookies(req.headers.cookie)[adminCookieName];
  if (token) adminSessions.delete(token);
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie(req) });
}

async function handleAdminMe(req, res) {
  const db = await loadAccountDb();
  if (accountSetupRequired(db)) {
    sendJson(res, 409, { error: "请先初始化中控台管理员账号密码。", setupRequired: true });
    return;
  }
  const admin = await currentAdmin(req);
  if (!admin) {
    sendJson(res, 401, { error: "请先登录管理员账户。" });
    return;
  }
  const denial = accountLicenseError(admin.user);
  if (denial) {
    sendJson(res, 403, { error: denial });
    return;
  }
  sendJson(res, 200, { user: publicAccountUser(admin.user), adminRoles: publicAdminRoles() });
}

function networkUrls() {
  const urls = [];
  const add = (label, url, type) => {
    if (!urls.some((item) => item.url === url)) urls.push({ label, url, type });
  };
  add("员工端本机", `http://localhost:${employeePort}`, "employee");
  add("管理端本机", `http://localhost:${adminPort}`, "admin");
  for (const item of Object.values(networkInterfaces()).flat()) {
    if (!item || item.internal || item.family !== "IPv4") continue;
    add(`员工端 ${item.address}`, `http://${item.address}:${employeePort}`, "employee");
    add(`管理端 ${item.address}`, `http://${item.address}:${adminPort}`, "admin");
  }
  return urls;
}

async function countFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((item) => item.isDirectory() || item.isFile()).length;
  } catch {
    return 0;
  }
}

async function readAiGalleryIndex() {
  try {
    const raw = await readFile(aiGalleryIndexPath, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      version: 1,
      totalGenerated: Number(parsed.totalGenerated || items.length || 0),
      updatedAt: parsed.updatedAt || "",
      items
    };
  } catch {
    return { version: 1, totalGenerated: 0, updatedAt: "", items: [] };
  }
}

function publicAiGalleryItem(item) {
  return {
    id: String(item.id || ""),
    jobId: String(item.jobId || ""),
    provider: String(item.provider || ""),
    model: String(item.model || ""),
    prompt: String(item.prompt || ""),
    account: item.account || null,
    fileName: String(item.fileName || ""),
    mime: String(item.mime || "image/png"),
    bytes: Number(item.bytes || 0),
    referenceCount: Number(item.referenceCount || 0),
    createdAt: String(item.createdAt || ""),
    imageUrl: `/api/admin/ai-gallery/image/${encodeURIComponent(String(item.id || ""))}`
  };
}

function galleryAccountKey(item) {
  const account = item?.account || {};
  return String(account.id || account.username || account.displayName || "").trim();
}

function galleryAccountLabel(item) {
  const account = item?.account || {};
  return String(account.displayName || account.username || account.id || "未知账户").trim();
}

function aiGalleryAccounts(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = galleryAccountKey(item);
    if (!key) return;
    const current = map.get(key) || {
      id: String(item.account?.id || ""),
      username: String(item.account?.username || ""),
      displayName: galleryAccountLabel(item),
      count: 0
    };
    current.count += 1;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
}

function filterAiGalleryItems(items, accountFilter = "") {
  const target = String(accountFilter || "").trim();
  if (!target) return items;
  return items.filter((item) => {
    const account = item.account || {};
    return [account.id, account.username, account.displayName].some((value) => String(value || "").trim() === target);
  });
}

async function aiGallerySummary(limit = 24, options = {}) {
  const index = await readAiGalleryIndex();
  const allItems = index.items.map(publicAiGalleryItem).filter((item) => item.id);
  const items = filterAiGalleryItems(allItems, options.account);
  const offset = Math.max(0, Number(options.offset || 0));
  const requestedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 24;
  const safeLimit = requestedLimit <= 0 ? 0 : Math.min(Math.max(requestedLimit, 1), 200);
  return {
    totalGenerated: Number(index.totalGenerated || items.length || 0),
    stored: allItems.length,
    total: items.length,
    offset,
    limit: safeLimit,
    hasMore: safeLimit > 0 && offset + safeLimit < items.length,
    account: String(options.account || ""),
    accounts: aiGalleryAccounts(allItems),
    updatedAt: index.updatedAt || "",
    recent: items.slice(offset, offset + safeLimit)
  };
}

function safeAiGalleryImagePath(item) {
  const relativePath = String(item?.relativePath || "").replace(/^[/\\]+/, "");
  if (!relativePath) return null;
  const target = normalize(join(aiGalleryDir, relativePath));
  const root = normalize(aiGalleryDir);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) return null;
  return target;
}

function safeArchiveName(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function psSingle(value) {
  return String(value || "").replace(/'/g, "''");
}

async function getAutostartStatus() {
  const [employee, admin, guardian] = await Promise.all([
    queryScheduledTask(employeeTaskName),
    queryScheduledTask(adminTaskName),
    queryScheduledTask(guardianTaskName)
  ]);
  return { employee, admin, guardian };
}

function check(status, name, detail = "", extra = {}) {
  return { status, name, detail, ...extra };
}

async function fetchJsonWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === "AbortError" ? "请求超时" : (error.message || String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

async function getTextTail(path, lines = 12) {
  try {
    const text = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
    return text.split(/\r?\n/).filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function backupStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

async function readAutoBackupState() {
  try {
    const raw = await readFile(autoBackupStatePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      lastBackupDate: "",
      lastBackupAt: "",
      lastBackupDir: "",
      lastStatus: "idle",
      lastError: "",
      retentionCount: autoBackupRetentionCount
    };
  }
}

async function writeAutoBackupState(patch = {}) {
  await mkdir(autoBackupRoot, { recursive: true });
  const current = await readAutoBackupState();
  const next = {
    ...current,
    ...patch,
    retentionCount: autoBackupRetentionCount,
    updatedAt: nowIso()
  };
  await writeFile(autoBackupStatePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function copyIfExists(source, target) {
  if (!source || !existsSync(source)) return false;
  await copyFile(source, target);
  return true;
}

async function cleanupAutoBackups() {
  await mkdir(autoBackupRoot, { recursive: true });
  const entries = (await readdir(autoBackupRoot, { withFileTypes: true }))
    .filter((item) => item.isDirectory() && /^backup-\d{8}-\d{6}$/.test(item.name))
    .map((item) => item.name)
    .sort()
    .reverse();
  const stale = entries.slice(autoBackupRetentionCount);
  await Promise.all(stale.map((name) => rm(join(autoBackupRoot, name), { recursive: true, force: true }).catch(() => {})));
}

async function runAutoBackup(options = {}) {
  const today = localDateKey();
  const state = await readAutoBackupState();
  if (!options.force && state.lastBackupDate === today && state.lastStatus === "ok") return state;

  const startedAt = nowIso();
  const backupDir = join(autoBackupRoot, `backup-${backupStamp()}`);
  await mkdir(backupDir, { recursive: true });
  try {
    await accountStore.backupAccountDatabase(accountStorePaths(), join(backupDir, "accounts.sqlite"));
    const copied = {
      config: await copyIfExists(intranetConfigPath, join(backupDir, "config.json")),
      secretKey: await copyIfExists(secretKeyPath, join(backupDir, "secret-key.bin")),
      aiGalleryIndex: await copyIfExists(aiGalleryIndexPath, join(backupDir, "ai-gallery-index.json")),
      updateStatus: await copyIfExists(updateStatusPath, join(backupDir, "update-status.json"))
    };
    const manifest = {
      version: 1,
      reason: options.reason || "scheduled",
      startedAt,
      finishedAt: nowIso(),
      backupDir,
      copied
    };
    await writeFile(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    await cleanupAutoBackups();
    return await writeAutoBackupState({
      lastBackupDate: today,
      lastBackupAt: manifest.finishedAt,
      lastBackupDir: backupDir,
      lastStatus: "ok",
      lastError: "",
      lastCopied: copied
    });
  } catch (error) {
    return await writeAutoBackupState({
      lastBackupDate: today,
      lastBackupAt: nowIso(),
      lastBackupDir: backupDir,
      lastStatus: "failed",
      lastError: error.message || String(error)
    });
  }
}

function startAutoBackupScheduler() {
  runAutoBackup({ reason: "startup" }).catch((error) => {
    console.warn("自动备份失败：", error.message || error);
  });
  setInterval(() => {
    runAutoBackup({ reason: "scheduled" }).catch((error) => {
      console.warn("自动备份失败：", error.message || error);
    });
  }, autoBackupIntervalMs).unref?.();
}

async function readUpdateStatus() {
  let status = {
    status: "idle",
    message: "暂无更新任务",
    packageUrl: "",
    startedAt: "",
    finishedAt: ""
  };
  try {
    const raw = await readFile(updateStatusPath, "utf8");
    status = { ...status, ...JSON.parse(raw) };
  } catch {
  }
  return {
    ...status,
    logTail: await getTextTail(updateLogPath, 80)
  };
}

async function readMaintenanceToken() {
  try {
    return (await readFile(maintenanceTokenPath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function callMaintenanceAgent(path, options = {}) {
  const token = await readMaintenanceToken();
  if (!token) {
    return { ok: false, status: 0, error: "维护 Agent token 未安装" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 4000);
  try {
    const response = await fetch(`${maintenanceAgentUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
        "x-maintenance-token": token
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, data, error: response.ok ? "" : (data?.error || `HTTP ${response.status}`) };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === "AbortError" ? "请求超时" : (error.message || String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMaintenanceAgentReady() {
  let health = await callMaintenanceAgent("/api/maintenance/health", { timeoutMs: 2500 });
  if (health.ok) return health;

  const starter = join(appRoot, "scripts", "start-maintenance-agent.ps1");
  if (!existsSync(starter)) {
    return { ok: false, error: "维护 Agent 未在线，且缺少 scripts\\start-maintenance-agent.ps1。" };
  }

  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", starter], {
    cwd: appRoot,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();

  for (let i = 0; i < 12; i += 1) {
    await wait(750);
    health = await callMaintenanceAgent("/api/maintenance/health", { timeoutMs: 2500 });
    if (health.ok) return health;
  }
  return { ok: false, error: health.error || "维护 Agent 启动超时，请在内网/更新模块重试。" };
}

async function testRuntimeWritable() {
  try {
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeDir, "admin-healthcheck.txt"), nowIso(), "utf8");
    return check("ok", "运行目录可写", runtimeDir);
  } catch (error) {
    return check("fail", "运行目录不可写", error.message || String(error));
  }
}




async function buildDiagnostics() {
  const employeeHealth = await fetchJsonWithTimeout(`http://127.0.0.1:${employeePort}/api/health`);
  const checks = [
    employeeHealth.ok
      ? check("ok", "员工端", `在线，AI 并发 ${employeeHealth.data?.aiImage?.running || 0}/${employeeHealth.data?.aiImage?.maxConcurrency || 0}`)
      : check("fail", "员工端", employeeHealth.error || `HTTP ${employeeHealth.status}`),
    check("ok", "管理端", `当前管理端在线，PID ${process.pid}`),
    await testRuntimeWritable()
  ];
  const maintenanceHealth = await callMaintenanceAgent("/api/maintenance/health", { timeoutMs: 2500 });
  checks.push(maintenanceHealth.ok
    ? check(maintenanceHealth.data?.isAdmin ? "ok" : "warn", "维护 Agent", maintenanceHealth.data?.isAdmin ? "在线，管理员权限运行。" : "在线，但不是管理员权限。")
    : check("warn", "维护 Agent", `未在线：${maintenanceHealth.error || `HTTP ${maintenanceHealth.status}`}`));
  const failed = checks.filter((item) => item.status === "fail").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  return {
    status: failed ? "fail" : (warnings ? "warn" : "ok"),
    failed,
    warnings,
    checks,
    checkedAt: nowIso(),
    employeeHealth: employeeHealth.ok ? employeeHealth.data : null,
    watchdogTail: await getTextTail(join(runtimeDir, "logs", "watchdog.log"), 10)
  };
}

async function buildOperationsSnapshot(usageDashboard, diagnostics) {
  const health = diagnostics?.employeeHealth || null;
  const todayToken = usageDashboard?.tokenUsage?.summary?.today || null;
  return {
    generatedAt: nowIso(),
    employeeOnline: Boolean(health?.ok),
    uptimeSeconds: Number(health?.uptimeSeconds || 0),
    aiImage: health?.aiImage || null,
    localPython: health?.localPython?.queue || null,
    todayTokenUsage: todayToken,
    todayCostCny: Number(todayToken?.estimatedCostCny || 0),
    todayCostUsd: Number(todayToken?.estimatedCostUsd || 0),
    backup: await readAutoBackupState()
  };
}

function adminScopedConfig(config, admin) {
  const scoped = {};
  if (adminHasPermission(admin, "config.system.read")) {
    scoped.appliance = config.appliance;
    scoped.updates = config.updates;
    scoped.maintenance = {
      ...normalizeMaintenanceConfig(config.maintenance),
      active: isMaintenanceActive(config.maintenance)
    };
    scoped.privacy = normalizePrivacyConfig(config.privacy);
  }
  if (adminHasPermission(admin, "config.ai.read")) {
    const canManageBilling = isSuperAdminUser(admin.user);
    scoped.ai = canManageBilling
      ? config.ai
      : {
          ...config.ai,
          tokenPricing: null,
          imagePricing: {
            balanceCny: normalizeImagePricingConfig(config.ai?.imagePricing || {}).balanceCny
          }
        };
  }
  return scoped;
}

function publicGroupKeyCatalog(config) {
  return normalizeAiGroupKeyConfigs(config?.ai?.groupKeys || [])
    .filter((row) => row.enabled !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department,
      enabled: row.enabled !== false,
      primaryImageApiKey: row.primaryImageApiKey ? "__configured__" : "",
      secondaryImageApiKey: row.secondaryImageApiKey ? "__configured__" : "",
      textServiceBApiKey: row.textServiceBApiKey ? "__configured__" : "",
      textServiceCApiKey: row.textServiceCApiKey ? "__configured__" : ""
    }));
}

function adminScopedServer(config, admin) {
  const canReadSystem = adminHasPermission(admin, "config.system.read");
  return {
    name: config.appliance.name,
    companyName: config.appliance.companyName,
    version: config.updates.currentVersion,
    hostName: canReadSystem ? hostname() : "",
    employeePort,
    adminPort,
    appRoot: canReadSystem ? appRoot : "",
    startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    urls: canReadSystem ? networkUrls() : []
  };
}

function adminScopedModules(admin) {
  const modules = [];
  if (adminHasPermission(admin, "accounts.read")) modules.push({ id: "accounts", name: "账户授权", status: "ready" });
  if (adminHasPermission(admin, "usage.read")) modules.push({ id: "usage", name: "用量统计", status: "ready" });
  if (adminHasPermission(admin, "feedback.read")) modules.push({ id: "feedback", name: "吐槽汇总", status: "ready" });
  if (adminHasPermission(admin, "update.read")) modules.push({ id: "updates", name: "版本配置", status: "ready" });
  if (adminHasPermission(admin, "autostart.write")) modules.push({ id: "autostart", name: "开机自启动", status: "ready" });
  if (adminHasPermission(admin, "diagnostics.read")) modules.push({ id: "maintenance", name: "维护 Agent", status: "ready" });
  return modules;
}

async function handleAdminOverview(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const config = await loadIntranetConfig();
  const costPricing = normalizeAiCostPricingConfig(config?.ai || {});
  const users = admin.db.users.map((user) => adminUserView(user, costPricing));
  const usageDashboard = buildUsageDashboard(users, await loadUsageDailyDb(), config);
  const totalUsage = admin.db.users.reduce((sum, user) => ({
    aiImages: sum.aiImages + Number(user.usage?.aiImages || 0),
    copywriting: sum.copywriting + Number(user.usage?.copywriting || 0)
  }), { aiImages: 0, copywriting: 0 });
  const aiGallery = await aiGallerySummary(0);
  const diagnostics = await buildDiagnostics();
  const operations = await buildOperationsSnapshot(usageDashboard, diagnostics);
  const permissions = adminPermissionsForUser(admin.user);
  const visibleModules = adminVisibleModulesForUser(admin.user);
  const canManageAdmins = adminHasPermission(admin, "admin.roles.manage");
  const canReadAccounts = adminHasPermission(admin, "accounts.read");
  const canReadUsage = adminHasPermission(admin, "usage.read");
  const canReadFeedback = adminHasPermission(admin, "feedback.read");
  const canReadGallery = adminHasPermission(admin, "gallery.read");
  const canReadDiagnostics = adminHasPermission(admin, "diagnostics.read");
  const canReadUpdate = adminHasPermission(admin, "update.read");
  const canReadSystem = adminHasPermission(admin, "config.system.read");
  const canUninstall = adminHasPermission(admin, "uninstall.write") && isSuperAdminUser(admin.user);
  const canReadAccountSummary = canReadAccounts || canReadUsage;
  const uninstallResult = canUninstall
    ? await callMaintenanceAgent("/api/maintenance/uninstall/status", { timeoutMs: 2500 })
    : null;
  const accountUsers = canReadAccounts
    ? users.filter((user) => canManageAdmins || (user.role || "user") !== "admin")
    : [];
  sendJson(res, 200, {
    currentAdmin: publicAccountUser(admin.user),
    adminRoles: publicAdminRoles(),
    permissions,
    visibleModules,
    server: adminScopedServer(config, admin),
    config: adminScopedConfig(config, admin),
    update: canReadUpdate ? await readUpdateStatus() : null,
    uninstall: canUninstall
      ? (uninstallResult?.data?.uninstall || {
          status: "unavailable",
          message: uninstallResult?.error || "维护 Agent 未在线"
        })
      : null,
    maintenance: canReadDiagnostics ? await callMaintenanceAgent("/api/maintenance/health", { timeoutMs: 2500 }) : null,
    operations: canReadDiagnostics ? operations : null,
    autostart: canReadSystem ? await getAutostartStatus() : null,
    accounts: {
      total: canReadAccountSummary ? users.length : 0,
      active: canReadAccountSummary ? users.filter((user) => user.status === "active").length : 0,
      sessions: canReadAccountSummary ? adminSessions.size : 0,
      totalUsage: canReadAccounts || canReadUsage ? totalUsage : emptyUsageTotals(),
      usageDashboard: canReadUsage ? usageDashboard : null,
      groupKeys: canReadAccounts ? publicGroupKeyCatalog(config) : [],
      users: accountUsers
    },
    feedback: canReadFeedback ? await buildAiFeedbackReport(7) : null,
    jobs: {
      aiImages: { count: canReadGallery ? aiGallery.totalGenerated : 0, stored: canReadGallery ? aiGallery.stored : 0 }
    },
    aiGallery: canReadGallery ? aiGallery : { totalGenerated: 0, stored: 0, items: [], accounts: [], offset: 0, limit: 0, total: 0 },
    diagnostics: canReadDiagnostics ? diagnostics : null,
    modules: adminScopedModules(admin)
  });
}

async function handleAdminAiGalleryImage(req, res) {
  const admin = await requireAdminPermission(req, res, "gallery.read");
  if (!admin) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const id = decodeURIComponent(url.pathname.replace(/^\/api\/admin\/ai-gallery\/image\//, ""));
  if (!/^[a-f0-9]{8,40}$/i.test(id)) {
    sendJson(res, 400, { error: "图片 ID 无效。" });
    return;
  }
  const index = await readAiGalleryIndex();
  const item = index.items.find((entry) => String(entry.id || "") === id);
  const filePath = safeAiGalleryImagePath(item);
  if (!item || !filePath || !existsSync(filePath)) {
    sendJson(res, 404, { error: "图片不存在。" });
    return;
  }
  res.writeHead(200, {
    "content-type": item.mime || mimeTypes[extname(filePath).toLowerCase()] || "image/png",
    "cache-control": "private, max-age=60"
  });
  createReadStream(filePath).pipe(res);
}

async function handleAdminFeedbackAsset(req, res) {
  const admin = await requireAdminPermission(req, res, "feedback.read");
  if (!admin) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const feedbackId = String(parts[4] || "").replace(/[^a-z0-9-]/gi, "");
  const fileName = basename(String(parts[5] || ""));
  if (!feedbackId || !/^[^\\/:*?"<>|]+\.(png|jpe?g|webp)$/i.test(fileName)) {
    sendJson(res, 400, { error: "失败图片路径无效。" });
    return;
  }
  const root = normalize(join(aiFeedbackAssetsDir, feedbackId));
  const filePath = normalize(join(root, fileName));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "失败参考图不存在。" });
    return;
  }
  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath).toLowerCase()] || "image/png",
    "cache-control": "private, max-age=60"
  });
  createReadStream(filePath).pipe(res);
}

async function handleAdminAiGalleryList(req, res) {
  const admin = await requireAdminPermission(req, res, "gallery.read");
  if (!admin) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24), 1), 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const account = String(url.searchParams.get("account") || "").trim();
  sendJson(res, 200, await aiGallerySummary(limit, { offset, account }));
}

async function handleAdminAiGalleryDownload(req, res) {
  const admin = await requireAdminPermission(req, res, "gallery.download");
  if (!admin) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const account = String(url.searchParams.get("account") || "").trim();
  const index = await readAiGalleryIndex();
  const selected = filterAiGalleryItems(index.items || [], account)
    .map((item) => ({ item, filePath: safeAiGalleryImagePath(item) }))
    .filter((entry) => entry.filePath && existsSync(entry.filePath))
    .slice(0, 1000);

  if (!selected.length) {
    sendJson(res, 404, { error: "没有可下载的 AI 生图留档。" });
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const scope = account ? safeArchiveName(account, "account") : "all";
  const workDir = join(aiGalleryDownloadsDir, `download-${stamp}-${randomBytes(3).toString("hex")}`);
  const stageDir = join(workDir, "files");
  const zipPath = join(workDir, `ai-gallery-${scope}-${stamp}.zip`);
  await mkdir(stageDir, { recursive: true });

  for (let i = 0; i < selected.length; i += 1) {
    const { item, filePath } = selected[i];
    const ext = extname(filePath) || extname(item.fileName || "") || ".png";
    const accountName = safeArchiveName(galleryAccountLabel(item), "unknown");
    const created = safeArchiveName(String(item.createdAt || "").slice(0, 10), "date");
    const provider = safeArchiveName(item.provider || "ai", "ai");
    const targetName = `${String(i + 1).padStart(4, "0")}-${created}-${accountName}-${provider}${ext}`;
    await copyFile(filePath, join(stageDir, targetName));
  }

  const command = `Compress-Archive -Path '${psSingle(join(stageDir, "*"))}' -DestinationPath '${psSingle(zipPath)}' -Force`;
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
  if (!result.ok || !existsSync(zipPath)) {
    sendJson(res, 500, { error: `打包 AI 生图留档失败：${result.stderr || result.stdout || result.code || ""}` });
    return;
  }

  res.writeHead(200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(basename(zipPath))}`,
    "cache-control": "no-store"
  });
  createReadStream(zipPath).pipe(res);
}

async function handleAdminAiGalleryOpenFolder(req, res) {
  const admin = await requireAdminPermission(req, res, "gallery.read");
  if (!admin) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const target = normalize(aiGalleryDir);
  const runtimeRoot = normalize(runtimeDir);
  if (!target.startsWith(runtimeRoot) || target === runtimeRoot) {
    sendJson(res, 400, { error: "AI 生图留档目录无效。", path: target });
    return;
  }
  if (!existsSync(target)) {
    sendJson(res, 404, { error: "实操机 AI 生图留档目录还不存在。", path: target });
    return;
  }

  try {
    const child = spawn("explorer.exe", [target], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    sendJson(res, 200, {
      ok: true,
      path: target,
      message: "已在实操机上打开 AI 生图留档文件夹。"
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "打开实操机图片文件夹失败。",
      detail: error.message || String(error),
      path: target
    });
  }
}

function sanitizeUserPayload(body, existingUser = null) {
  const username = String(body.username || existingUser?.username || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new Error("账户名需为 3-32 位英文、数字、点、下划线或横线。");
  }
  const role = ["admin", "user"].includes(String(body.role)) ? String(body.role) : (existingUser?.role || "user");
  const adminRole = role === "admin"
    ? normalizeAdminRole(body.adminRole || existingUser?.adminRole, existingUser ? adminRoleForUser(existingUser) : "account_admin")
    : "";
  const status = ["active", "paused"].includes(String(body.status)) ? String(body.status) : (existingUser?.status || "active");
  return {
    username,
    displayName: String(body.displayName || username).trim().slice(0, 40),
    role,
    adminRole,
    status,
    department: normalizeGroupText(body.department ?? existingUser?.department ?? ""),
    groupId: safeGroupId(body.groupId ?? existingUser?.groupId ?? "", ""),
    groupName: normalizeGroupText(body.groupName ?? existingUser?.groupName ?? body.groupId ?? existingUser?.groupId ?? ""),
    aiKeys: normalizeAiUserKeys(body.aiKeys, existingUser?.aiKeys || {}),
    plan: String(body.plan || "基础版").trim().slice(0, 40),
    expiresAt: String(body.expiresAt || "").trim() || null,
    deviceLimit: Math.max(1, Math.min(99, Number(body.deviceLimit || existingUser?.deviceLimit || 20))),
    quota: {
      aiImages: Number(body.quota?.aiImages ?? existingUser?.quota?.aiImages ?? 0),
      copywriting: Number(body.quota?.copywriting ?? existingUser?.quota?.copywriting ?? 0)
    }
  };
}

async function handleUpsertUser(req, res) {
  const admin = await requireAdminPermission(req, res, "accounts.write");
  if (!admin) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJson(req);
    const db = admin.db;
    const id = String(body.id || "");
    let user = id ? db.users.find((item) => item.id === id) : null;
    const canManageAdmins = adminHasPermission(admin, "admin.roles.manage");
    const targetIsAdmin = (user?.role || "user") === "admin" || String(body.role || "") === "admin";
    if (targetIsAdmin && !canManageAdmins) {
      throw new Error("只有超级管理员可以创建或修改管理员账户。");
    }
    const payload = sanitizeUserPayload(body, user);
    const usernameKey = payload.username.toLowerCase();
    const duplicate = db.users.find((item) => String(item.username || "").toLowerCase() === usernameKey && item.id !== id);
    if (duplicate) throw new Error("账户名已存在。");
    const password = String(body.password || "");
    if (!user) {
      if (!password || password.length < 6) throw new Error("新账户密码至少 6 位。");
      const createdAt = nowIso();
      user = {
        id: randomUUID(),
        usage: defaultUsage(),
        devices: [],
        createdAt,
        updatedAt: createdAt,
        ...createPasswordRecord(password)
      };
      db.users.push(user);
    }
    Object.assign(user, payload, { updatedAt: nowIso() });
    if (password) Object.assign(user, createPasswordRecord(password));
    user.usage = { ...defaultUsage(), ...(user.usage || {}) };
    if (!Array.isArray(user.devices)) user.devices = [];
    if (!hasActiveSuperAdmin(db)) {
      throw new Error("至少需要保留一个启用状态的超级管理员。");
    }
    await saveAccountDb(db);
    sendJson(res, 200, { user: adminUserView(user) });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "保存账户失败" });
  }
}

async function handleResetUserUsage(req, res) {
  const admin = await requireAdminPermission(req, res, "accounts.resetUsage");
  if (!admin) return;
  const body = await readJson(req);
  const user = admin.db.users.find((item) => item.id === body.id);
  if (!user) {
    sendJson(res, 404, { error: "账户不存在。" });
    return;
  }
  if ((user.role || "user") === "admin" && !adminHasPermission(admin, "admin.roles.manage")) {
    sendJson(res, 403, { error: "只有超级管理员可以清空管理员账户用量。" });
    return;
  }
  user.usage = defaultUsage();
  user.tokenUsage = emptyTokenUsageTotals();
  user.updatedAt = nowIso();
  await saveAccountDb(admin.db);
  sendJson(res, 200, { user: adminUserView(user) });
}

function safeRuntimeUserId(value) {
  return String(value || "").trim()
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function removeUserOwnedLocalData(userId, requestId) {
  const id = String(userId || "").trim();
  const safeId = safeRuntimeUserId(id);
  if (!id || !safeId) throw new Error("账户 ID 无效，无法清理关联数据。");
  const removed = {
    conversations: false,
    projects: false,
    assets: false,
    rembg: false,
    feedback: 0,
    gallery: 0
  };
  const remoteImages = [];
  for (const [key, target] of [
    ["conversations", join(aiConversationsDir, safeId)],
    ["projects", join(canvasProjectsDir, safeId)],
    ["assets", join(canvasAssetsDir, safeId)],
    ["rembg", join(canvasRembgDir, safeId)]
  ]) {
    if (!pathInside(runtimeDir, target)) throw new Error(`拒绝清理不安全路径：${target}`);
    if (existsSync(target)) {
      await rm(target, { recursive: true, force: true });
      removed[key] = true;
    }
  }

  const feedback = await readAiFeedbackStore();
  const removedFeedback = feedback.items.filter((item) => String(item?.userId || "") === id);
  if (removedFeedback.length) {
    await Promise.all(removedFeedback.map(async (item) => {
      const itemId = String(item?.id || "").replace(/[^a-z0-9-]/gi, "");
      if (!itemId) return;
      const target = join(aiFeedbackAssetsDir, itemId);
      if (pathInside(aiFeedbackAssetsDir, target)) await rm(target, { recursive: true, force: true }).catch(() => {});
    }));
    feedback.items = feedback.items.filter((item) => String(item?.userId || "") !== id);
    await mkdir(aiFeedbackDir, { recursive: true });
    await writeFile(aiFeedbackPath, JSON.stringify({
      version: 1,
      updatedAt: nowIso(),
      items: feedback.items
    }, null, 2), "utf8");
    removed.feedback = removedFeedback.length;
  }

  const gallery = await readAiGalleryIndex();
  const removedGallery = gallery.items.filter((item) => String(item?.account?.id || "") === id);
  if (removedGallery.length) {
    removedGallery.forEach((item) => {
      const remote = item?.remoteImageBed;
      if (remote?.owner && remote?.repo && remote?.path) {
        remoteImages.push({
          owner: String(remote.owner),
          repo: String(remote.repo),
          branch: String(remote.branch || ""),
          path: String(remote.path),
          sha: String(remote.sha || "")
        });
      }
    });
    await updateDataDeletionRequest(dataDeletionQueueDir, requestId, {
      remoteImages: remoteImages.slice(0, 1000)
    });
    await Promise.all(removedGallery.map(async (item) => {
      const target = safeAiGalleryImagePath(item);
      if (target) await rm(target, { force: true }).catch(() => {});
    }));
    gallery.items = gallery.items.filter((item) => String(item?.account?.id || "") !== id);
    await mkdir(aiGalleryDir, { recursive: true });
    await writeFile(aiGalleryIndexPath, JSON.stringify({
      version: 1,
      totalGenerated: Number(gallery.totalGenerated || 0),
      updatedAt: nowIso(),
      items: gallery.items
    }, null, 2), "utf8");
    removed.gallery = removedGallery.length;
  }

  await accountStore.deleteUserRecords(accountStorePaths(), id);
  return { ...removed, remoteImages: remoteImages.slice(0, 1000) };
}

async function removeDeletionPendingAccount(request) {
  const db = await loadAccountDb();
  const target = db.users.find((item) => item.id === request.userId);
  if (!target) return false;
  const nextUsers = db.users.filter((item) => item.id !== request.userId);
  const nextDb = { ...db, users: nextUsers };
  if (!hasActiveSuperAdmin(nextDb)) {
    throw new Error("删除任务会移除最后一个启用状态的超级管理员，已暂停。");
  }
  await saveAccountDb(nextDb);
  return true;
}

async function runLocalDataDeletionRequest(requestId) {
  let request = await readDataDeletionRequest(dataDeletionQueueDir, requestId);
  try {
    if (request.status === "pending-local-cleanup") {
      const cleanup = await removeUserOwnedLocalData(request.userId, request.requestId);
      request = await updateDataDeletionRequest(dataDeletionQueueDir, request.requestId, {
        status: "pending-account-removal",
        localCleanup: {
          conversations: cleanup.conversations,
          projects: cleanup.projects,
          assets: cleanup.assets,
          rembg: cleanup.rembg,
          feedback: cleanup.feedback,
          gallery: cleanup.gallery
        },
        remoteImages: cleanup.remoteImages,
        localCleanupCompletedAt: nowIso(),
        lastError: ""
      });
    }
    if (request.status === "pending-account-removal") {
      await removeDeletionPendingAccount(request);
      request = await updateDataDeletionRequest(dataDeletionQueueDir, request.requestId, {
        status: "pending-cloud-cleanup",
        accountRemovedAt: nowIso(),
        lastError: ""
      });
    }
    return request;
  } catch (error) {
    await updateDataDeletionRequest(dataDeletionQueueDir, request.requestId, {
      attempts: Math.max(0, Number(request.attempts || 0)) + 1,
      lastError: String(error?.message || error).slice(0, 1000)
    }).catch(() => {});
    throw error;
  }
}

async function processLocalDataDeletionQueue() {
  const requests = await listDataDeletionRequests(dataDeletionQueueDir);
  for (const request of requests.filter((item) => (
    ["pending-local-cleanup", "pending-account-removal"].includes(item.status)
  )).slice(0, 20)) {
    await runLocalDataDeletionRequest(request.requestId).catch((error) => {
      console.warn(`账户删除任务 ${request.requestId} 暂未完成：`, error.message || error);
    });
  }
}

async function handleDeleteUser(req, res) {
  const admin = await requireAdminPermission(req, res, "accounts.delete");
  if (!admin) return;
  const body = await readJson(req);
  if (body.id === admin.user.id) {
    sendJson(res, 400, { error: "不能删除当前登录的管理员。" });
    return;
  }
  const currentDb = await loadAccountDb();
  const target = currentDb.users.find((item) => item.id === body.id);
  const existingRequest = await findPendingDataDeletionRequest(dataDeletionQueueDir, body.id);
  if (!target && existingRequest) {
    const request = await runLocalDataDeletionRequest(existingRequest.requestId).catch(() => existingRequest);
    sendJson(res, 202, {
      ok: true,
      deletionPending: request.status !== "pending-cloud-cleanup",
      accountDeleted: request.status === "pending-cloud-cleanup",
      request
    });
    return;
  }
  if ((target?.role || "user") === "admin" && !adminHasPermission(admin, "admin.roles.manage")) {
    sendJson(res, 403, { error: "只有超级管理员可以删除管理员账户。" });
    return;
  }
  if (!target) {
    sendJson(res, 404, { error: "账户不存在。" });
    return;
  }
  const nextDb = {
    ...currentDb,
    users: currentDb.users.filter((item) => item.id !== body.id)
  };
  if (!hasActiveSuperAdmin(nextDb)) {
    sendJson(res, 400, { error: "至少需要保留一个启用状态的超级管理员。" });
    return;
  }
  const request = existingRequest || await createDataDeletionRequest(dataDeletionQueueDir, {
    userId: target.id,
    username: target.username
  });
  try {
    if (!existingRequest || request.status === "created") {
      target.status = "deletion_pending";
      target.deletionRequestId = request.requestId;
      target.updatedAt = nowIso();
      await saveAccountDb(currentDb);
      await updateDataDeletionRequest(dataDeletionQueueDir, request.requestId, {
        status: "pending-local-cleanup",
        lastError: ""
      });
    }
    const completed = await runLocalDataDeletionRequest(request.requestId);
    sendJson(res, 200, {
      ok: true,
      accountDeleted: completed.status === "pending-cloud-cleanup",
      cloudCleanupPending: completed.status === "pending-cloud-cleanup",
      cleanup: completed.localCleanup,
      requestId: completed.requestId
    });
  } catch (error) {
    const pending = await readDataDeletionRequest(dataDeletionQueueDir, request.requestId).catch(() => request);
    sendJson(res, 202, {
      ok: true,
      message: "账户已停用，数据删除任务已保存，将自动重试。",
      detail: error.message || String(error),
      accountDeleted: false,
      deletionPending: true,
      request: pending
    });
  }
}

async function handleAdminConfig(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method === "GET") {
    if (!adminHasAnyPermission(admin, ["config.ai.read", "config.system.read"])) {
      sendJson(res, 403, { error: "当前管理员没有权限查看配置。" });
      return;
    }
    const config = await loadIntranetConfig();
    sendJson(res, 200, {
      config: adminScopedConfig(config, admin),
      autostart: adminHasPermission(admin, "config.system.read") ? await getAutostartStatus() : null
    });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!adminHasAnyPermission(admin, ["config.ai.write", "config.system.write"])) {
    sendJson(res, 403, { error: "当前管理员没有权限保存配置。" });
    return;
  }
  const body = await readJson(req);
  const current = await loadIntranetConfig();
  const applianceBody = body.appliance || {};
  const aiBody = body.ai || {};
  const updatesBody = body.updates || {};
  const maintenanceBody = body.maintenance || {};
  const privacyBody = body.privacy || {};
  const nextSeed = { ...current };
  const canManageBilling = isSuperAdminUser(admin.user);
  if (adminHasPermission(admin, "config.system.write")) {
    nextSeed.appliance = {
      ...current.appliance,
      name: String(applianceBody.name ?? current.appliance.name).trim() || current.appliance.name,
      companyName: String(applianceBody.companyName ?? current.appliance.companyName ?? "").trim()
    };
    nextSeed.updates = {
      ...current.updates,
      currentVersion: String(updatesBody.currentVersion ?? current.updates.currentVersion ?? "0.1.0-preview.23").trim(),
      latestVersion: String(updatesBody.latestVersion ?? current.updates.latestVersion ?? "").trim(),
      packageUrl: String(updatesBody.packageUrl ?? current.updates.packageUrl ?? "").trim(),
      releaseNote: String(updatesBody.releaseNote ?? current.updates.releaseNote ?? "").trim(),
      forceUpdate: updatesBody.forceUpdate === undefined ? current.updates.forceUpdate : Boolean(updatesBody.forceUpdate)
    };
    nextSeed.maintenance = normalizeMaintenanceConfig({
      ...current.maintenance,
      enabled: maintenanceBody.enabled === undefined ? current.maintenance?.enabled : maintenanceBody.enabled === true,
      title: maintenanceBody.title ?? current.maintenance?.title,
      message: maintenanceBody.message ?? current.maintenance?.message,
      detail: maintenanceBody.detail ?? current.maintenance?.detail,
      endsAt: maintenanceBody.endsAt ?? current.maintenance?.endsAt,
      allowlist: maintenanceBody.allowlist ?? current.maintenance?.allowlist,
      updatedAt: nowIso()
    });
    nextSeed.privacy = normalizePrivacyConfig({
      ...current.privacy,
      operatorContact: privacyBody.operatorContact ?? current.privacy?.operatorContact,
      retention: {
        ...current.privacy?.retention,
        ...(privacyBody.retention || {}),
        updatedAt: nowIso()
      }
    });
  }
  if (adminHasPermission(admin, "config.ai.write")) {
    nextSeed.ai = {
      ...current.ai,
      primaryImageApiKey: String(aiBody.primaryImageApiKey ?? current.ai?.primaryImageApiKey ?? "").trim(),
      secondaryImageApiKey: String(aiBody.secondaryImageApiKey ?? current.ai?.secondaryImageApiKey ?? "").trim(),
      secondaryImageBaseUrl: normalizeCompatibleBaseUrl(aiBody.secondaryImageBaseUrl ?? current.ai?.secondaryImageBaseUrl ?? defaultSecondaryApiBaseUrl),
      imageApiProvider: normalizeImageServiceApiProvider(aiBody.imageApiProvider ?? current.ai?.imageApiProvider ?? "primary"),
      textServiceBApiKey: String(aiBody.textServiceBApiKey ?? current.ai?.textServiceBApiKey ?? "").trim(),
      textServiceCApiKey: String(aiBody.textServiceCApiKey ?? current.ai?.textServiceCApiKey ?? "").trim(),
      groupKeys: normalizeAiGroupKeyConfigs(aiBody.groupKeys ?? current.ai?.groupKeys ?? []),
      primaryTextModel: String(aiBody.primaryTextModel ?? current.ai?.primaryTextModel ?? "").trim(),
      imageTextModel: String(aiBody.imageTextModel ?? aiBody.imageService1Model ?? current.ai?.imageTextModel ?? current.ai?.imageService1Model ?? defaultImageServiceTextModel).trim(),
      imageEditModel: String(aiBody.imageEditModel ?? aiBody.imageService2Model ?? current.ai?.imageEditModel ?? current.ai?.imageService2Model ?? defaultImageServiceEditModel).trim(),
      standardReasoningModel: String(aiBody.standardReasoningModel ?? current.ai?.standardReasoningModel ?? defaultImageServiceStandardPlannerModel).trim(),
      deepReasoningModel: String(aiBody.deepReasoningModel ?? current.ai?.deepReasoningModel ?? defaultImageServicePlannerModel).trim(),
      remoteImageBed: normalizeRemoteImageBedConfig(aiBody.remoteImageBed ?? current.ai?.remoteImageBed ?? {}),
      objectStorage: normalizeObjectStorageConfig(aiBody.objectStorage ?? current.ai?.objectStorage ?? {}),
      cloudSync: normalizeCloudSyncConfig(aiBody.cloudSync ?? current.ai?.cloudSync ?? {}),
      textServiceBModel: String(aiBody.textServiceBModel ?? current.ai?.textServiceBModel ?? "").trim(),
      textServiceCModel: String(aiBody.textServiceCModel ?? current.ai?.textServiceCModel ?? "").trim(),
      aiImageSkills: normalizeAiImageSkills(Array.isArray(aiBody.aiImageSkills) ? aiBody.aiImageSkills : current.ai?.aiImageSkills),
      tokenPricing: canManageBilling
        ? normalizeTokenPricingConfig(aiBody.tokenPricing ?? current.ai?.tokenPricing ?? defaultTokenPricingConfig())
        : normalizeTokenPricingConfig(current.ai?.tokenPricing ?? defaultTokenPricingConfig()),
      imagePricing: canManageBilling
        ? normalizeImagePricingConfig(aiBody.imagePricing ?? current.ai?.imagePricing ?? defaultImagePricingConfig())
        : normalizeImagePricingConfig(current.ai?.imagePricing ?? defaultImagePricingConfig())
    };
  }
  const next = mergeIntranetConfig(nextSeed);
  await saveIntranetConfig(next);
  sendJson(res, 200, { config: adminScopedConfig(next, admin) });
}

async function writeUpdateStatus(status) {
  await mkdir(intranetDir, { recursive: true });
  const current = await readUpdateStatus();
  await writeFile(updateStatusPath, JSON.stringify({
    ...current,
    ...status,
    updatedAt: nowIso()
  }, null, 2), "utf8");
}

function assertUpdatePackageInput(body) {
  const packageUrl = String(body.packageUrl || "").trim();
  const packagePath = String(body.packagePath || "").trim();
  const packageSha256 = String(body.packageSha256 || "").trim().toLowerCase();
  if (packageUrl.includes("\"") || packagePath.includes("\"")) {
    throw new Error("更新包地址不能包含英文双引号。");
  }
  if (!/^[a-f0-9]{64}$/.test(packageSha256)) {
    throw new Error("必须填写更新包的 64 位 SHA-256，并从可信发布页单独核对。");
  }
  if (packageUrl) {
    let parsed;
    try {
      parsed = new URL(packageUrl);
    } catch {
      throw new Error("更新包地址格式不正确。");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("远程更新包只允许 HTTPS 地址。");
    }
    if (String(process.env.ECOM_ALLOW_REMOTE_UPDATE || "") !== "1") {
      throw new Error("远程 URL 更新默认关闭。请上传本机 ZIP；确需启用时设置 ECOM_ALLOW_REMOTE_UPDATE=1。");
    }
    return { mode: "url", value: packageUrl, sha256: packageSha256 };
  }
  if (packagePath) {
    if (!/\.zip$/i.test(packagePath)) throw new Error("本机更新包必须是 ZIP 文件。");
    return { mode: "path", value: packagePath, sha256: packageSha256 };
  }
  throw new Error("请填写更新包地址。");
}

async function createUpdateLauncher(input) {
  await mkdir(updatesDir, { recursive: true });
  await mkdir(join(runtimeDir, "logs"), { recursive: true });
  const updateScript = join(appRoot, "scripts", "update-app.ps1");
  const launcherPath = join(updatesDir, `run-update-${Date.now()}.bat`);
  const logPath = join(runtimeDir, "logs", "update-launcher.log");
  const flag = input.mode === "url" ? "-PackageUrl" : "-PackagePath";
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    `cd /d "${appRoot}"`,
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${updateScript}" ${flag} "${input.value}" >> "${logPath}" 2>&1`
  ];
  await writeFile(launcherPath, lines.join("\r\n"), "utf8");
  return launcherPath;
}

async function handleAdminUpdate(req, res) {
  const admin = await requireAdminPermission(req, res, req.method === "GET" ? "update.read" : "update.write");
  if (!admin) return;
  if (req.method === "GET") {
    sendJson(res, 200, { update: await readUpdateStatus() });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const input = assertUpdatePackageInput(body);
    const agentHealth = await ensureMaintenanceAgentReady();
    if (!agentHealth.ok) {
      sendJson(res, 502, { error: agentHealth.error || "维护 Agent 未在线，无法执行在线更新。" });
      return;
    }

    const agentResult = await callMaintenanceAgent("/api/maintenance/update", {
      method: "POST",
      body: input.mode === "url"
        ? { packageUrl: input.value, packageSha256: input.sha256 }
        : { packagePath: input.value, packageSha256: input.sha256 },
      timeoutMs: 8000
    });
    if (agentResult.ok) {
      sendJson(res, 202, {
        ok: true,
        via: "maintenance-agent",
        message: "维护 Agent 已接收更新任务。管理端和员工端会短暂断开，完成后自动恢复。",
        update: agentResult.data?.update || await readUpdateStatus()
      });
      return;
    }

    sendJson(res, 502, {
      error: agentResult.error || "维护 Agent 拒绝更新任务。",
      update: await readUpdateStatus()
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "启动更新失败" });
  }
}

async function handleAdminUninstall(req, res) {
  const admin = await requireAdminPermission(req, res, "uninstall.write");
  if (!admin) return;
  if (!isSuperAdminUser(admin.user)) {
    sendJson(res, 403, { error: "只有超级管理员可以管理彻底卸载。" });
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const action = url.searchParams.get("action") || "status";
  if (req.method === "GET") {
    const result = await callMaintenanceAgent("/api/maintenance/uninstall/status", { timeoutMs: 5000 });
    sendJson(res, result.ok ? 200 : 502, result.ok
      ? { ok: true, uninstall: result.data?.uninstall || null }
      : { error: result.error || "维护 Agent 未在线。" });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (action === "cancel") {
    const result = await callMaintenanceAgent("/api/maintenance/uninstall/cancel", {
      method: "POST",
      body: {},
      timeoutMs: 5000
    });
    sendJson(res, result.ok ? 200 : 502, result.ok
      ? { ok: true, uninstall: result.data?.uninstall || null }
      : { error: result.error || "取消卸载申请失败。" });
    return;
  }
  if (action !== "request") {
    sendJson(res, 400, { error: "未知卸载操作。" });
    return;
  }

  const body = await readJson(req);
  const password = String(body.password || "");
  const phrase = String(body.phrase || "").trim();
  const rateLimitMessage = loginRateLimitError(req, admin.user.username, "uninstall");
  if (rateLimitMessage) {
    sendJson(res, 429, { error: rateLimitMessage });
    return;
  }
  if (!verifyUserPassword(password, admin.user)) {
    recordLoginFailure(req, admin.user.username, "uninstall");
    sendJson(res, 403, { error: "管理员密码错误。" });
    return;
  }
  clearLoginFailures(req, admin.user.username, "uninstall");
  if (phrase !== "彻底卸载电商 AI 画布") {
    sendJson(res, 400, { error: "确认文字不正确。" });
    return;
  }

  const employeeHealth = await fetchJsonWithTimeout(`http://127.0.0.1:${employeePort}/api/health`, 3500);
  if (!employeeHealth.ok) {
    sendJson(res, 409, { error: "无法确认员工端任务状态，已拒绝发起卸载。" });
    return;
  }
  const health = employeeHealth.data || {};
  const activeAi = Math.max(
    Number(health.aiImage?.running || 0),
    Number(health.aiImage?.active || 0)
  );
  const queuedAi = Math.max(
    Number(health.aiImage?.queued || 0),
    Number(health.aiImage?.queuedUnits || 0)
  );
  const activeLocal = health.localPython?.queue?.running ? 1 : 0;
  const queuedLocal = Number(health.localPython?.queue?.queued || 0);
  if (activeAi || queuedAi || activeLocal || queuedLocal) {
    sendJson(res, 409, {
      error: `当前仍有任务：AI 运行 ${activeAi}、排队 ${queuedAi}，本地处理运行 ${activeLocal}、排队 ${queuedLocal}。任务清空后才能发起卸载。`
    });
    return;
  }

  const agentHealth = await ensureMaintenanceAgentReady();
  if (!agentHealth.ok) {
    sendJson(res, 502, { error: agentHealth.error || "维护 Agent 未在线。" });
    return;
  }
  const result = await callMaintenanceAgent("/api/maintenance/uninstall/request", {
    method: "POST",
    body: { requestedBy: admin.user.username },
    timeoutMs: 8000
  });
  sendJson(res, result.ok ? 202 : (result.status || 502), result.ok
    ? {
        ok: true,
        uninstall: result.data?.uninstall || null,
        localConfirmation: result.data?.localConfirmation || "请到实操机本地确认。"
      }
    : { error: result.error || "维护 Agent 拒绝了卸载申请。" });
}

async function handleAdminUpdateUpload(req, res) {
  const admin = await requireAdminPermission(req, res, "update.write");
  if (!admin) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req, maxUpdateUploadJsonBytes);
    const uploaded = decodeUpdatePackageUpload(body);
    await mkdir(updateUploadDir, { recursive: true });
    const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
    const fileName = `uploaded-${id}-${safeFileBase(uploaded.fileName).replace(/\.zip$/i, "")}.zip`;
    const packagePath = join(updateUploadDir, fileName);
    await writeFile(packagePath, uploaded.buffer);
    const packageSha256 = createHash("sha256").update(uploaded.buffer).digest("hex");
    await writeUpdateStatus({
      status: "idle",
      message: `更新包已上传：${uploaded.fileName}。确认无误后可一键更新。`,
      packageUrl: "",
      packagePath,
      packageSha256,
      requestedBy: admin.user.username,
      uploadedAt: nowIso(),
      startedAt: "",
      finishedAt: ""
    });
    sendJson(res, 200, {
      ok: true,
      fileName,
      originalName: uploaded.fileName,
      packagePath,
      packageSha256,
      size: uploaded.buffer.length,
      message: "更新包已上传，可直接使用上传包更新。"
    });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || "上传更新包失败" });
  }
}

async function handleAdminMaintenance(req, res) {
  const admin = await requireAdminPermission(req, res, req.method === "GET" ? "diagnostics.read" : "maintenance.write");
  if (!admin) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const action = url.searchParams.get("action") || "status";
  if (req.method === "GET") {
    const result = await callMaintenanceAgent("/api/maintenance/status", { timeoutMs: 5000 });
    sendJson(res, result.ok ? 200 : 502, result);
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const actionMap = {
    "install-fonts": "/api/maintenance/install-fonts",
    "repair-font-cache": "/api/maintenance/repair-font-cache",
    "repair-system-fonts": "/api/maintenance/repair-system-fonts",
    "install-python": "/api/maintenance/install-python",
    "restart-services": "/api/maintenance/restart-services",
    "probe-download": "/api/maintenance/probe-download",
    "clear-update": "/api/maintenance/clear-update"
  };
  const target = actionMap[action];
  if (!target) {
    sendJson(res, 400, { error: "未知维护动作。" });
    return;
  }
  const body = ["probe-download", "install-python"].includes(action) ? await readJson(req) : {};
  const timeoutMs = action === "install-python" ? 600000 : 180000;
  const result = await callMaintenanceAgent(target, { method: "POST", body, timeoutMs });
  sendJson(res, result.ok ? 200 : 502, result);
}

async function handleAdminExportCurrentApp(req, res) {
  const admin = await requireAdminPermission(req, res, "export.write");
  if (!admin) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname.endsWith("/download")) {
    const fileName = basename(String(url.searchParams.get("file") || ""));
    if (!fileName || !/\.zip$/i.test(fileName)) {
      sendJson(res, 400, { error: "导出文件名不正确。" });
      return;
    }
    const filePath = join(runtimeDir, "exports", fileName);
    if (!existsSync(filePath)) {
      sendJson(res, 404, { error: "导出文件不存在或已被清理。" });
      return;
    }
    const fileStat = await stat(filePath);
    res.writeHead(200, {
      "content-type": "application/zip",
      "content-length": String(fileStat.size || 0),
      "content-disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(res);
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const result = await callMaintenanceAgent("/api/maintenance/export-current-app", {
    method: "POST",
    body: {},
    timeoutMs: 300000
  });
  if (!result.ok || !result.data?.fileName) {
    sendJson(res, 502, { error: result.error || "维护 Agent 导出现网版本失败。", detail: result.data });
    return;
  }
  const fileName = basename(result.data.fileName);
  sendJson(res, 200, {
    ok: true,
    fileName,
    bytes: result.data.bytes || 0,
    signature: result.data.signature || "",
    downloadUrl: `/api/admin/export-current-app/download?file=${encodeURIComponent(fileName)}`
  });
}

function nodeExecutable() {
  const packaged = join(appRoot, "runtime", "node", "node.exe");
  return existsSync(packaged) ? packaged : process.execPath;
}

function taskCommand(scriptName) {
  if (scriptName.toLowerCase().endsWith(".bat")) {
    return `"${join(appRoot, scriptName)}"`;
  }
  return `"${nodeExecutable()}" "${join(appRoot, scriptName)}"`;
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolve({ ok: false, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

async function queryScheduledTask(name) {
  if (process.platform !== "win32") return { enabled: false, available: false, detail: "仅 Windows 支持" };
  const result = await runCommand("schtasks.exe", ["/Query", "/TN", name, "/FO", "LIST"]);
  return { enabled: result.ok, available: true, detail: result.ok ? "已启用" : "未启用" };
}

async function setScheduledTask(name, scriptName, enabled) {
  if (process.platform !== "win32") return { ok: false, detail: "开机自启动目前只支持 Windows。" };
  if (!enabled) {
    const result = await runCommand("schtasks.exe", ["/Delete", "/TN", name, "/F"]);
    return { ok: result.ok || /cannot find|not found|找不到|不存在/i.test(result.stderr + result.stdout), detail: result.stderr || result.stdout };
  }
  const result = await runCommand("schtasks.exe", [
    "/Create",
    "/SC",
    "ONLOGON",
    "/TN",
    name,
    "/TR",
    taskCommand(scriptName),
    "/F"
  ]);
  return { ok: result.ok, detail: result.stderr || result.stdout };
}

async function handleAdminAutostart(req, res) {
  const admin = await requireAdminPermission(req, res, "autostart.write");
  if (!admin) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = await readJson(req);
  const target = String(body.target || "both");
  const enabled = Boolean(body.enabled);
  const agentResult = await callMaintenanceAgent("/api/maintenance/autostart", {
    method: "POST",
    body: { target, enabled },
    timeoutMs: 60000
  });
  if (agentResult.ok) {
    sendJson(res, 200, agentResult.data);
    return;
  }
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
  sendJson(res, 502, {
    error: `维护 Agent 设置自启动失败：${agentResult.error || `HTTP ${agentResult.status}`}`,
    directAttempt: { results, autostart: await getAutostartStatus() }
  });
}

function staticFile(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const cleanPath = pathname.replace(/^\/+/, "");
  const target = normalize(join(adminPublicDir, cleanPath));
  if (!pathInside(adminPublicDir, target)) return null;
  return target;
}

async function serveStatic(req, res) {
  const target = staticFile(req);
  if (!target) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(target);
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": mimeTypes[extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (!trustedWriteOrigin(req)) {
    sendJson(res, 403, { error: "Cross-site request blocked." });
    return;
  }
  if ((req.url || "") === "/api/admin/setup") return route(handleAdminSetup, req, res);
  if ((req.url || "") === "/api/admin/login") return route(handleAdminLogin, req, res);
  if ((req.url || "") === "/api/admin/logout") return route(handleAdminLogout, req, res);
  if ((req.url || "") === "/api/admin/me") return route(handleAdminMe, req, res);
  if ((req.url || "") === "/api/admin/overview") return route(handleAdminOverview, req, res);
  if ((req.url || "").startsWith("/api/admin/feedback/asset/")) return route(handleAdminFeedbackAsset, req, res);
  if ((req.url || "") === "/api/admin/ai-gallery/open-folder") return route(handleAdminAiGalleryOpenFolder, req, res);
  if ((req.url || "").startsWith("/api/admin/ai-gallery/download")) return route(handleAdminAiGalleryDownload, req, res);
  if ((req.url || "").startsWith("/api/admin/ai-gallery/list")) return route(handleAdminAiGalleryList, req, res);
  if ((req.url || "").startsWith("/api/admin/ai-gallery/image/")) return route(handleAdminAiGalleryImage, req, res);
  if ((req.url || "") === "/api/admin/config") return route(handleAdminConfig, req, res);
  if ((req.url || "") === "/api/admin/update/upload") return route(handleAdminUpdateUpload, req, res);
  if ((req.url || "") === "/api/admin/update") return route(handleAdminUpdate, req, res);
  if ((req.url || "").startsWith("/api/admin/uninstall")) return route(handleAdminUninstall, req, res);
  if ((req.url || "").startsWith("/api/admin/maintenance")) return route(handleAdminMaintenance, req, res);
  if ((req.url || "").startsWith("/api/admin/export-current-app")) return route(handleAdminExportCurrentApp, req, res);
  if ((req.url || "") === "/api/admin/users/upsert") return route(handleUpsertUser, req, res);
  if ((req.url || "") === "/api/admin/users/reset-usage") return route(handleResetUserUsage, req, res);
  if ((req.url || "") === "/api/admin/users/delete") return route(handleDeleteUser, req, res);
  if ((req.url || "") === "/api/admin/autostart") return route(handleAdminAutostart, req, res);
  return route(serveStatic, req, res);
});

startAutoBackupScheduler();
await processLocalDataDeletionQueue().catch((error) => {
  console.warn("账户本地数据删除队列处理失败：", error.message || error);
});
const localDataDeletionTimer = setInterval(() => {
  void processLocalDataDeletionQueue().catch((error) => {
    console.warn("账户本地数据删除队列处理失败：", error.message || error);
  });
}, 60 * 60 * 1000);
localDataDeletionTimer.unref?.();

server.listen(adminPort, adminHost, () => {
  console.log(`管理员中控: http://${adminHost}:${adminPort}`);
});
