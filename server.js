import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as accountStore from "./account-store.js";
import {
  dataOlderThanDays,
  defaultPrivacyConfig,
  normalizePrivacyConfig,
  updateDataDeletionRequest,
  writePrivateJsonAtomic
} from "./data-governance.js";
import { createSecretStore } from "./secret-store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appRoot = process.env.ECOMMERCE_CANVAS_APP_ROOT || __dirname;
const publicDir = join(appRoot, "public");
const aiGalleryDir = join(appRoot, "runtime", "ai-gallery");
const aiGalleryImageDir = join(aiGalleryDir, "images");
const aiGalleryIndexPath = join(aiGalleryDir, "index.json");
const aiConversationsDir = join(appRoot, "runtime", "ai-conversations");
const aiFeedbackDir = join(appRoot, "runtime", "ai-feedback");
const aiFeedbackPath = join(aiFeedbackDir, "feedback.json");
const aiFeedbackAssetsDir = join(aiFeedbackDir, "assets");
const aiImageJobsDir = join(appRoot, "runtime", "ai-image-jobs");
const aiImageJobStatusCachePath = join(aiImageJobsDir, "status-cache.json");
const pythonPackagesDir = join(appRoot, "runtime", "python-packages");
const rembgModelsDir = join(appRoot, "runtime", "rembg-models");
const isnetGeneralUseModelPath = join(rembgModelsDir, "isnet-general-use.onnx");
const canvasBetaDir = join(appRoot, "runtime", "canvas-beta");
const canvasProjectsDir = join(canvasBetaDir, "projects");
const canvasAssetsDir = join(canvasBetaDir, "assets");
const dataDeletionQueueDir = join(appRoot, "runtime", "data-deletion");
const dataRetentionDir = join(appRoot, "runtime", "data-retention");
const dataRetentionStatePath = join(dataRetentionDir, "state.json");
const accountsDir = join(appRoot, "runtime", "accounts");
const accountsPath = join(accountsDir, "accounts.json");
const accountSessionsPath = join(accountsDir, "sessions.json");
const usageDailyPath = join(accountsDir, "usage-daily.json");
const intranetDir = join(appRoot, "runtime", "intranet");
const intranetConfigPath = join(intranetDir, "config.json");
const secretKeyPath = join(intranetDir, "secret-key.bin");
const configSecretStore = createSecretStore(secretKeyPath);
const imageBedCleanupDir = join(appRoot, "runtime", "image-bed-cleanup");
const remoteImageBedCleanupQueuePath = join(imageBedCleanupDir, "remote-queue.json");
const primaryImageApiBase = String(process.env.PRIMARY_IMAGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const remoteImageStorageApiBase = String(process.env.REMOTE_IMAGE_STORAGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const remoteImageStorageRawBase = String(process.env.REMOTE_IMAGE_STORAGE_RAW_BASE_URL || "").trim().replace(/\/+$/, "");
const primaryImageImageModel = String(process.env.PRIMARY_IMAGE_MODEL || "").trim();
const primaryImageImageEndpoint = `${primaryImageApiBase}/v1beta/models/${primaryImageImageModel}:generateContent`;
const primaryImagesApiBase = `${primaryImageApiBase}/v1`;
const primaryResponsesEndpoint = `${primaryImagesApiBase}/responses`;
const primaryImageGenerationEndpoint = `${primaryImagesApiBase}/images/generations`;
const primaryImageEditEndpoint = `${primaryImagesApiBase}/images/edits`;
const defaultImageServiceEditModel = String(process.env.PRIMARY_IMAGE_EDIT_MODEL || "").trim();
const defaultImageServiceTextModel = defaultImageServiceEditModel;
const defaultImageServiceStandardPlannerModel = String(process.env.PRIMARY_REASONING_MODEL || "").trim();
const defaultImageServicePlannerModel = String(process.env.PRIMARY_DEEP_REASONING_MODEL || "").trim();
const defaultSecondaryApiBaseUrl = String(process.env.SECONDARY_IMAGE_API_BASE_URL || "").trim();
const defaultSecondaryApiImageModel = String(process.env.SECONDARY_IMAGE_MODEL || "").trim();
const maxStandardAiPromptCharacters = 4000;
const maxImageServiceReferences = 10;
const standardThinkingVisionReferences = 6;
const deepThinkingVisionReferences = 10;
const maxThinkingVisionImageBytes = 8 * 1024 * 1024;
const maxImageUploadMb = boundedEnvInteger("MAX_IMAGE_UPLOAD_MB", 64, 1, 128);
const configuredJsonBodyMb = boundedEnvInteger("MAX_JSON_BODY_MB", 128, 2, 512);
const maxImageUploadBytes = maxImageUploadMb * 1024 * 1024;
const maxJsonBodyBytes = Math.max(
  configuredJsonBodyMb * 1024 * 1024,
  Math.ceil(maxImageUploadBytes * 4 / 3) + 2 * 1024 * 1024
);
const port = Number(process.env.PORT || 5173);
const host = String(process.env.ECOM_EMPLOYEE_HOST || "127.0.0.1").trim() || "127.0.0.1";
const localPythonQueue = [];
let localPythonRunning = false;
const accountSessions = new Map();
const legacyDefaultAdminPassword = "";
const passwordHashPrefix = "scrypt:v1:";

function normalizeAiPromptText(value) {
  return String(value || "").trim().slice(0, maxStandardAiPromptCharacters);
}

function normalizeClientModelOverride(value) {
  const model = String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return model.slice(0, 180);
}
const loginAttemptWindowMs = Math.max(60_000, Number(process.env.LOGIN_ATTEMPT_WINDOW_MS || 10 * 60 * 1000));
const loginAttemptBlockMs = Math.max(60_000, Number(process.env.LOGIN_ATTEMPT_BLOCK_MS || 10 * 60 * 1000));
const loginAttemptMaxFailures = Math.max(3, Number(process.env.LOGIN_ATTEMPT_MAX_FAILURES || 8));
const loginAttemptBuckets = new Map();
const aiImageJobState = new Map();
const aiImageQueue = [];
const aiConversationSaveLocks = new Map();
const cloudSnapshotLocks = new Map();
let aiImageRunning = 0;
let aiFeedbackLock = Promise.resolve();
let aiImageJobStatusCacheTimer = null;
let aiImageJobStatusCacheWrite = Promise.resolve();
const aiImageMaxConcurrency = Math.max(1, Math.min(12, Number(process.env.AI_IMAGE_MAX_CONCURRENCY || 8)));
const aiImageMaxActiveJobs = Math.max(aiImageMaxConcurrency, Math.min(500, Number(process.env.AI_IMAGE_MAX_ACTIVE_JOBS || process.env.AI_IMAGE_MAX_QUEUE || 50)));
const aiImageMaxActiveJobsPerUser = Math.max(1, Math.min(8, Number(process.env.AI_IMAGE_MAX_ACTIVE_JOBS_PER_USER || 8)));
const aiImageDetailPageMaxGroupsPerUser = Math.max(1, Math.min(20, Number(process.env.AI_IMAGE_DETAIL_PAGE_MAX_GROUPS_PER_USER || 4)));
const aiImageDetailPageMaxUnitsPerGroup = Math.max(1, Math.min(20, Number(process.env.AI_IMAGE_DETAIL_PAGE_MAX_UNITS_PER_GROUP || 8)));
const aiImageDetailPageMaxUnitsPerUser = Math.max(
  aiImageDetailPageMaxUnitsPerGroup,
  Math.min(100, Number(process.env.AI_IMAGE_DETAIL_PAGE_MAX_UNITS_PER_USER || aiImageDetailPageMaxGroupsPerUser * aiImageDetailPageMaxUnitsPerGroup))
);
let aiGalleryLock = Promise.resolve();
let remoteImageBedWriteLock = Promise.resolve();
const remoteImageBedCleanupState = {
  loaded: false,
  queue: [],
  lock: Promise.resolve(),
  timer: null,
  running: false
};
function thinkingVisionReferenceLimit(mode = "standard") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (["deep", "advanced", "deep-reasoning-model", "深度"].includes(normalized)) return deepThinkingVisionReferences;
  return standardThinkingVisionReferences;
}
let accountDbLock = Promise.resolve();
const usageStatKeys = ["aiImages", "copywriting"];
const sessionCookieName = "eps_session";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const rememberedSessionTtlMs = 90 * 24 * 60 * 60 * 1000;
const appDefaultAiRequestTimeoutMs = Math.max(30000, Number(process.env.APP_AI_TIMEOUT_MS || process.env.AI_REQUEST_TIMEOUT_MS || 600000));
const remoteImageBedSuccessCleanupDelayMs = Math.max(60000, Number(process.env.REMOTE_IMAGE_STORAGE_SUCCESS_CLEANUP_DELAY_MS || 10 * 60 * 1000));
const remoteImageBedFailureCleanupDelayMs = Math.max(60000, Number(process.env.REMOTE_IMAGE_STORAGE_FAILURE_CLEANUP_DELAY_MS || 30 * 60 * 1000));
const remoteImageBedCleanupRetryDelayMs = Math.max(60000, Number(process.env.REMOTE_IMAGE_STORAGE_CLEANUP_RETRY_DELAY_MS || 5 * 60 * 1000));
const remoteImageBedCleanupMaxAttempts = Math.max(1, Math.min(24, Number(process.env.REMOTE_IMAGE_STORAGE_CLEANUP_MAX_ATTEMPTS || 8)));
const localPythonPath = join(appRoot, "runtime", "python", "python.exe");
const bundledPythonPath = join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");

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

function resolvePythonExecutable() {
  return process.env.ECOMMERCE_CANVAS_PYTHON
    || (existsSync(localPythonPath) ? localPythonPath : "")
    || (existsSync(bundledPythonPath) ? bundledPythonPath : "")
    || (process.platform === "win32" ? "python.exe" : "python3");
}


const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
const securityHeaders = {
  "content-security-policy": "default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function sendOptions(res) {
  res.writeHead(204, {
    ...securityHeaders,
    "allow": "GET, POST, OPTIONS",
    "cache-control": "no-store"
  });
  res.end();
}

async function readJson(req, maxBytes = maxJsonBodyBytes) {
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
    throw createHttpError(400, "请求 JSON 格式错误。");
  }
}


function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanErrorToken(value) {
  return String(value || "")
    .replace(/^[\s"'：:|]+/, "")
    .replace(/[\s"'。.|]+$/, "")
    .slice(0, 120);
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

function nowIso() {
  return new Date().toISOString();
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
      id: "hot-style-rebuild-agent",
      name: "爆款视觉重构 Agent",
      type: "AI Agent",
      description: "参考成熟图片做主图套组或详情页套组，提取方法但不照搬。",
      prompt: [
        "启用爆款视觉重构 Agent：把用户上传的成熟图片当作商业视觉参考，不要照抄品牌、Logo、原文案、价格、平台水印或版式细节。",
        "先判断每张图用途：哪些是竞品/成熟参考，哪些是用户产品、素材、背景或风格参考；必须按用户图号关系使用。",
        "提取参考图的构图逻辑、卖点层级、色彩节奏、产品展示方式、场景氛围和转化结构，再重新生成属于用户产品的新画面。",
        "如果用户要求主图整套，输出多张方向互补的主图：首图、卖点图、场景图、对比图、活动图等。",
        "如果用户要求详情页，按分屏详情页思路生成：首屏利益点、痛点、卖点、场景、参数、对比、背书、转化收口。",
        "最终画面要像专业电商设计成品，干净、有层级、有商业转化感，不能像简单拼贴或模板套壳。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "main-image-matrix-agent",
      name: "主图设计 Agent",
      type: "AI Agent",
      description: "一次生成一套电商主图，覆盖首图、卖点、场景、对比和活动方向。",
      allowCanvasImageEdit: false,
      prompt: [
        "启用主图矩阵 Agent：本任务不是单张随意生图，而是按电商主图套组思路生成。",
        "根据用户产品和卖点，把结果规划成互补的主图方向：首图负责第一眼点击，卖点图负责解释价值，场景图负责使用代入，对比图负责建立理由，活动图负责促销转化。",
        "每张图都要保持同一产品身份、同一品牌气质和统一视觉系统，但构图与信息重点要有差异。",
        "优先保证产品主体清晰、完整、不变形；卖点表达要短、准、适合平台主图。",
        "如果用户上传多张图，必须先识别产品图、参考风格图、场景图和素材图的角色，再生成。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "detail-page-planner-agent",
      name: "详情页策划 Agent",
      type: "AI Agent",
      description: "先规划详情页结构，再生成多屏详情页图片并合成长图。",
      allowCanvasImageEdit: false,
      prompt: [
        "启用详情页策划 Agent：按电商详情页设计流程工作，默认生成多张分屏详情页，而不是一张随意长图。",
        "先把用户产品和卖点拆成详情页结构：首屏利益点、痛点引入、核心卖点、材质/工艺、使用场景、参数说明、对比证明、信任背书、购买理由。",
        "每张输出图只负责一个清晰模块，保持统一视觉系统、统一色彩、统一字体气质和统一产品身份。",
        "如果用户没有指定屏数，先根据商品信息和卖点自动决定 4-32 屏；最多 32 屏，每 8 屏一组排队生成，不能让用户手动选屏数。",
        "如果用户明确说只做首屏、单屏或某一屏，则只生成对应模块。",
        "文字要短、清晰、可读，不要生成密密麻麻的小字；图表和参数要简洁，避免乱码。",
        "最终应该适合自动纵向合成长图，同时保留每一屏单图方便单独修改。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "scene-seeding-agent",
      name: "场景种草 Agent",
      type: "AI Agent",
      description: "把产品放进模特、生活方式、空间和平台电商场景。",
      prompt: [
        "启用场景种草 Agent：根据产品属性生成模特、空间、生活方式或电商场景图。",
        "必须保持产品主体外观、比例、材质和关键结构稳定，不要把产品改成另一个商品。",
        "场景可以自由发挥，但要服务用户卖点：专业产品强调可信，服饰/护具强调穿戴效果，日用品强调生活代入，电商产品强调点击和购买欲。",
        "画面要自然、有真实光影和商业质感，不要像廉价棚拍拼贴；如有模特，姿势和产品使用关系要合理。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "campaign-poster-agent",
      name: "活动海报 Agent",
      type: "AI Agent",
      description: "生成促销、上新、直播、节日、清仓等活动视觉。",
      prompt: [
        "启用活动海报 Agent：围绕促销、节日、直播、上新、清仓、福利等活动生成商业海报或平台活动图。",
        "优先建立清晰层级：活动主标题、核心利益点、产品展示区、辅助卖点、氛围背景和行动暗示。",
        "风格可以更有冲击力，但不能杂乱；文字数量要可控，促销信息要醒目且不要凭空编造价格或权益。",
        "如果用户提供产品图，产品必须清晰完整，不能被背景或装饰抢走主体。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "content-cover-agent",
      name: "内容平台封面 Agent",
      type: "社媒 Agent",
      description: "生成大字封面、测评封面、种草封面和干货封面。",
      prompt: [
        "启用内容平台封面 Agent：生成适合内容平台的大字封面、测评封面、种草封面、干货封面或避坑封面。",
        "封面要第一眼明确主题，有强标题、有情绪点、有对比感；标题短而大，不要堆小字。",
        "可以根据产品或内容主题生成真实使用场景、局部特写、对比画面或人物情绪，但不能虚假夸大功效。",
        "如果用户上传参考封面，只学习标题层级、信息密度、色彩氛围和构图，不复制原品牌、原文案或水印。"
      ].join("\n"),
      enabled: true
    },
    {
      id: "brand-style-extension-agent",
      name: "品牌风格延展 Agent",
      type: "品牌 Agent",
      description: "从已有品牌图提取视觉气质，继续生成同风格新图。",
      prompt: [
        "启用品牌风格延展 Agent：从用户上传的品牌图中提取色彩、留白、字体气质、版式节奏、图标语言、产品拍摄方式和整体高级感。",
        "不要固定死模板，也不要照搬原图文字；要把品牌气质延展到新的画面需求里。",
        "如果有多张参考图，优先统一为同一套视觉系统，避免每张图风格漂移。",
        "适合品牌海报、主图系列、详情页分屏、活动图和内容封面。"
      ].join("\n"),
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
  const builtIns = defaultAiImageSkills();
  const builtInById = new Map(builtIns.map((item) => [item.id, item]));
  const protectedBuiltInIds = new Set(builtIns.map((item) => item.id).filter((id) => id !== "none"));
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
    .filter((item) => (
      item.id
      && item.name
      && !["generic-brand", "generic-apparel-brand"].includes(item.id)
      && !seen.has(item.id)
      && seen.add(item.id)
    ));
  if (!normalized.some((item) => item.id === "none")) {
    normalized.unshift(defaultAiImageSkills()[0]);
  }
  for (const item of normalized) {
    if (!protectedBuiltInIds.has(item.id)) continue;
    const builtIn = builtInById.get(item.id);
    if (!builtIn) continue;
    const enabled = item.enabled !== false;
    Object.assign(item, { ...builtIn, enabled });
  }
  let insertIndex = normalized.some((item) => item.id === "none") ? 1 : 0;
  for (const builtInSkill of builtIns.filter((item) => protectedBuiltInIds.has(item.id))) {
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

function defaultIntranetConfig() {
  return {
    version: 1,
    appliance: {
      name: "AI 创作画布",
      companyName: "",
      employeePort: port,
      adminPort: Number(process.env.ADMIN_PORT || 5188)
    },
    ai: {
      primaryImageApiKey: "",
      secondaryImageApiKey: "",
      secondaryImageBaseUrl: defaultSecondaryApiBaseUrl,
      imageApiProvider: "primary",
      textServiceBApiKey: "",
      textServiceCApiKey: "",
      groupKeys: [],
      primaryTextModel: primaryImageImageModel,
      imageTextModel: defaultImageServiceTextModel,
      imageEditModel: defaultImageServiceEditModel,
      standardReasoningModel: defaultImageServiceStandardPlannerModel,
      deepReasoningModel: defaultImageServicePlannerModel,
      remoteImageBed: {
        enabled: false,
        archiveEnabled: false,
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
      currentVersion: "0.1.0-preview.21",
      latestVersion: "0.1.0-preview.21",
      packageUrl: "",
      releaseNote: "",
      forceUpdate: false
    },
    maintenance: defaultMaintenanceConfig(),
    privacy: defaultPrivacyConfig()
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
    try {
      const raw = await readFile(intranetConfigPath, "utf8");
      return mergeIntranetConfig(configSecretStore.decryptConfig(recoverIntranetConfigFromBrokenJson(raw)));
    } catch {
      return defaultIntranetConfig();
    }
  }
}

function recoverIntranetConfigFromBrokenJson(raw) {
  const text = String(raw || "");
  const pick = (key) => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
    return match ? match[1] : "";
  };
  const recovered = defaultIntranetConfig();
  recovered.ai.primaryImageApiKey = pick("primaryImageApiKey");
  recovered.ai.secondaryImageApiKey = pick("secondaryImageApiKey");
  recovered.ai.secondaryImageBaseUrl = normalizeCompatibleBaseUrl(pick("secondaryImageBaseUrl") || recovered.ai.secondaryImageBaseUrl);
  recovered.ai.imageApiProvider = normalizeImageServiceApiProvider(pick("imageApiProvider") || recovered.ai.imageApiProvider);
  recovered.ai.textServiceBApiKey = pick("textServiceBApiKey");
  recovered.ai.textServiceCApiKey = pick("textServiceCApiKey");
  recovered.ai.primaryTextModel = pick("primaryTextModel") || recovered.ai.primaryTextModel;
  recovered.ai.imageTextModel = pick("imageTextModel") || recovered.ai.imageTextModel;
  recovered.ai.imageEditModel = pick("imageEditModel") || recovered.ai.imageEditModel;
  recovered.ai.standardReasoningModel = pick("standardReasoningModel") || recovered.ai.standardReasoningModel;
  recovered.ai.deepReasoningModel = pick("deepReasoningModel") || recovered.ai.deepReasoningModel;
  recovered.ai.textServiceBModel = pick("textServiceBModel") || recovered.ai.textServiceBModel;
  recovered.ai.textServiceCModel = pick("textServiceCModel") || recovered.ai.textServiceCModel;
  recovered.ai.tokenPricing = defaultTokenPricingConfig();
  return recovered;
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

function publicClientConfig(config, user = null) {
  const safe = mergeIntranetConfig(config);
  return {
    appliance: safe.appliance,
    ai: publicAiConfig(safe, user),
    updates: safe.updates,
    maintenance: publicMaintenanceConfig(safe.maintenance),
    privacy: {
      operatorContact: safe.privacy.operatorContact,
      failureLogging: {
        enabled: true,
        includesPrompts: true,
        includesReferences: true,
        includesAccountAndModel: true
      },
      retention: safe.privacy.retention
    }
  };
}

function isMaintenanceActive(maintenance) {
  const safe = normalizeMaintenanceConfig(maintenance);
  if (!safe.enabled) return false;
  if (!safe.endsAt) return true;
  const endsAt = new Date(safe.endsAt).getTime();
  return !Number.isFinite(endsAt) || endsAt > Date.now();
}

function publicMaintenanceConfig(maintenance) {
  const safe = normalizeMaintenanceConfig(maintenance);
  return {
    enabled: safe.enabled,
    active: isMaintenanceActive(safe),
    title: safe.title,
    message: safe.message,
    detail: safe.detail,
    endsAt: safe.endsAt,
    allowlistCount: safe.allowlist.length
  };
}

function maintenanceUserKeys(user = {}) {
  return [user.username, user.displayName, user.id]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function isMaintenanceAllowlistedUser(user, maintenance) {
  const safe = normalizeMaintenanceConfig(maintenance);
  const allowlist = new Set(safe.allowlist.map((item) => item.toLowerCase()));
  return maintenanceUserKeys(user).some((key) => allowlist.has(key));
}

function maintenanceBlockForUser(config, user) {
  const maintenance = normalizeMaintenanceConfig(mergeIntranetConfig(config || {}).maintenance);
  if (!isMaintenanceActive(maintenance) || isMaintenanceAllowlistedUser(user, maintenance)) return null;
  const visible = publicMaintenanceConfig(maintenance);
  const endsAt = maintenance.endsAt ? `预计恢复时间：${new Date(maintenance.endsAt).toLocaleString("zh-CN", { hour12: false })}` : "";
  const message = [maintenance.title, maintenance.message, maintenance.detail, endsAt].filter(Boolean).join("\n");
  return { status: 503, message, maintenance: visible };
}


function normalizeCompatibleBaseUrl(value, fallback = defaultSecondaryApiBaseUrl) {
  const text = String(value || fallback || "").trim().replace(/\/+$/, "");
  if (!text) return fallback;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return /\/v1$/i.test(withProtocol) ? withProtocol : `${withProtocol}/v1`;
}

function normalizeSecondaryApiV3BaseUrl(value) {
  const text = String(value || defaultSecondaryApiBaseUrl).trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return withProtocol
    .replace(/\/v1$/i, "")
    .replace(/\/api\/v3$/i, "") + "/api/v3";
}

function normalizeImageServiceApiProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return provider === "secondary" ? "secondary" : "primary";
}

function normalizeRemoteImageBedConfig(value = {}) {
  return {
    enabled: value.enabled === true,
    archiveEnabled: value.archiveEnabled === true,
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

function configuredCompatibleEndpoints(config, providerOverride = "") {
  const safe = mergeIntranetConfig(config || {});
  const ai = safe.ai || {};
  const provider = normalizeImageServiceApiProvider(providerOverride || ai.imageApiProvider || "primary");
  if (provider === "secondary") {
    const base = normalizeCompatibleBaseUrl(ai.secondaryImageBaseUrl || defaultSecondaryApiBaseUrl);
    return {
      provider: "secondary",
      base,
      responses: `${base}/responses`,
      imageGeneration: `${base}/images/generations`,
      imageEdit: `${base}/images/edits`
    };
  }
  return {
    provider: "primary",
    base: primaryImagesApiBase,
    responses: primaryResponsesEndpoint,
    imageGeneration: primaryImageGenerationEndpoint,
    imageEdit: primaryImageEditEndpoint
  };
}

function requestOrigin(req) {
  const host = req.headers.host || `localhost:${port}`;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}

function absoluteUrl(value, origin) {
  const text = String(value || "");
  if (!text || /^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return `${origin}${text}`;
  return `${origin}/${text}`;
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

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    passwordHash: hashPassword(password, salt),
    passwordScheme: "scrypt"
  };
}

function secureCompare(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
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

function loginRateLimitError(req, username, scope = "account") {
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

function recordLoginFailure(req, username, scope = "account") {
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

function clearLoginFailures(req, username, scope = "account") {
  loginAttemptBuckets.delete(loginAttemptKey(req, username, scope));
}

function sessionTokenKey(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

async function loadAccountSessions() {
  try {
    await accountStore.loadAccountSessions(accountStorePaths(), accountSessions);
  } catch (error) {
    console.warn("SQLite 账户会话读取失败：", error.message || error);
    accountSessions.clear();
  }
}

async function saveAccountSessions() {
  await accountStore.saveAccountSessions(accountStorePaths(), accountSessions);
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

async function saveAccountDb(db) {
  await accountStore.saveAccountDb(accountStorePaths(), db);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadUsageDailyDb() {
  return accountStore.loadUsageDailyDb(accountStorePaths());
}

async function saveUsageDailyDb(db) {
  await accountStore.saveUsageDailyDb(accountStorePaths(), db);
}

async function recordDailyUsageDelta(userId, usageKey, amount) {
  const delta = Number(amount || 0);
  if (!delta || !usageStatKeys.includes(usageKey)) return;
  const db = await loadUsageDailyDb();
  const dateKey = localDateKey();
  db.days[dateKey] = db.days[dateKey] || { users: {} };
  db.days[dateKey].users = db.days[dateKey].users || {};
  const userStats = db.days[dateKey].users[userId] || {};
  userStats[usageKey] = Math.max(0, Number(userStats[usageKey] || 0) + delta);
  db.days[dateKey].users[userId] = userStats;
  await saveUsageDailyDb(db);
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

function normalizeTokenUsageNumbers(value = {}) {
  const inputTokens = Math.max(0, Math.round(finiteNumber(value.inputTokens, 0)));
  const cachedInputTokens = Math.max(0, Math.round(finiteNumber(value.cachedInputTokens, 0)));
  const outputTokens = Math.max(0, Math.round(finiteNumber(value.outputTokens, 0)));
  const totalTokens = Math.max(inputTokens + outputTokens, Math.round(finiteNumber(value.totalTokens, 0)));
  return { inputTokens, cachedInputTokens: Math.min(cachedInputTokens, inputTokens), outputTokens, totalTokens };
}

function extractTokenUsage(upstream) {
  const usage = upstream?.usage || upstream?.usage_metadata || upstream?.usageMetadata || {};
  const inputTokens = usage.input_tokens
    ?? usage.prompt_tokens
    ?? usage.promptTokenCount
    ?? usage.prompt_token_count
    ?? usage.inputTokenCount
    ?? usage.input_token_count
    ?? 0;
  const outputTokens = usage.output_tokens
    ?? usage.completion_tokens
    ?? usage.candidatesTokenCount
    ?? usage.candidates_token_count
    ?? usage.outputTokenCount
    ?? usage.output_token_count
    ?? 0;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens
    ?? usage.prompt_tokens_details?.cached_tokens
    ?? usage.cached_tokens
    ?? usage.cachedContentTokenCount
    ?? usage.cached_content_token_count
    ?? 0;
  const totalTokens = usage.total_tokens
    ?? usage.totalTokenCount
    ?? usage.total_token_count
    ?? 0;
  return normalizeTokenUsageNumbers({ inputTokens, cachedInputTokens, outputTokens, totalTokens });
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

function findTokenPrice(config, provider, model) {
  const pricing = normalizeTokenPricingConfig(config?.ai?.tokenPricing || config?.tokenPricing || {});
  const matches = pricing.models
    .slice()
    .sort((a, b) => String(b.model || "").length - String(a.model || "").length)
    .filter((row) => tokenPriceMatches(row, provider, model));
  const match = matches.find((row) => row.provider) || matches[0] || null;
  return match ? { ...match, saleMultiplier: pricing.saleMultiplier } : null;
}

function estimateTokenCost(usage, price, usdToCnyRate) {
  if (!price) return { estimatedCostUsd: 0, estimatedCostCny: 0, priceMatched: false };
  const billableInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const multiplier = Math.max(0, finiteNumber(price.saleMultiplier, 1));
  const rate = Math.max(0, finiteNumber(usdToCnyRate, 0));
  const isCny = String(price.currency || "").toUpperCase() === "CNY"
    || price.inputCnyPer1M > 0
    || price.outputCnyPer1M > 0;
  const rawCost = (
    (billableInputTokens * (isCny ? price.inputCnyPer1M : price.inputUsdPer1M))
    + (usage.cachedInputTokens * (isCny ? price.cachedInputCnyPer1M : price.cachedInputUsdPer1M))
    + (usage.outputTokens * (isCny ? price.outputCnyPer1M : price.outputUsdPer1M))
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

function estimateNativeImageCost(config, options = {}) {
  const tokenPricing = normalizeTokenPricingConfig(config?.ai?.tokenPricing || {});
  const imagePricing = normalizeImagePricingConfig(config?.ai?.imagePricing || {});
  const resolution = normalizeBillableImageResolution(options.resolution || options.size || "1K");
  const count = Math.max(0, Math.round(finiteNumber(options.count, 1)));
  const unit = Math.max(0, finiteNumber(imagePricing.native?.[resolution]?.usdPerImage, 0));
  const multiplier = Math.max(0, finiteNumber(imagePricing.saleMultiplier, tokenPricing.saleMultiplier || 1));
  const estimatedCostUsd = unit * count * multiplier;
  const estimatedCostCny = estimatedCostUsd * Math.max(0, finiteNumber(tokenPricing.usdToCnyRate, 0));
  return {
    resolution,
    count,
    unitUsd: unit,
    estimatedCostUsd: roundCost(estimatedCostUsd),
    estimatedCostCny: roundCost(estimatedCostCny),
    priceMatched: unit > 0
  };
}

function mergeTokenUsageAggregate(target, source) {
  const next = target || emptyTokenUsageTotals();
  const usage = normalizeTokenUsageNumbers(source || {});
  const calls = Math.max(0, Math.round(finiteNumber(source?.calls, 1)));
  const priceMatched = source?.priceMatched !== false;
  next.calls = Number(next.calls || 0) + calls;
  next.pricedCalls = Number(next.pricedCalls || 0) + (priceMatched ? calls : 0);
  next.unpricedCalls = Number(next.unpricedCalls || 0) + (priceMatched ? 0 : calls);
  next.inputTokens = Number(next.inputTokens || 0) + usage.inputTokens;
  next.cachedInputTokens = Number(next.cachedInputTokens || 0) + usage.cachedInputTokens;
  next.outputTokens = Number(next.outputTokens || 0) + usage.outputTokens;
  next.totalTokens = Number(next.totalTokens || 0) + usage.totalTokens;
  next.imageCount = Math.max(0, Math.round(Number(next.imageCount || 0) + Number(source?.imageCount || 0)));
  next.estimatedCostUsd = roundCost(Number(next.estimatedCostUsd || 0) + finiteNumber(source?.estimatedCostUsd, 0));
  next.estimatedCostCny = roundCost(Number(next.estimatedCostCny || 0) + finiteNumber(source?.estimatedCostCny, 0));

  const provider = String(source?.provider || "").trim();
  const model = String(source?.model || "").trim();
  if (model || provider) {
    const key = `${provider || "unknown"}:${model || "unknown"}`;
    next.byModel = next.byModel && typeof next.byModel === "object" ? next.byModel : {};
    const row = next.byModel[key] || { provider, model, calls: 0, pricedCalls: 0, unpricedCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, estimatedCostCny: 0 };
    row.provider = provider;
    row.model = model;
    row.unitType = String(source?.unitType || row.unitType || "").trim();
    row.resolution = String(source?.resolution || row.resolution || "").trim();
    row.imageCount = Math.max(0, Math.round(Number(row.imageCount || 0) + Number(source?.imageCount || 0)));
    row.calls = Number(row.calls || 0) + calls;
    row.pricedCalls = Number(row.pricedCalls || 0) + (priceMatched ? calls : 0);
    row.unpricedCalls = Number(row.unpricedCalls || 0) + (priceMatched ? 0 : calls);
    row.inputTokens = Number(row.inputTokens || 0) + usage.inputTokens;
    row.cachedInputTokens = Number(row.cachedInputTokens || 0) + usage.cachedInputTokens;
    row.outputTokens = Number(row.outputTokens || 0) + usage.outputTokens;
    row.totalTokens = Number(row.totalTokens || 0) + usage.totalTokens;
    row.estimatedCostUsd = roundCost(Number(row.estimatedCostUsd || 0) + finiteNumber(source?.estimatedCostUsd, 0));
    row.estimatedCostCny = roundCost(Number(row.estimatedCostCny || 0) + finiteNumber(source?.estimatedCostCny, 0));
    row.lastUsedAt = source?.createdAt || nowIso();
    row.lastSource = source?.source || row.lastSource || "";
    next.byModel[key] = row;
  }
  return next;
}

async function recordDailyTokenUsage(userId, entry) {
  if (!userId || (!entry?.totalTokens && !entry?.estimatedCostCny && !entry?.estimatedCostUsd)) return;
  const db = await loadUsageDailyDb();
  const dateKey = localDateKey();
  db.days[dateKey] = db.days[dateKey] || { users: {} };
  db.days[dateKey].tokenUsage = db.days[dateKey].tokenUsage || { users: {} };
  db.days[dateKey].tokenUsage.users = db.days[dateKey].tokenUsage.users || {};
  const current = db.days[dateKey].tokenUsage.users[userId] || emptyTokenUsageTotals();
  db.days[dateKey].tokenUsage.users[userId] = mergeTokenUsageAggregate(current, entry);
  const group = normalizeUserBillingGroup(entry);
  const groupKey = group.groupId || safeGroupId(group.groupName || group.department, "");
  if (groupKey) {
    db.days[dateKey].tokenUsage.groups = db.days[dateKey].tokenUsage.groups || {};
    const groupCurrent = db.days[dateKey].tokenUsage.groups[groupKey] || emptyTokenUsageTotals();
    const groupNext = mergeTokenUsageAggregate(groupCurrent, entry);
    groupNext.groupId = groupKey;
    groupNext.groupName = group.groupName || groupKey;
    groupNext.department = group.department || "";
    db.days[dateKey].tokenUsage.groups[groupKey] = groupNext;
  }
  await saveUsageDailyDb(db);
}

async function recordAiTokenUsage(userId, options = {}) {
  if (!userId) return null;
  const usage = extractTokenUsage(options.upstream || options.usage || {});
  if (!usage.totalTokens) return null;
  const config = options.config || await loadIntranetConfig();
  const pricing = normalizeTokenPricingConfig(config?.ai?.tokenPricing || {});
  const price = findTokenPrice(config, options.provider, options.model);
  const cost = estimateTokenCost(usage, price, pricing.usdToCnyRate);
  const entry = {
    ...usage,
    ...cost,
    provider: String(options.provider || "").trim(),
    model: String(options.model || "").trim(),
    source: String(options.source || "").trim(),
    createdAt: nowIso()
  };
  return withAccountDbUpdate(async () => {
    const db = await loadAccountDb();
    const user = db.users.find((item) => item.id === userId);
    if (!user) return null;
    const group = normalizeUserBillingGroup(options.user || user);
    const groupedEntry = { ...entry, ...group };
    user.tokenUsage = mergeTokenUsageAggregate(user.tokenUsage || emptyTokenUsageTotals(), groupedEntry);
    user.updatedAt = nowIso();
    await saveAccountDb(db);
    await recordDailyTokenUsage(userId, groupedEntry).catch(() => {});
    return groupedEntry;
  });
}

async function recordAiImageUnitCost(userId, options = {}) {
  if (!userId) return null;
  const config = options.config || await loadIntranetConfig();
  const cost = estimateNativeImageCost(config, {
    resolution: options.resolution || options.size,
    count: options.count
  });
  if (!cost.count) return null;
  const entry = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    calls: cost.count,
    ...cost,
    provider: String(options.provider || "secondary-v3").trim(),
    model: `${String(options.model || defaultSecondaryApiImageModel).trim() || defaultSecondaryApiImageModel}:${cost.resolution}`,
    source: String(options.source || "native-image-generation").trim(),
    unitType: "image",
    resolution: cost.resolution,
    imageCount: cost.count,
    createdAt: nowIso()
  };
  return withAccountDbUpdate(async () => {
    const db = await loadAccountDb();
    const user = db.users.find((item) => item.id === userId);
    if (!user) return null;
    const group = normalizeUserBillingGroup(options.user || user);
    const groupedEntry = { ...entry, ...group };
    user.tokenUsage = mergeTokenUsageAggregate(user.tokenUsage || emptyTokenUsageTotals(), groupedEntry);
    user.updatedAt = nowIso();
    await saveAccountDb(db);
    await recordDailyTokenUsage(userId, groupedEntry).catch(() => {});
    return groupedEntry;
  });
}

function publicAccountUser(user) {
  if (!user) return null;
  const usage = user.usage || {};
  const quota = user.quota || {};
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || "user",
    status: user.status || "active",
    department: normalizeGroupText(user.department),
    groupId: safeGroupId(user.groupId || "", ""),
    groupName: normalizeGroupText(user.groupName || user.groupId || ""),
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
}

const usageKeyLabels = {
  aiImages: "AI 生图",
  copywriting: "AI 文案"
};

function usageQuotaValue(user, usageKey) {
  const quota = user?.quota || {};
  return Number(quota[usageKey] ?? 0);
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

function sessionCookie(token, maxAgeSeconds = Math.floor(sessionTtlMs / 1000), req = null) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookieAttribute(req)}`;
}

function clearSessionCookie(req = null) {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieAttribute(req)}`;
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

function pathInside(root, target) {
  const rel = relative(normalize(root), normalize(target));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"));
}

async function currentAccount(req) {
  const cookies = parseCookies(req.headers.cookie);
  const auth = String(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = cookies[sessionCookieName] || bearer;
  if (!token) return null;

  const tokenKey = sessionTokenKey(token);
  const session = accountSessions.get(tokenKey);
  if (!session || session.expiresAt < Date.now()) {
    accountSessions.delete(tokenKey);
    await saveAccountSessions().catch(() => {});
    return null;
  }

  const db = await loadAccountDb();
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    accountSessions.delete(tokenKey);
    await saveAccountSessions().catch(() => {});
    return null;
  }
  return { token, session, user, db };
}

async function requireAccount(req, res) {
  const account = await currentAccount(req);
  if (!account) {
    sendJson(res, 401, { error: "请先登录账户。" });
    return null;
  }
  if (accountSetupRequired(account.db)) {
    sendJson(res, 403, { error: "中控台管理员尚未初始化，请先进入管理后台设置账号密码。" });
    return null;
  }
  const denial = accountLicenseError(account.user);
  if (denial) {
    sendJson(res, denial.status, { error: denial.message, user: publicAccountUser(account.user) });
    return null;
  }
  const config = await loadIntranetConfig().catch(() => null);
  const maintenance = maintenanceBlockForUser(config, account.user);
  if (maintenance) {
    sendJson(res, maintenance.status, {
      error: maintenance.message,
      user: publicAccountUser(account.user),
      maintenance: maintenance.maintenance
    });
    return null;
  }
  return account;
}

function accountLicenseError(user) {
  if ((user.status || "active") !== "active") {
    return { status: 403, message: "账户已停用，请联系管理员。" };
  }
  if (user.expiresAt && new Date(user.expiresAt).getTime() < Date.now()) {
    return { status: 403, message: "账户授权已到期，请续费后继续使用。" };
  }
  return null;
}

function usageLimitError(user, usageKey, amount) {
  const limit = usageQuotaValue(user, usageKey);
  if (limit < 0) return null;
  const used = Number(user.usage?.[usageKey] || 0);
  if (used + amount > limit) {
    const label = usageKeyLabels[usageKey] || usageKey;
    return {
      status: 402,
      message: `当前账户 ${label} 用量不足，已用 ${used}/${limit}。`
    };
  }
  return null;
}

function withAccountDbUpdate(updater) {
  const task = accountDbLock.then(updater, updater);
  accountDbLock = task.catch(() => {});
  return task;
}

async function adjustUsage(userId, usageKey, amount) {
  const delta = Number(amount || 0);
  if (!delta) return null;
  return withAccountDbUpdate(async () => {
    const db = await loadAccountDb();
    const user = db.users.find((item) => item.id === userId);
    if (!user) return null;
    user.usage = user.usage || {};
    const current = Number(user.usage[usageKey] || 0);
    user.usage[usageKey] = Math.max(0, current + delta);
    user.updatedAt = nowIso();
    await saveAccountDb(db);
    await recordDailyUsageDelta(userId, usageKey, delta).catch(() => {});
    return publicAccountUser(user);
  });
}

async function reserveUsage(userId, usageKey, amount) {
  const increment = Math.max(0, Number(amount || 0));
  if (!increment) return null;
  return withAccountDbUpdate(async () => {
    const db = await loadAccountDb();
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw createHttpError(401, "账户不存在，请重新登录。");
    const denial = accountLicenseError(user);
    if (denial) throw createHttpError(denial.status, denial.message);
    const quotaError = usageLimitError(user, usageKey, increment);
    if (quotaError) throw createHttpError(quotaError.status, quotaError.message);
    user.usage = user.usage || {};
    user.usage[usageKey] = Number(user.usage[usageKey] || 0) + increment;
    user.updatedAt = nowIso();
    await saveAccountDb(db);
    await recordDailyUsageDelta(userId, usageKey, increment).catch(() => {});
    return publicAccountUser(user);
  });
}

async function rollbackUsage(userId, usageKey, amount) {
  const decrement = Math.max(0, Number(amount || 0));
  if (!decrement) return null;
  return adjustUsage(userId, usageKey, -decrement);
}

async function rollbackUnusedReservedUsage(reservedUsage, usedAmount = 0) {
  if (!reservedUsage || reservedUsage.closed) return;
  reservedUsage.closed = true;
  const reserved = Math.max(0, Number(reservedUsage.amount || 0));
  const used = Math.max(0, Number(usedAmount || 0));
  const unused = Math.max(0, reserved - used);
  if (unused) {
    await rollbackUsage(reservedUsage.userId, reservedUsage.key, unused);
  }
}

async function withReservedUsage(userId, usageKey, amount, task) {
  const reservedUsage = { userId, key: usageKey, amount };
  await reserveUsage(reservedUsage.userId, reservedUsage.key, reservedUsage.amount);
  try {
    return await task();
  } catch (error) {
    await rollbackUnusedReservedUsage(reservedUsage, 0).catch(() => {});
    throw error;
  }
}

function safePathId(value, fallback = "") {
  const text = String(value || "").trim();
  const safe = text.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return safe || fallback;
}

function aiConversationUserDir(userId) {
  return join(aiConversationsDir, safePathId(userId, "unknown"));
}

function aiConversationIndexPath(userId) {
  return join(aiConversationUserDir(userId), "index.json");
}

function aiConversationFilePath(userId, conversationId) {
  return join(aiConversationUserDir(userId), `${safePathId(conversationId)}.json`);
}

function aiConversationAssetsDir(userId, conversationId) {
  return join(aiConversationUserDir(userId), safePathId(conversationId), "assets");
}

async function readAiConversationIndex(userId) {
  try {
    const raw = await readFile(aiConversationIndexPath(userId), "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeAiConversationIndex(userId, index) {
  await mkdir(aiConversationUserDir(userId), { recursive: true });
  await writeFile(aiConversationIndexPath(userId), JSON.stringify({
    version: 1,
    updatedAt: nowIso(),
    items: Array.isArray(index.items) ? index.items : []
  }, null, 2), "utf8");
}

function aiConversationTitle(conversation) {
  const explicit = String(conversation?.title || "").trim();
  if (explicit) return explicit.slice(0, 48);
  const userMessage = (conversation?.chatMessages || []).find((message) => message?.role === "user" && message?.text);
  const text = String(userMessage?.text || conversation?.prompt || "").trim();
  return text ? text.replace(/\s+/g, " ").slice(0, 24) : "新建对话";
}

function aiConversationImageKey(image = {}, fallback = "") {
  if (!image || typeof image !== "object") return String(fallback || "").trim();
  const values = [
    image.assetHash,
    image.contentHash,
    image.sha1,
    image.hash,
    image.url,
    image.image_file,
    image.commercialUrl,
    image.commercial_url,
    image.name,
    fallback
  ];
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text.length > 280 ? `${text.length}:${text.slice(0, 120)}:${text.slice(-120)}` : text;
  }
  return "";
}

function aiConversationImageCount(conversation) {
  const seen = new Set();
  const add = (image, fallback) => {
    const key = aiConversationImageKey(image, fallback);
    if (!key || seen.has(key)) return;
    seen.add(key);
  };
  const generatedImages = Array.isArray(conversation?.generatedImages) ? conversation.generatedImages : [];
  generatedImages.forEach((image, index) => add(image, `generated:${index}`));
  const messages = Array.isArray(conversation?.chatMessages) ? conversation.chatMessages : [];
  messages.forEach((message, messageIndex) => {
    const images = Array.isArray(message?.images) ? message.images : [];
    images.forEach((image, imageIndex) => add(image, `message:${messageIndex}:${imageIndex}`));
  });
  return seen.size;
}

function aiConversationSummary(conversation) {
  const messages = Array.isArray(conversation?.chatMessages) ? conversation.chatMessages : [];
  const references = Array.isArray(conversation?.references) ? conversation.references : [];
  const imageCount = aiConversationImageCount(conversation);
  const lastText = [...messages].reverse().find((message) => message?.text)?.text || conversation?.prompt || "";
  const lastAssistant = [...messages].reverse().find((message) => message?.role === "assistant") || null;
  const metadata = lastAssistant?.metadata && typeof lastAssistant.metadata === "object" ? lastAssistant.metadata : {};
  const assistantImages = Array.isArray(lastAssistant?.images) ? lastAssistant.images : [];
  const screenImageCount = assistantImages.filter((image) => !image?.mergedDetailPage).length;
  const successCount = Math.max(0, Number(metadata.successCount ?? metadata.imageCount ?? metadata.detailPageSourceCount ?? screenImageCount ?? 0));
  const failedCount = Math.max(0, Number(metadata.failedCount ?? metadata.failed_count ?? 0));
  const requestedCount = Math.max(
    successCount + failedCount,
    Number(metadata.requestedCount ?? metadata.detailPageScreenCount ?? successCount ?? imageCount ?? 0)
  );
  let taskStatus = "draft";
  if (metadata.detailPageCheckpoint) taskStatus = "running";
  else if (lastAssistant?.error) taskStatus = "failed";
  else if (successCount > 0 && (failedCount > 0 || requestedCount > successCount)) taskStatus = "partial";
  else if (successCount > 0 || imageCount > 0) taskStatus = "completed";
  const assetTypeLabels = {
    commerce_main_image: "主图",
    poster_or_kv: "海报",
    detail_page_module: "详情页",
    white_bg_product: "白底图",
    product_scene: "场景图",
    image_edit: "图片续改"
  };
  const taskKind = metadata.detailPageWorkflow
    ? "详情页"
    : assetTypeLabels[String(metadata.assetType || metadata.asset_type || "")] || lastAssistant?.skill || "AI 生图";
  return {
    id: conversation.id,
    title: aiConversationTitle(conversation),
    createdAt: conversation.createdAt || nowIso(),
    updatedAt: conversation.updatedAt || nowIso(),
    messageCount: messages.length,
    referenceCount: references.length,
    imageCount,
    lastText: String(lastText || "").replace(/\s+/g, " ").slice(0, 120),
    taskStatus,
    taskKind,
    requestedCount,
    successCount: successCount || (taskStatus === "completed" ? imageCount : 0),
    failedCount
  };
}

function dataUrlImageAsset(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([\s\S]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) return null;
  if (buffer.length > maxImageUploadBytes) {
    throw createHttpError(400, `单张历史图片超过 ${maxImageUploadMb}MB，暂不保存到对话记录。`);
  }
  return {
    mime,
    ext: imageExtFromMime(mime),
    buffer
  };
}

async function saveConversationImageAsset(userId, conversationId, image, prefix) {
  if (!image || typeof image !== "object") return image;
  const saveAsset = async (value, assetPrefix) => {
    const asset = dataUrlImageAsset(value || "");
    if (!asset) return null;
    const hash = createHash("sha1").update(asset.buffer).digest("hex").slice(0, 20);
    const safePrefix = safePathId(assetPrefix, "asset").slice(0, 36);
    const fileName = `${safePrefix}-${hash}.${asset.ext}`;
    const assetsDir = aiConversationAssetsDir(userId, conversationId);
    await mkdir(assetsDir, { recursive: true });
    const filePath = join(assetsDir, fileName);
    if (!existsSync(filePath)) await writeFile(filePath, asset.buffer);
    return {
      url: `/api/ai/conversations/${encodeURIComponent(conversationId)}/assets/${encodeURIComponent(fileName)}`,
      mime: asset.mime,
      size: asset.buffer.length,
      hash
    };
  };
  const primary = await saveAsset(image.url || image.image_file || "", prefix);
  const commercial = await saveAsset(image.commercialUrl || image.commercial_url || "", `${prefix}-commercial`);
  const result = { ...image };
  if (primary) {
    result.url = primary.url;
    result.image_file = primary.url;
    result.type = image.type || primary.mime;
    result.size = Number(image.size || primary.size);
    result.assetHash = image.assetHash || image.contentHash || primary.hash;
  }
  if (commercial) {
    result.commercialUrl = commercial.url;
    result.commercial_url = commercial.url;
    result.commercialType = image.commercialType || commercial.mime;
    result.commercialAssetHash = image.commercialAssetHash || commercial.hash;
  }
  return result;
}

const maxAiConversationDetailPlanningMaterials = 3;
const maxAiConversationDetailPlanningImagesPerMaterial = 32;
const maxAiConversationDetailPlanningContentChars = 12000;

function boundedConversationInteger(value, max = 1000000) {
  const number = Math.floor(Number(value || 0));
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : 0;
}

function normalizeAiConversationDetailSheet(sheet = {}) {
  const source = sheet && typeof sheet === "object" ? sheet : {};
  return {
    name: String(source.name || "").trim().slice(0, 120),
    workbookIndex: boundedConversationInteger(source.workbookIndex, 1000),
    rowCount: boundedConversationInteger(source.rowCount),
    moduleCount: boundedConversationInteger(source.moduleCount, 32),
    modules: (Array.isArray(source.modules) ? source.modules : []).slice(0, 32).map((module = {}) => ({
      order: boundedConversationInteger(module.order, 32),
      screen: boundedConversationInteger(module.screen, 10000),
      name: String(module.name || "").trim().slice(0, 160),
      rowStart: boundedConversationInteger(module.rowStart),
      rowEnd: boundedConversationInteger(module.rowEnd)
    })),
    embeddedImageCount: boundedConversationInteger(source.embeddedImageCount, maxAiConversationDetailPlanningImagesPerMaterial)
  };
}

function normalizeAiConversationDetailEmbeddedImage(image = {}, index = 0) {
  const source = image && typeof image === "object" ? image : {};
  const url = String(source.url || source.image_file || "").trim().slice(0, 4000);
  return {
    id: String(source.id || `detail-image-${index + 1}`).trim().slice(0, 120),
    name: String(source.name || `线框模板内嵌图${index + 1}`).trim().slice(0, 180),
    size: boundedConversationInteger(source.size, maxImageUploadBytes),
    type: String(source.type || "").trim().slice(0, 120),
    url,
    image_file: url,
    width: boundedConversationInteger(source.width, 20000),
    height: boundedConversationInteger(source.height, 20000),
    aspectRatio: String(source.aspectRatio || source.aspect_ratio || "").trim().slice(0, 40),
    role: String(source.role || "reference").trim().slice(0, 60),
    source: String(source.source || "detail_planning_workbook").trim().slice(0, 80),
    sourceSheetName: String(source.sourceSheetName || "").trim().slice(0, 120),
    sourceSheetIndex: boundedConversationInteger(source.sourceSheetIndex, 1000),
    anchorRow: boundedConversationInteger(source.anchorRow),
    anchorColumn: boundedConversationInteger(source.anchorColumn, 10000),
    templateOrder: boundedConversationInteger(source.templateOrder, 32),
    templateScreen: boundedConversationInteger(source.templateScreen, 10000),
    templateModule: String(source.templateModule || "").trim().slice(0, 160),
    assetHash: String(source.assetHash || source.contentHash || "").trim().slice(0, 80)
  };
}

async function normalizeAiConversationDetailPlanningMaterials(userId, conversationId, value, saveImageAsset = saveConversationImageAsset) {
  const materials = (Array.isArray(value) ? value : []).slice(0, maxAiConversationDetailPlanningMaterials);
  const normalized = [];
  let remainingContent = maxAiConversationDetailPlanningContentChars;
  for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
    const source = materials[materialIndex] && typeof materials[materialIndex] === "object" ? materials[materialIndex] : {};
    const content = String(source.content || "").trim().slice(0, remainingContent);
    remainingContent -= content.length;
    const embeddedImages = [];
    const sourceImages = (Array.isArray(source.embeddedImages) ? source.embeddedImages : [])
      .slice(0, maxAiConversationDetailPlanningImagesPerMaterial);
    for (let imageIndex = 0; imageIndex < sourceImages.length; imageIndex += 1) {
      const saved = await saveImageAsset(
        userId,
        conversationId,
        sourceImages[imageIndex],
        `detail-material-${materialIndex + 1}-${imageIndex + 1}`
      );
      embeddedImages.push(normalizeAiConversationDetailEmbeddedImage(saved, imageIndex));
    }
    normalized.push({
      id: String(source.id || `detail-material-${materialIndex + 1}`).trim().slice(0, 120),
      kind: "spreadsheet",
      name: String(source.name || `详情页资料表${materialIndex + 1}`).trim().slice(0, 120),
      size: boundedConversationInteger(source.size, 100 * 1024 * 1024),
      type: String(source.type || "application/octet-stream").trim().slice(0, 120),
      sheetNames: (Array.isArray(source.sheetNames) ? source.sheetNames : []).slice(0, 32).map((name) => String(name || "").trim().slice(0, 120)).filter(Boolean),
      selectedSheetName: String(source.selectedSheetName || "").trim().slice(0, 120),
      selectedSheetNames: (Array.isArray(source.selectedSheetNames) ? source.selectedSheetNames : []).slice(0, 32).map((name) => String(name || "").trim().slice(0, 120)).filter(Boolean),
      sheets: (Array.isArray(source.sheets) ? source.sheets : []).slice(0, 32).map(normalizeAiConversationDetailSheet),
      rowCount: boundedConversationInteger(source.rowCount),
      wireframeModuleCount: boundedConversationInteger(source.wireframeModuleCount, 32),
      embeddedImages,
      content
    });
  }
  return normalized;
}

async function normalizeAiConversationAssets(userId, conversation) {
  const result = JSON.parse(JSON.stringify(conversation || {}));
  const conversationId = safePathId(result.id, randomUUID());
  result.id = conversationId;
  result.references = Array.isArray(result.references) ? result.references.slice(0, 20) : [];
  result.generatedImages = Array.isArray(result.generatedImages) ? result.generatedImages.slice(0, 40) : [];
  result.chatMessages = Array.isArray(result.chatMessages) ? result.chatMessages.slice(-80) : [];
  if (Array.isArray(result.detailPlanningMaterials)) {
    result.detailPlanningMaterials = await normalizeAiConversationDetailPlanningMaterials(userId, conversationId, result.detailPlanningMaterials);
  }
  for (let i = 0; i < result.references.length; i += 1) {
    result.references[i] = await saveConversationImageAsset(userId, conversationId, result.references[i], `ref-${i + 1}`);
  }
  for (let i = 0; i < result.generatedImages.length; i += 1) {
    result.generatedImages[i] = await saveConversationImageAsset(userId, conversationId, result.generatedImages[i], `generated-${i + 1}`);
  }
  for (let i = 0; i < result.chatMessages.length; i += 1) {
    const message = result.chatMessages[i] || {};
    message.images = Array.isArray(message.images) ? message.images.slice(0, 40) : [];
    message.references = Array.isArray(message.references) ? message.references.slice(0, 20) : [];
    for (let j = 0; j < message.images.length; j += 1) {
      message.images[j] = await saveConversationImageAsset(userId, conversationId, message.images[j], `message-${i + 1}-${j + 1}`);
    }
    for (let j = 0; j < message.references.length; j += 1) {
      message.references[j] = await saveConversationImageAsset(userId, conversationId, message.references[j], `message-ref-${i + 1}-${j + 1}`);
    }
    result.chatMessages[i] = {
      id: safePathId(message.id, randomUUID()),
      role: message.role === "user" ? "user" : "assistant",
      text: String(message.text || "").slice(0, 8000),
      error: Boolean(message.error),
      provider: String(message.provider || "").slice(0, 40),
      skill: String(message.skill || "").slice(0, 80),
      skillId: String(message.skillId || message.skill_id || "").slice(0, 80),
      taskId: safePathId(message.taskId || message.task_id || message.metadata?.generationTaskId || ""),
      prompt: String(message.prompt || "").slice(0, 8000),
      metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : null,
      createdAt: message.createdAt || nowIso(),
      images: message.images,
      references: message.references
    };
  }
  result.title = aiConversationTitle(result);
  result.createdAt = result.createdAt || nowIso();
  result.updatedAt = nowIso();
  result.prompt = String(result.prompt || "").slice(0, 8000);
  result.turns = Array.isArray(result.turns) ? result.turns.slice(-20) : [];
  result.settings = typeof result.settings === "object" && result.settings ? result.settings : {};
  result.selectedEditImageKey = String(result.selectedEditImageKey || "");
  result.useSelectedImageAsBase = Boolean(result.useSelectedImageAsBase);
  return result;
}

function mergeAiConversationMessages(existingMessages = [], incomingMessages = []) {
  const merged = [];
  const positions = new Map();
  [...(Array.isArray(existingMessages) ? existingMessages : []), ...(Array.isArray(incomingMessages) ? incomingMessages : [])].forEach((message) => {
    if (!message) return;
    const id = safePathId(message.id, randomUUID());
    if (positions.has(id)) {
      const index = positions.get(id);
      merged[index] = { ...merged[index], ...message, id };
      return;
    }
    positions.set(id, merged.length);
    merged.push({ ...message, id });
  });
  return merged
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(-80);
}

function mergeAiConversationSnapshot(existing = {}, incoming = {}, mode = "merge") {
  if (!existing?.id || mode === "replace") return incoming;
  const taskMerge = mode === "task";
  return {
    ...(taskMerge ? incoming : existing),
    ...(taskMerge ? existing : incoming),
    id: incoming.id || existing.id,
    createdAt: existing.createdAt || incoming.createdAt || nowIso(),
    updatedAt: nowIso(),
    chatMessages: mergeAiConversationMessages(existing.chatMessages, incoming.chatMessages),
    generatedImages: Array.isArray(incoming.generatedImages) && incoming.generatedImages.length
      ? incoming.generatedImages
      : Array.isArray(existing.generatedImages) ? existing.generatedImages : [],
    references: taskMerge
      ? (Array.isArray(existing.references) ? existing.references : [])
      : (Array.isArray(incoming.references) ? incoming.references : []),
    detailPlanningMaterials: taskMerge
      ? (Array.isArray(existing.detailPlanningMaterials) ? existing.detailPlanningMaterials : [])
      : (Array.isArray(incoming.detailPlanningMaterials) ? incoming.detailPlanningMaterials : []),
    settings: taskMerge
      ? (existing.settings && typeof existing.settings === "object" ? existing.settings : incoming.settings || {})
      : (incoming.settings && typeof incoming.settings === "object" ? incoming.settings : existing.settings || {})
  };
}

function withAiConversationSaveLock(userId, task) {
  const key = safePathId(userId, "unknown");
  const previous = aiConversationSaveLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  aiConversationSaveLocks.set(key, run);
  return run.finally(() => {
    if (aiConversationSaveLocks.get(key) === run) aiConversationSaveLocks.delete(key);
  });
}

async function handleAiConversations(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const userId = account.user.id;

  if (req.method === "GET" && parts.length === 3) {
    const index = await readAiConversationIndex(userId);
    sendJson(res, 200, { items: index.items });
    return;
  }

  if (req.method === "GET" && parts.length === 4) {
    const conversationId = safePathId(parts[3]);
    if (!conversationId) throw createHttpError(400, "对话 ID 无效。");
    const raw = await readFile(aiConversationFilePath(userId, conversationId), "utf8").catch(() => "");
    if (!raw) throw createHttpError(404, "对话不存在。");
    sendJson(res, 200, { conversation: JSON.parse(raw) });
    return;
  }

  if (req.method === "GET" && parts.length === 6 && parts[4] === "assets") {
    const conversationId = safePathId(parts[3]);
    const fileName = basename(parts[5] || "");
    if (!conversationId || !/^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(fileName)) {
      throw createHttpError(400, "资源路径无效。");
    }
    const filePath = normalize(join(aiConversationAssetsDir(userId, conversationId), fileName));
    const root = normalize(aiConversationAssetsDir(userId, conversationId));
    if (!filePath.startsWith(root)) throw createHttpError(403, "Forbidden");
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": imageMimeFromExt(extname(fileName).toLowerCase()),
      "cache-control": "no-store"
    });
    res.end(content);
    return;
  }

  if (req.method === "POST" && parts.length === 4 && parts[3] === "save") {
    const body = await readJson(req);
    const incoming = await normalizeAiConversationAssets(userId, body.conversation || {});
    const requestedMode = String(body.mergeMode || body.merge_mode || "merge").trim().toLowerCase();
    const mergeMode = ["merge", "task", "replace"].includes(requestedMode) ? requestedMode : "merge";
    const saved = await withAiConversationSaveLock(userId, async () => {
      const rawExisting = await readFile(aiConversationFilePath(userId, incoming.id), "utf8").catch(() => "");
      const existing = rawExisting ? JSON.parse(rawExisting) : null;
      const conversation = mergeAiConversationSnapshot(existing, incoming, mergeMode);
      await mkdir(aiConversationUserDir(userId), { recursive: true });
      await writeFile(aiConversationFilePath(userId, conversation.id), JSON.stringify(conversation, null, 2), "utf8");
      const index = await readAiConversationIndex(userId);
      const summary = aiConversationSummary(conversation);
      const items = [summary, ...index.items.filter((item) => item.id !== conversation.id)]
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .slice(0, 200);
      await writeAiConversationIndex(userId, { items });
      return { conversation, items };
    });
    queueCloudSnapshot({
      kind: "conversation",
      userId,
      id: saved.conversation.id,
      data: saved.conversation,
      assetDir: aiConversationAssetsDir(userId, saved.conversation.id),
      assetNames: await localCloudAssetNames(aiConversationAssetsDir(userId, saved.conversation.id))
    });
    sendJson(res, 200, saved);
    return;
  }

  if (req.method === "POST" && parts.length === 5 && parts[4] === "delete") {
    const conversationId = safePathId(parts[3]);
    if (!conversationId) throw createHttpError(400, "对话 ID 无效。");
    await rm(aiConversationFilePath(userId, conversationId), { force: true }).catch(() => {});
    await rm(join(aiConversationUserDir(userId), conversationId), { recursive: true, force: true }).catch(() => {});
    const index = await readAiConversationIndex(userId);
    const items = index.items.filter((item) => item.id !== conversationId);
    await writeAiConversationIndex(userId, { items });
    sendJson(res, 200, { ok: true, items });
    return;
  }

  sendJson(res, 404, { error: "AI 对话接口不存在。" });
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

async function writeAiFeedbackStore(store) {
  await mkdir(aiFeedbackDir, { recursive: true });
  const items = Array.isArray(store.items) ? store.items : [];
  await writeFile(aiFeedbackPath, JSON.stringify({
    version: 1,
    updatedAt: nowIso(),
    items: items.slice(-5000)
  }, null, 2), "utf8");
}

function withAiFeedbackLock(task) {
  const run = aiFeedbackLock.then(task, task);
  aiFeedbackLock = run.catch(() => {});
  return run;
}

function normalizeAiFeedbackPayload(body = {}, account = null) {
  const rating = String(body.rating || "").trim().toLowerCase();
  if (!["up", "down"].includes(rating)) throw createHttpError(400, "反馈类型无效。");
  const conversationId = safePathId(body.conversationId || body.conversation_id || "");
  const messageId = safePathId(body.messageId || body.message_id || "");
  const parsedImageIndex = Math.floor(Number(body.imageIndex ?? body.image_index ?? 0));
  const imageIndex = Number.isFinite(parsedImageIndex) && parsedImageIndex >= 0 ? parsedImageIndex : 0;
  if (!conversationId || !messageId) throw createHttpError(400, "缺少反馈对应的生成记录。");
  const issue = String(body.issue || body.problem || "").trim().slice(0, 2000);
  if (rating === "down" && !issue) throw createHttpError(400, "请填写这次哪里不好。");
  const userId = account?.user?.id || "";
  const id = createHash("sha1")
    .update([userId, conversationId, messageId, imageIndex].join(":"))
    .digest("hex")
    .slice(0, 24);
  return {
    id,
    rating,
    issue,
    conversationId,
    messageId,
    imageIndex,
    prompt: String(body.prompt || "").trim().slice(0, 4000),
    originalPrompt: String(body.originalPrompt || body.original_prompt || body.prompt || "").trim().slice(0, 4000),
    plannedPrompt: String(body.plannedPrompt || body.planned_prompt || "").trim().slice(0, 8000),
    imageName: String(body.imageName || body.image_name || "").trim().slice(0, 240),
    imageUrl: String(body.imageUrl || body.image_url || "").trim().slice(0, 1000),
    references: normalizeAiFailureReferences(body.references || body.referenceImages || body.reference_images || []),
    aiLabel: String(body.aiLabel || body.ai_label || "").trim().slice(0, 160),
    workflow: String(body.workflow || "").trim().slice(0, 120),
    jobId: String(body.jobId || body.job_id || "").trim().slice(0, 120),
    provider: String(body.provider || "").trim().slice(0, 120),
    model: String(body.model || "").trim().slice(0, 160),
    reasonType: String(body.reasonType || body.reason_type || "").trim().slice(0, 80),
    userId,
    username: account?.user?.username || "",
    displayName: account?.user?.displayName || account?.user?.username || "",
    groupId: account?.user?.groupId || "",
    groupName: account?.user?.groupName || account?.user?.department || "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

async function handleAiFeedback(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = await readJson(req);
  const next = normalizeAiFeedbackPayload(body, account);
  const saved = await withAiFeedbackLock(async () => {
    const store = await readAiFeedbackStore();
    const current = store.items.find((item) => item.id === next.id);
    if (current) {
      Object.assign(current, {
        ...next,
        createdAt: current.createdAt || next.createdAt,
        updatedAt: nowIso()
      });
    } else {
      store.items.push(next);
    }
    store.items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    await writeAiFeedbackStore(store);
    return current || next;
  });
  sendJson(res, 200, { ok: true, feedback: saved });
}

function normalizeAiFailureLogPayload(body = {}, account = null) {
  const issue = String(body.issue || body.error || body.message || "AI 任务失败").trim().slice(0, 2000);
  const userId = account?.user?.id || "";
  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  return {
    id,
    logType: "automatic-failure",
    rating: "down",
    issue,
    conversationId: safePathId(body.conversationId || body.conversation_id || ""),
    messageId: safePathId(body.messageId || body.message_id || ""),
    imageIndex: 0,
    prompt: String(body.prompt || "").trim().slice(0, 4000),
    originalPrompt: String(body.originalPrompt || body.original_prompt || body.prompt || "").trim().slice(0, 4000),
    plannedPrompt: String(body.plannedPrompt || body.planned_prompt || "").trim().slice(0, 8000),
    imageName: String(body.imageName || body.image_name || "").trim().slice(0, 240),
    imageUrl: String(body.imageUrl || body.image_url || "").trim().slice(0, 1000),
    references: normalizeAiFailureReferences(body.references || body.referenceImages || body.reference_images || []),
    aiLabel: String(body.aiLabel || body.ai_label || "AI 任务失败").trim().slice(0, 160),
    workflow: String(body.workflow || "").trim().slice(0, 120),
    jobId: String(body.jobId || body.job_id || "").trim().slice(0, 120),
    provider: String(body.provider || "").trim().slice(0, 120),
    model: String(body.model || "").trim().slice(0, 160),
    reasonType: String(body.reasonType || body.reason_type || "").trim().slice(0, 80),
    userId,
    username: account?.user?.username || "",
    displayName: account?.user?.displayName || account?.user?.username || "",
    groupId: account?.user?.groupId || "",
    groupName: account?.user?.groupName || account?.user?.department || "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

async function handleAiFailureLog(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const body = await readJson(req);
  const next = normalizeAiFailureLogPayload(body, account);
  const saved = await withAiFeedbackLock(async () => {
    const store = await readAiFeedbackStore();
    store.items.push(next);
    store.items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    await writeAiFeedbackStore(store);
    return next;
  });
  sendJson(res, 200, { ok: true, feedback: saved });
}

function extractJsonObjectsFromText(text = "") {
  const value = String(text || "");
  const results = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = index; cursor < value.length; cursor += 1) {
      const char = value[cursor];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            results.push(JSON.parse(value.slice(index, cursor + 1)));
            index = cursor;
          } catch {
          }
          break;
        }
      }
    }
  }
  return results;
}

function extractAiFailureMessages(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value !== "object") return [];
  const messages = [];
  [
    value.error,
    value.message,
    value.detail,
    value.raw,
    value.status_msg,
    value.statusMessage,
    value.base_resp?.status_msg,
    value.data?.error,
    value.data?.message,
    value.data?.detail,
    value.error?.message,
    value.error?.detail
  ].forEach((item) => {
    messages.push(...extractAiFailureMessages(item, depth + 1));
  });
  return [...new Set(messages.filter(Boolean))];
}

function compactAiProviderLabel(provider = "") {
  const key = String(provider || "").trim().toLowerCase();
  if (key === "secondaryimage" || key === "secondary-v3" || key === "secondary") return "备用图片服务";
  if (key === "imageservice") return "图片服务";
  if (key === "primaryimage") return "图片服务";
  if (key === "responsesimage") return "Responses 图片模型";
  return key ? `图片模型（${key.slice(0, 40)}）` : "AI 生图";
}

function classifyAiFailureReason(errorOrMessage = "", provider = "") {
  const preset = errorOrMessage && typeof errorOrMessage === "object"
    ? errorOrMessage.aiFailureReason
    : null;
  if (preset?.type && preset?.message) {
    return {
      type: String(preset.type).trim().slice(0, 80) || "unknown",
      message: String(preset.message).trim().slice(0, 1000)
    };
  }
  const raw = typeof errorOrMessage === "string"
    ? errorOrMessage
    : (errorOrMessage?.message || String(errorOrMessage || ""));
  const jsonMessages = extractJsonObjectsFromText(raw).flatMap((item) => extractAiFailureMessages(item));
  const joined = [raw, ...jsonMessages].filter(Boolean).join("\n");
  const lower = joined.toLowerCase();
  const providerLabel = compactAiProviderLabel(provider);

  if (/sensitive|content policy|policy violation|safety|unsafe|flagged|blocked|rejected by safety|risk_api_error|content_filter|nsfw|安全|敏感|违规|拦截/i.test(joined)) {
    return {
      type: "safety",
      message: "内容安全拦截：提示词、参考图或生成结果触发平台安全策略，请调整描述或图片后重试。"
    };
  }
  if (/远程图片存储|图床|公网化|input_urls|不是公网 url|上传图床|对象存储/i.test(joined)) {
    return {
      type: "reference_upload",
      message: "参考图公网化失败：备用图片服务需要可访问的图片链接，请检查远程图片存储或对象存储配置后重试。"
    };
  }
  if (/insufficient[^\n]{0,40}(?:balance|credit|quota)|(?:balance|credit|quota)[^\n]{0,40}(?:insufficient|exceeded|exhausted)|余额不足|额度不足|欠费|配额(?:不足|已用完)/i.test(joined)) {
    return {
      type: "quota",
      message: `${providerLabel}额度不足：服务账户余额或调用配额已用完，请补充额度后重试。`
    };
  }
  if (/\b429\b|rate[_ -]?limit|too many requests|请求过于频繁|限流/i.test(joined)) {
    return {
      type: "rate_limit",
      message: `${providerLabel}请求过于频繁：服务触发限流，请稍后重试。`
    };
  }
  if (/\b401\b|unauthorized|invalid[^\n]{0,20}(?:api[_ -]?key|token)|(?:api[_ -]?key|token)[^\n]{0,20}invalid|密钥(?:无效|错误)|认证失败|未授权/i.test(joined)) {
    return {
      type: "authentication",
      message: `${providerLabel}认证失败：API Key 无效、过期或未正确配置，请联系系统管理员检查。`
    };
  }
  if (/\b403\b|forbidden|permission denied|权限不足|无权限|拒绝访问/i.test(joined)) {
    return {
      type: "permission",
      message: `${providerLabel}权限不足：当前 API Key 没有调用该生图模型的权限，请联系系统管理员检查。`
    };
  }
  if (/timed out|timeout|no results were returned|超时/i.test(joined)) {
    return {
      type: "timeout",
      message: `${providerLabel}响应超时：服务没有在限定时间内返回结果，请稍后重试。`
    };
  }
  if (/(?:unsupported|invalid|not support)[^\n]{0,40}(?:aspect[_ -]?ratio|resolution|image[_ -]?size|size)|(?:aspect[_ -]?ratio|resolution|image[_ -]?size)[^\n]{0,40}(?:unsupported|invalid|not support)|不支持[^\n]{0,30}(?:比例|分辨率|尺寸)|(?:比例|分辨率|尺寸)[^\n]{0,30}(?:无效|不支持)/i.test(joined)) {
    return {
      type: "invalid_size_parameter",
      message: `${providerLabel}不支持当前尺寸参数：所选比例或清晰度被服务拒绝，请调整尺寸后重试。`
    };
  }
  if (/invalid image file|unsupported image|image file|mode for image|图片.*格式|参考图.*失败/i.test(joined)) {
    return {
      type: "invalid_image",
      message: "参考图读取失败：图片格式、大小或内容不被服务接受，请换一张 JPG/PNG 图片后重试。"
    };
  }
  if (/econnreset|socket hang up|network|fetch failed|connection|连接失败|断开/i.test(lower)) {
    return {
      type: "network",
      message: `${providerLabel}连接失败：网络或服务接口中断，请检查接口和网络后重试。`
    };
  }
  if (/internal error|try again later|server error|bad gateway|service unavailable|服务器|内部错误/i.test(joined)) {
    return {
      type: "upstream",
      message: `${providerLabel}服务异常：接口返回内部错误，请稍后重试。`
    };
  }
  if (/没有图片|no image|no output|empty/i.test(joined)) {
    return {
      type: "empty_result",
      message: `${providerLabel}没有返回图片：任务结束但没有可用结果，请调整提示词后重试。`
    };
  }
  const clean = joined
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/\b[A-Z_]+_[A-Z0-9_]+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    type: "unknown",
    message: clean && /[\u4e00-\u9fa5]/.test(clean)
      ? clean.slice(0, 220)
      : `${providerLabel}生成失败：接口没有返回可读的中文原因，请查看提示词和参考图后重试。`
  };
}

function aiVisibleFailureMessage(errorOrMessage = "", provider = "") {
  return classifyAiFailureReason(errorOrMessage, provider).message;
}

function normalizeAiProviderAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).slice(0, 12).map((attempt) => ({
    provider: String(attempt?.provider || "").trim().slice(0, 80),
    result: String(attempt?.result || "").trim().slice(0, 40),
    reasonType: String(attempt?.reasonType || attempt?.reason_type || "").trim().slice(0, 80),
    message: String(attempt?.message || "").trim().slice(0, 500),
    index: Number(attempt?.index || 0) || undefined
  }));
}

function aiPromptRewriteRecovery(errorOrMessage = "", provider = "") {
  const reason = classifyAiFailureReason(errorOrMessage, provider);
  const attempts = normalizeAiProviderAttempts(errorOrMessage?.aiProviderAttempts);
  const azSafetyBlocked = attempts.some((attempt) => (
    attempt.provider === "imageservice"
    && attempt.result === "failed"
    && attempt.reasonType === "safety"
  ));
  const nativeFailed = attempts.some((attempt) => (
    attempt.provider === "secondaryimage"
    && attempt.result === "failed"
  ));
  const nativePromptLikeFailure = attempts.some((attempt) => (
    attempt.provider === "secondaryimage"
    && attempt.result === "failed"
    && ["safety", "empty_result", "unknown"].includes(attempt.reasonType)
  ));
  const promptRewriteAvailable = Boolean(azSafetyBlocked && nativeFailed && (reason.type === "safety" || nativePromptLikeFailure));
  return {
    errorType: reason.type,
    promptRewriteAvailable,
    providerAttempts: attempts
  };
}

function attachAiFailureContext(error, context = {}) {
  if (error && typeof error === "object") {
    error.aiFailureContext = {
      ...(error.aiFailureContext || {}),
      ...context
    };
  }
  return error;
}

function normalizeAiFailureReferences(references = []) {
  const list = Array.isArray(references) ? references : [];
  return list.slice(0, maxImageServiceReferences).map((item, index) => {
    const text = String(item?.image_file || item?.url || (typeof item === "string" ? item : "") || "").trim();
    const publicUrl = /^https?:\/\//i.test(text) && !text.startsWith("data:") ? text.slice(0, 1000) : "";
    return {
      index: index + 1,
      name: String(item?.name || item?.fileName || item?.file_name || `参考图${index + 1}`).trim().slice(0, 160),
      role: String(item?.role || item?.plannedRole || item?.planned_role || "").trim().slice(0, 120),
      url: publicUrl,
      imageUrl: String(item?.imageUrl || item?.image_url || "").trim().slice(0, 1000),
      fileName: String(item?.fileName || item?.file_name || "").trim().slice(0, 180),
      relativePath: String(item?.relativePath || item?.relative_path || "").trim().slice(0, 500),
      mime: String(item?.mime || item?.type || "").trim().slice(0, 80),
      bytes: Math.max(0, Number(item?.bytes || item?.size || 0)),
      error: String(item?.error || "").trim().slice(0, 500)
    };
  });
}

async function saveAiFailureReferenceAssets(failureId, references = [], userId = "") {
  const list = Array.isArray(references) ? references.slice(0, maxImageServiceReferences) : [];
  const saved = [];
  const safeId = safePathId(failureId, randomUUID().replace(/-/g, "").slice(0, 24));
  const outputDir = join(aiFeedbackAssetsDir, safeId);
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    const base = normalizeAiFailureReferences([item])[0] || { index: index + 1, name: `参考图${index + 1}` };
    try {
      const file = await imageReferenceToBlob(item, index, userId);
      if (!file?.blob) {
        saved.push({ ...base, error: base.error || "参考图未能解析，已保留名称或链接。" });
        continue;
      }
      const buffer = Buffer.from(await file.blob.arrayBuffer());
      if (!buffer.length) {
        saved.push({ ...base, error: "参考图为空，未保存。" });
        continue;
      }
      const mime = String(file.blob.type || base.mime || "image/png").split(";")[0].toLowerCase();
      const ext = imageExtFromMime(mime);
      const fileName = `ref-${String(index + 1).padStart(2, "0")}.${ext}`;
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, fileName), buffer);
      saved.push({
        ...base,
        fileName,
        relativePath: `assets/${safeId}/${fileName}`,
        imageUrl: `/api/admin/feedback/asset/${encodeURIComponent(safeId)}/${encodeURIComponent(fileName)}`,
        mime,
        bytes: buffer.length,
        error: ""
      });
    } catch (error) {
      saved.push({
        ...base,
        error: aiVisibleFailureMessage(error, "imageservice")
      });
    }
  }
  return saved;
}

function buildAiFailurePrompt(originalPrompt = "", plannedPrompt = "") {
  const original = String(originalPrompt || "").trim();
  const planned = String(plannedPrompt || "").trim();
  if (planned && planned !== original) {
    return [
      original ? `用户原始提示词：\n${original}` : "",
      `最终生图提示词：\n${planned}`
    ].filter(Boolean).join("\n\n").slice(0, 8000);
  }
  return (original || planned).slice(0, 8000);
}

async function recordAiImageFailureLog(jobId, item = {}, error) {
  const context = error?.aiFailureContext || {};
  const provider = context.provider || item.provider || "";
  const reason = classifyAiFailureReason(error, provider);
  const account = item.account || {};
  const userId = account.id || context.userId || "";
  const originalPrompt = context.originalPrompt || item.prompt || "";
  const plannedPrompt = context.plannedPrompt || item.plannedPrompt || "";
  const references = context.references || context.generationReferences || item.references || [];
  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  const savedReferences = await saveAiFailureReferenceAssets(id, references, userId).catch(() => normalizeAiFailureReferences(references));
  const next = {
    id,
    logType: "automatic-failure",
    rating: "down",
    issue: reason.message,
    reasonType: reason.type,
    jobId: String(jobId || "").trim(),
    provider: String(provider || "").trim(),
    model: String(context.model || item.model || "").trim(),
    conversationId: safePathId(item.conversationId || context.conversationId || ""),
    messageId: safePathId(item.messageId || context.messageId || ""),
    imageIndex: 0,
    prompt: buildAiFailurePrompt(originalPrompt, plannedPrompt).slice(0, 8000),
    originalPrompt: String(originalPrompt || "").trim().slice(0, 4000),
    plannedPrompt: String(plannedPrompt || "").trim().slice(0, 8000),
    imageName: savedReferences[0]?.name || (Number(item.referenceCount || 0) ? `参考图 ${item.referenceCount} 张` : "无参考图"),
    imageUrl: savedReferences.find((ref) => ref.imageUrl)?.imageUrl || "",
    references: savedReferences,
    aiLabel: `${compactAiProviderLabel(provider)}生图失败`,
    workflow: String(item.workflow || context.workflow || "").trim().slice(0, 120),
    providerAttempts: (Array.isArray(error?.aiProviderAttempts) ? error.aiProviderAttempts : [])
      .slice(0, 20)
      .map((attempt) => ({
        provider: String(attempt?.provider || "").trim().slice(0, 80),
        result: String(attempt?.result || "").trim().slice(0, 40),
        reasonType: String(attempt?.reasonType || "").trim().slice(0, 80),
        message: String(attempt?.message || "").trim().slice(0, 500),
        index: Math.max(0, Number(attempt?.index || 0))
      })),
    userId: String(userId || ""),
    username: String(account.username || ""),
    displayName: String(account.displayName || account.username || ""),
    groupId: String(account.groupId || ""),
    groupName: String(account.groupName || account.department || ""),
    rawIssue: String(error?.message || error || "").trim().slice(0, 4000),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await withAiFeedbackLock(async () => {
    const store = await readAiFeedbackStore();
    store.items.push(next);
    store.items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    await writeAiFeedbackStore(store);
    return next;
  });
  return next;
}

async function withAiGalleryLock(task) {
  const run = aiGalleryLock.then(task, task);
  aiGalleryLock = run.catch(() => {});
  return run;
}

async function readAiGalleryIndex() {
  try {
    const raw = await readFile(aiGalleryIndexPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      totalGenerated: Number(parsed.totalGenerated || 0),
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch {
    return { version: 1, totalGenerated: 0, items: [] };
  }
}

async function writeAiGalleryIndex(index) {
  await mkdir(aiGalleryDir, { recursive: true });
  await writeFile(aiGalleryIndexPath, JSON.stringify({
    version: 1,
    totalGenerated: Number(index.totalGenerated || 0),
    updatedAt: nowIso(),
    items: Array.isArray(index.items) ? index.items : []
  }, null, 2), "utf8");
}

function safeAiGalleryImagePath(item) {
  const relativePath = String(item?.relativePath || "").replace(/^[/\\]+/, "");
  if (!relativePath) return null;
  const target = normalize(join(aiGalleryDir, relativePath));
  const root = normalize(aiGalleryDir);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) return null;
  return target;
}

function aiGalleryImageIdFromReference(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let pathname = "";
  try {
    pathname = new URL(text, "http://local").pathname;
  } catch {
    return "";
  }
  const match = pathname.match(/^\/api\/ai\/gallery\/image\/([^/]+)$/i);
  const id = match ? decodeURIComponent(match[1] || "") : "";
  return /^[a-f0-9]{8,40}$/i.test(id) ? id : "";
}

async function readAiGalleryImageReference(value, userId = "") {
  const id = aiGalleryImageIdFromReference(value);
  if (!id) return null;
  const index = await readAiGalleryIndex();
  const item = index.items.find((entry) => String(entry.id || "") === id);
  if (!item) return null;
  if (item?.account?.id && userId && String(item.account.id) !== String(userId)) return null;
  const filePath = safeAiGalleryImagePath(item);
  if (!filePath || !existsSync(filePath)) return null;
  const buffer = await readFile(filePath);
  if (!buffer.length) return null;
  const mime = item.mime || imageMimeFromExt(extname(filePath));
  return {
    buffer,
    mime,
    fileName: item.fileName || basename(filePath) || `gallery-${id}.${imageExtFromMime(mime)}`
  };
}

function addGeneratedBase64Asset(assets, base64, mime = "image/png") {
  const value = String(base64 || "").trim();
  if (!value) return;
  const dataUrlMatch = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([\s\S]+)$/i);
  const actualMime = dataUrlMatch ? dataUrlMatch[1].toLowerCase().replace("image/jpg", "image/jpeg") : String(mime || "image/png").toLowerCase();
  const payload = dataUrlMatch ? dataUrlMatch[2] : value;
  const buffer = Buffer.from(payload.replace(/\s+/g, ""), "base64");
  if (!buffer.length) return;
  assets.push({
    buffer,
    mime: actualMime,
    ext: imageExtFromMime(actualMime)
  });
}

function addGeneratedUrlAsset(assets, url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return;
  assets.push({ url: value });
}

function collectGeneratedImageAssets(data) {
  const assets = [];
  const collectBase64 = (value, mime = "image/png") => {
    if (Array.isArray(value)) value.forEach((item) => collectBase64(item, mime));
    else if (typeof value === "string") addGeneratedBase64Asset(assets, value, mime);
  };
  const collectUrl = (value) => {
    if (Array.isArray(value)) value.forEach(collectUrl);
    else if (typeof value === "string") addGeneratedUrlAsset(assets, value);
  };

  collectBase64(data?.data?.image_base64, "image/jpeg");
  collectBase64(data?.image_base64, "image/jpeg");
  collectUrl(data?.data?.image_urls);
  collectUrl(data?.image_urls);
  collectUrl(data?.data?.outputs);
  collectUrl(data?.outputs);

  const imageObjects = data?.images || data?.data?.images || [];
  if (Array.isArray(imageObjects)) {
    imageObjects.forEach((item) => {
      if (typeof item === "string") {
        /^https?:\/\//i.test(item) ? addGeneratedUrlAsset(assets, item) : addGeneratedBase64Asset(assets, item, "image/png");
        return;
      }
      addGeneratedUrlAsset(assets, item?.url || item?.image_url || item?.image_file);
      addGeneratedBase64Asset(assets, item?.data || item?.base64 || item?.image_base64 || item?.b64_json, item?.mimeType || item?.mime_type || "image/png");
    });
  }
  return assets;
}

async function resolveGeneratedArchiveAsset(asset) {
  if (asset?.buffer?.length) return asset;
  if (!asset?.url) return null;
  const upstream = await fetchWithTimeout(asset.url, {}, 45000, "AI 结果图下载");
  if (!upstream.ok) throw createHttpError(upstream.status || 502, `AI 结果图下载失败：HTTP ${upstream.status}`);
  const mime = String(upstream.headers.get("content-type") || "image/png").split(";")[0].toLowerCase();
  if (!mime.startsWith("image/")) return null;
  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (!buffer.length) return null;
  return {
    buffer,
    mime,
    ext: imageExtFromMime(mime),
    sourceUrl: asset.url
  };
}

function remoteImageBedConfig(config) {
  return normalizeRemoteImageBedConfig(mergeIntranetConfig(config || {}).ai?.remoteImageBed || {});
}

function isRemoteImageBedReady(config) {
  const bed = remoteImageBedConfig(config);
  return Boolean(bed.enabled && bed.owner && bed.repo && bed.token && (bed.apiBaseUrl || remoteImageStorageApiBase));
}

function remoteStorageHeaders(token, extra = {}) {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": "ai-canvas-remote-storage",
    ...extra
  };
}

async function remoteImageBedFetch(bed, apiPath, options = {}) {
  const { timeoutMs, headers, ...fetchOptions } = options;
  const base = String(bed?.apiBaseUrl || remoteImageStorageApiBase || "").trim().replace(/\/+$/, "");
  if (!base) throw createHttpError(400, "远程图片存储未配置接口地址。");
  const path = String(apiPath || "").startsWith("/") ? String(apiPath) : `/${String(apiPath || "")}`;
  const response = await fetchWithTimeout(`${base}${path}`, {
    ...fetchOptions,
    headers: remoteStorageHeaders(bed.token, headers || {})
  }, Number(timeoutMs || 30000), "远程图片存储");
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw createHttpError(response.status, `远程图片存储请求失败：${data?.message || data?.raw || response.status}`);
  }
  return data;
}

function remoteStorageApiPath(owner, repo, path, branch = "") {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const query = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}${query}`;
}

function remoteStorageRawUrl(owner, repo, path, branch = "main", bed = {}) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  if (!owner || !repo || !cleanPath) return "";
  const base = String(bed?.rawBaseUrl || remoteImageStorageRawBase || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  const safeBranch = String(branch || "main").trim() || "main";
  return `${base}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(safeBranch)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function withRemoteImageBedWriteLock(task) {
  const run = remoteImageBedWriteLock.then(task, task);
  remoteImageBedWriteLock = run.catch(() => {});
  return run;
}

function isRemoteImageBedWriteConflict(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || "");
  return status === 409
    || /but expected|reference update failed|sha wasn't supplied|does not match|already exists/i.test(message);
}

async function remoteImageBedBackoff(attempt) {
  await new Promise((resolve) => setTimeout(resolve, 600 * Math.max(1, Number(attempt || 1))));
}

function datedRemoteImagePath(bed, options = {}) {
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const ext = imageExtFromMime(options.mime || "image/png");
  const sourceName = safeFileBase(options.name || options.fileName || `image-${options.index || 1}`);
  const hash = createHash("sha1")
    .update(`${options.jobId || ""}:${options.index || 0}:${Date.now()}:${randomUUID()}:${sourceName}`)
    .digest("hex")
    .slice(0, 10);
  return [
    bed.basePath,
    yyyy,
    mm,
    dd,
    `${String(options.index || 1).padStart(2, "0")}-${sourceName}-${hash}.${ext}`
  ].filter(Boolean).join("/");
}

async function uploadRemoteImageBedBuffer(config, buffer, options = {}) {
  if (!buffer?.length || !isRemoteImageBedReady(config)) return null;
  const bed = remoteImageBedConfig(config);
  return withRemoteImageBedWriteLock(async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const path = datedRemoteImagePath(bed, options);
      const body = {
        message: `Add AI Canvas image ${path}`,
        content: buffer.toString("base64"),
        branch: bed.branch
      };
      try {
        const data = await remoteImageBedFetch(bed, remoteStorageApiPath(bed.owner, bed.repo, path), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs: 45000
        });
        return {
          owner: bed.owner,
          repo: bed.repo,
          branch: bed.branch,
          path,
          sha: data?.content?.sha || "",
          htmlUrl: data?.content?.html_url || "",
          apiUrl: data?.content?.url || "",
          rawUrl: remoteStorageRawUrl(bed.owner, bed.repo, path, bed.branch, bed),
          remoteUrl: `remote://${bed.owner}/${bed.repo}/${path}`
        };
      } catch (error) {
        lastError = error;
        if (!isRemoteImageBedWriteConflict(error) || attempt >= 4) throw error;
        await remoteImageBedBackoff(attempt);
      }
    }
    throw lastError || createHttpError(502, "远程图片存储上传失败。");
  });
}

async function deleteRemoteImageBedUpload(config, upload) {
  if (!upload?.path || !upload?.sha) return false;
  const bed = remoteImageBedConfig(config);
  const owner = String(upload.owner || bed.owner || "").trim();
  const repo = String(upload.repo || bed.repo || "").trim();
  const branch = String(upload.branch || bed.branch || "main").trim() || "main";
  if (!bed.token || !owner || !repo) return false;
  return withRemoteImageBedWriteLock(async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await remoteImageBedFetch({ ...bed, owner, repo, branch }, remoteStorageApiPath(owner, repo, upload.path), {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
        message: `Remove temporary AI Canvas image ${upload.path}`,
            sha: upload.sha,
            branch
          }),
          timeoutMs: 45000
        });
        return true;
      } catch (error) {
        if (error?.statusCode === 404) return true;
        if (!isRemoteImageBedWriteConflict(error) || attempt >= 4) throw error;
        await remoteImageBedBackoff(attempt);
      }
    }
    return true;
  });
}

function normalizeRemoteImageBedCleanupUpload(upload = {}) {
  const path = String(upload.path || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  const sha = String(upload.sha || "").trim();
  const owner = String(upload.owner || "").trim();
  const repo = String(upload.repo || "").trim();
  const branch = String(upload.branch || "main").trim() || "main";
  if (!path || !sha) return null;
  return {
    owner,
    repo,
    branch,
    path,
    sha,
    rawUrl: String(upload.rawUrl || upload.raw_url || "").trim(),
    htmlUrl: String(upload.htmlUrl || upload.html_url || "").trim(),
    remoteUrl: String(upload.remoteUrl || upload.remote_url || "").trim()
  };
}

function remoteImageBedCleanupKey(upload = {}) {
  return [
    String(upload.owner || "").trim().toLowerCase(),
    String(upload.repo || "").trim().toLowerCase(),
    String(upload.branch || "main").trim().toLowerCase() || "main",
    String(upload.path || "").replace(/\\/g, "/").replace(/^\/+/, "").trim()
  ].join("|");
}

function remoteImageBedCleanupDelay(reason = "success") {
  return reason === "success" ? remoteImageBedSuccessCleanupDelayMs : remoteImageBedFailureCleanupDelayMs;
}

function remoteImageBedCleanupTime(value, fallback = Date.now()) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : fallback;
}

function serializeRemoteImageBedCleanupQueue() {
  return {
    version: 1,
    updatedAt: nowIso(),
    successDelayMs: remoteImageBedSuccessCleanupDelayMs,
    failureDelayMs: remoteImageBedFailureCleanupDelayMs,
    retryDelayMs: remoteImageBedCleanupRetryDelayMs,
    maxAttempts: remoteImageBedCleanupMaxAttempts,
    items: remoteImageBedCleanupState.queue
  };
}

async function loadRemoteImageBedCleanupQueueUnsafe() {
  if (remoteImageBedCleanupState.loaded) return;
  await mkdir(imageBedCleanupDir, { recursive: true });
  try {
    const raw = await readFile(remoteImageBedCleanupQueuePath, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    remoteImageBedCleanupState.queue = list
      .map((item) => {
        const upload = normalizeRemoteImageBedCleanupUpload(item?.upload || item);
        if (!upload) return null;
        return {
          id: String(item?.id || randomUUID()),
          upload,
          reason: item?.reason === "success" ? "success" : "failure",
          createdAt: String(item?.createdAt || nowIso()),
          notBefore: String(item?.notBefore || item?.deleteAfter || nowIso()),
          attempts: Math.max(0, Number(item?.attempts || 0)),
          lastAttemptAt: String(item?.lastAttemptAt || ""),
          lastError: String(item?.lastError || ""),
          abandonedAt: String(item?.abandonedAt || "")
        };
      })
      .filter(Boolean);
  } catch {
    remoteImageBedCleanupState.queue = [];
  }
  remoteImageBedCleanupState.loaded = true;
}

async function saveRemoteImageBedCleanupQueueUnsafe() {
  await mkdir(imageBedCleanupDir, { recursive: true });
  await writeFile(remoteImageBedCleanupQueuePath, JSON.stringify(serializeRemoteImageBedCleanupQueue(), null, 2), "utf8");
}

async function withRemoteImageBedCleanupLock(task) {
  const run = remoteImageBedCleanupState.lock.then(task, task);
  remoteImageBedCleanupState.lock = run.catch(() => {});
  return run;
}

function nextRemoteImageBedCleanupDelay() {
  const now = Date.now();
  const active = remoteImageBedCleanupState.queue
    .filter((item) => !item.abandonedAt)
    .map((item) => Math.max(1000, remoteImageBedCleanupTime(item.notBefore, now) - now));
  if (!active.length) return 60 * 60 * 1000;
  return Math.min(...active);
}

function scheduleRemoteImageBedCleanupRun(delayMs = 1000) {
  const delay = Math.max(1000, Math.min(Number(delayMs || 1000), 2 ** 31 - 1));
  if (remoteImageBedCleanupState.timer) clearTimeout(remoteImageBedCleanupState.timer);
  remoteImageBedCleanupState.timer = setTimeout(() => {
    remoteImageBedCleanupState.timer = null;
    void processRemoteImageBedCleanupQueue();
  }, delay);
  if (typeof remoteImageBedCleanupState.timer.unref === "function") {
    remoteImageBedCleanupState.timer.unref();
  }
}

async function queueTemporaryRemoteImageBedCleanup(uploads = [], options = {}) {
  const list = Array.isArray(uploads) ? uploads : [];
  const normalized = list.map(normalizeRemoteImageBedCleanupUpload).filter(Boolean);
  if (!normalized.length) return { queued: 0 };
  const reason = options.reason === "success" ? "success" : "failure";
  const deleteAfterMs = remoteImageBedCleanupDelay(reason);
  const now = Date.now();
  const notBefore = new Date(now + deleteAfterMs).toISOString();
  const queued = await withRemoteImageBedCleanupLock(async () => {
    await loadRemoteImageBedCleanupQueueUnsafe();
    const byKey = new Map(remoteImageBedCleanupState.queue.map((item) => [remoteImageBedCleanupKey(item.upload), item]));
    for (const upload of normalized) {
      const key = remoteImageBedCleanupKey(upload);
      const existing = byKey.get(key);
      if (existing) {
        existing.upload = { ...existing.upload, ...upload };
        existing.reason = reason;
        existing.notBefore = new Date(Math.min(remoteImageBedCleanupTime(existing.notBefore, now + deleteAfterMs), now + deleteAfterMs)).toISOString();
        existing.abandonedAt = "";
        continue;
      }
      const item = {
        id: randomUUID(),
        upload,
        reason,
        createdAt: nowIso(),
        notBefore,
        attempts: 0,
        lastAttemptAt: "",
        lastError: "",
        abandonedAt: "",
        jobId: String(options.jobId || ""),
        userId: String(options.userId || "")
      };
      remoteImageBedCleanupState.queue.push(item);
      byKey.set(key, item);
    }
    await saveRemoteImageBedCleanupQueueUnsafe();
    return normalized.length;
  });
  scheduleRemoteImageBedCleanupRun(nextRemoteImageBedCleanupDelay());
  return { queued };
}

async function deleteTemporaryRemoteImageBedUploadsNow(config, uploads = []) {
  const list = Array.isArray(uploads) ? uploads : [];
  const seen = new Set();
  for (const upload of list) {
    const key = `${upload?.owner || ""}/${upload?.repo || ""}/${upload?.path || ""}`;
    if (!upload?.path || seen.has(key)) continue;
    seen.add(key);
    await deleteRemoteImageBedUpload(config, upload).catch((error) => {
      console.warn("远程图片存储临时文件删除失败：", error.message || error);
    });
  }
}

async function processRemoteImageBedCleanupQueue() {
  if (remoteImageBedCleanupState.running) return;
  remoteImageBedCleanupState.running = true;
  try {
    await withRemoteImageBedCleanupLock(async () => {
      await loadRemoteImageBedCleanupQueueUnsafe();
      const now = Date.now();
      const config = await loadIntranetConfig().catch(() => defaultIntranetConfig());
      const remaining = [];
      let changed = false;

      for (const item of remoteImageBedCleanupState.queue) {
        if (item.abandonedAt || remoteImageBedCleanupTime(item.notBefore, now) > now) {
          remaining.push(item);
          continue;
        }

        item.lastAttemptAt = nowIso();
        try {
          const deleted = await deleteRemoteImageBedUpload(config, item.upload);
          if (!deleted) throw new Error("远程图片存储清理缺少令牌、路径或版本标识。");
          changed = true;
          console.log(`远程图片存储临时文件已清理：${item.upload.path}`);
        } catch (error) {
          item.attempts = Math.max(0, Number(item.attempts || 0)) + 1;
          item.lastError = error.message || String(error);
          changed = true;
          if (item.attempts >= remoteImageBedCleanupMaxAttempts) {
            item.abandonedAt = nowIso();
            console.warn(`远程图片存储临时文件清理放弃：${item.upload.path}，${item.lastError}`);
          } else {
            const backoff = remoteImageBedCleanupRetryDelayMs * Math.min(item.attempts, 6);
            item.notBefore = new Date(now + backoff).toISOString();
          }
          remaining.push(item);
        }
      }

      remoteImageBedCleanupState.queue = remaining;
      if (changed) await saveRemoteImageBedCleanupQueueUnsafe();
    });
  } finally {
    remoteImageBedCleanupState.running = false;
    await withRemoteImageBedCleanupLock(async () => {
      await loadRemoteImageBedCleanupQueueUnsafe();
      if (remoteImageBedCleanupState.queue.some((item) => !item.abandonedAt)) {
        scheduleRemoteImageBedCleanupRun(nextRemoteImageBedCleanupDelay());
      }
    }).catch(() => {});
  }
}

function objectStorageConfig(config) {
  return normalizeObjectStorageConfig(mergeIntranetConfig(config || {}).ai?.objectStorage || {});
}

function cloudSyncConfig(config) {
  return normalizeCloudSyncConfig(mergeIntranetConfig(config || {}).ai?.cloudSync || {});
}

function isObjectStorageReady(config) {
  const storage = objectStorageConfig(config);
  return Boolean(storage.enabled && storage.endpoint && storage.bucket && storage.accessKeyId && storage.secretAccessKey);
}

function isCloudSyncReady(config) {
  const cloud = cloudSyncConfig(config);
  return Boolean(cloud.enabled && isObjectStorageReady(config));
}

function awsUriEncode(value) {
  return encodeURIComponent(String(value || "")).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function awsCanonicalUri(pathname) {
  const text = String(pathname || "/");
  const parts = text.split("/").map(awsUriEncode);
  const joined = parts.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function awsCanonicalQuery(params = []) {
  return params
    .map(([key, value]) => [awsUriEncode(key), awsUriEncode(value)])
    .sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function objectStorageEndpointUrl(storage) {
  const endpoint = String(storage.endpoint || "").trim().replace(/\/+$/, "");
  if (!endpoint) throw createHttpError(400, "对象存储 Endpoint 未配置。");
  return new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`);
}

function objectStorageObjectUrl(storage, key) {
  const endpoint = objectStorageEndpointUrl(storage);
  const cleanKey = String(key || "").replace(/^\/+/, "");
  const encodedKey = cleanKey.split("/").map(awsUriEncode).join("/");
  if (storage.forcePathStyle !== false) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${awsUriEncode(storage.bucket)}/${encodedKey}`.replace(/\/{2,}/g, "/");
    return endpoint;
  }
  endpoint.hostname = `${storage.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${encodedKey}`.replace(/\/{2,}/g, "/");
  return endpoint;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function awsSigV4Date(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function awsSigV4SigningKey(secretAccessKey, dateStamp, region, service = "s3") {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function awsSigV4CredentialScope(dateStamp, region, service = "s3") {
  return `${dateStamp}/${region}/${service}/aws4_request`;
}

function awsSigV4CanonicalHeaders(headers) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(""),
    signedHeaders: entries.map(([key]) => key).join(";")
  };
}

function awsSigV4Signature({ method, url, queryParams = [], headers, payloadHash, accessKeyId, secretAccessKey, region, date = new Date(), includeDateHeader = true }) {
  const { amzDate, dateStamp } = awsSigV4Date(date);
  const scope = awsSigV4CredentialScope(dateStamp, region);
  const withDates = includeDateHeader ? { ...headers, "x-amz-date": amzDate } : { ...headers };
  const { canonicalHeaders, signedHeaders } = awsSigV4CanonicalHeaders(withDates);
  const canonicalRequest = [
    method,
    awsCanonicalUri(url.pathname || "/"),
    awsCanonicalQuery(queryParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = awsSigV4SigningKey(secretAccessKey, dateStamp, region);
  const signature = hmacSha256(signingKey, stringToSign, "hex");
  return { signature, amzDate, dateStamp, scope, signedHeaders };
}

function objectStorageDatedKey(storage, options = {}) {
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const ext = imageExtFromMime(options.mime || "image/png");
  const sourceName = safeFileBase(options.name || options.fileName || `image-${options.index || 1}`);
  const hash = createHash("sha1")
    .update(`${options.jobId || ""}:${options.index || 0}:${Date.now()}:${sourceName}`)
    .digest("hex")
    .slice(0, 12);
  return [
    storage.pathPrefix,
    yyyy,
    mm,
    dd,
    `${String(options.index || 1).padStart(2, "0")}-${sourceName}-${hash}.${ext}`
  ].filter(Boolean).join("/");
}

function normalizeObjectStorageKey(value) {
  const parts = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.slice(0, 180));
  return parts.slice(0, 32).join("/").slice(0, 900);
}

function cloudBackupKey(config, userId, kind, id, fileName = "") {
  const cloud = cloudSyncConfig(config);
  const safeKind = kind === "project" ? "projects" : "conversations";
  const safeUserId = safePathId(userId, "anonymous");
  const safeId = safePathId(id, "item");
  const safeFileName = fileName ? normalizeObjectStorageKey(basename(String(fileName))) : `${safeId}.json`;
  return normalizeObjectStorageKey([cloud.pathPrefix, safeUserId, safeKind, safeId, safeFileName].filter(Boolean).join("/"));
}

function cloudSyncAssetName(value) {
  const name = basename(String(value || "").trim());
  if (!name || !/^[a-z0-9][a-z0-9._-]{0,180}$/i.test(name)) return "";
  return name;
}

async function localCloudAssetNames(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function canvasCloudAssetNames(project = {}) {
  const text = JSON.stringify(project || {});
  const names = new Set();
  const pattern = /\/api\/canvas\/assets\/([^/?#"'\\]+)/gi;
  let match;
  while ((match = pattern.exec(text))) {
    let decoded = match[1];
    try { decoded = decodeURIComponent(decoded); } catch {}
    const name = cloudSyncAssetName(decoded);
    if (name) names.add(name);
  }
  return [...names];
}

async function uploadCloudSnapshot(config, options = {}) {
  const cloud = cloudSyncConfig(config);
  const kind = options.kind === "project" ? "project" : "conversation";
  const includeKind = kind === "project" ? cloud.includeProjects : cloud.includeConversations;
  if (!cloud.enabled || !includeKind || !isObjectStorageReady(config)) {
    return { status: "disabled" };
  }
  const snapshotKey = cloudBackupKey(config, options.userId, kind, options.id);
  const assetEntries = [];
  const assetDir = String(options.assetDir || "").trim();
  const requestedNames = Array.isArray(options.assetNames) ? options.assetNames : [];
  if (cloud.includeAssets && assetDir && requestedNames.length) {
    const root = normalize(assetDir);
    const seen = new Set();
    for (const candidate of requestedNames.slice(0, 240)) {
      const name = cloudSyncAssetName(candidate);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const filePath = normalize(join(root, name));
      const rootPrefix = root.endsWith("/") || root.endsWith("\\") ? root : `${root}${process.platform === "win32" ? "\\" : "/"}`;
      if (!filePath.startsWith(rootPrefix) && filePath !== root) continue;
      let fileStat;
      try { fileStat = await stat(filePath); } catch { continue; }
      if (!fileStat.isFile() || fileStat.size > maxImageUploadBytes) continue;
      const buffer = await readFile(filePath);
      if (!buffer.length) continue;
      const mime = mimeTypes[extname(filePath).toLowerCase()] || imageMimeFromExt(extname(filePath));
      const uploaded = await uploadObjectStorageBuffer(config, buffer, {
        key: cloudBackupKey(config, options.userId, kind, options.id, `assets/${name}`),
        mime,
        timeoutMs: cloud.timeoutSeconds * 1000
      });
      if (uploaded) assetEntries.push({ name, key: uploaded.key, mime, size: buffer.length });
    }
  }
  const snapshot = {
    version: 1,
    kind,
    id: safePathId(options.id, "item"),
    savedAt: nowIso(),
    assets: assetEntries,
    data: options.data || {}
  };
  const uploaded = await uploadObjectStorageBuffer(config, Buffer.from(JSON.stringify(snapshot, null, 2), "utf8"), {
    key: snapshotKey,
    mime: "application/json",
    timeoutMs: cloud.timeoutSeconds * 1000
  });
  return uploaded
    ? { status: "saved", key: uploaded.key, assetCount: assetEntries.length, savedAt: snapshot.savedAt }
    : { status: "disabled" };
}

function queueCloudSnapshot(options = {}) {
  const key = `${options.kind || "item"}:${safePathId(options.userId, "anonymous")}:${safePathId(options.id, "item")}`;
  const previous = cloudSnapshotLocks.get(key) || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => loadIntranetConfig())
    .then((config) => uploadCloudSnapshot(config, options));
  cloudSnapshotLocks.set(key, run);
  void run
    .then((result) => {
      if (result?.status === "saved") {
        console.info(`[cloud-sync] ${options.kind || "item"} ${safePathId(options.id, "item")} saved (${result.assetCount || 0} assets)`);
      }
    })
    .catch((error) => {
      console.error(`[cloud-sync] ${options.kind || "item"} ${safePathId(options.id, "item")} failed:`, error?.message || error);
    })
    .finally(() => {
      if (cloudSnapshotLocks.get(key) === run) cloudSnapshotLocks.delete(key);
    });
}

function presignObjectStorageGetUrl(storage, key, options = {}) {
  const url = objectStorageObjectUrl(storage, key);
  const now = new Date();
  const { amzDate, dateStamp } = awsSigV4Date(now);
  const region = storage.region || "auto";
  const scope = awsSigV4CredentialScope(dateStamp, region);
  const expires = Math.max(60, Math.min(604800, Math.round(Number(options.expiresSeconds || storage.expiresSeconds || 3600))));
  const queryParams = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${storage.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"]
  ];
  const { signature } = awsSigV4Signature({
    method: "GET",
    url,
    queryParams,
    headers: { host: url.host },
    payloadHash: "UNSIGNED-PAYLOAD",
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region,
    date: now,
    includeDateHeader: false
  });
  queryParams.push(["X-Amz-Signature", signature]);
  url.search = awsCanonicalQuery(queryParams);
  return url.toString();
}

async function uploadObjectStorageBuffer(config, buffer, options = {}) {
  if (!buffer?.length || !isObjectStorageReady(config)) return null;
  const storage = objectStorageConfig(config);
  const key = options.key ? normalizeObjectStorageKey(options.key) : objectStorageDatedKey(storage, options);
  if (!key) throw createHttpError(400, "对象存储对象路径无效。");
  const url = objectStorageObjectUrl(storage, key);
  const mime = String(options.mime || "image/png").split(";")[0].toLowerCase();
  const payloadHash = sha256Hex(buffer);
  const region = storage.region || "auto";
  const date = new Date();
  const signingHeaders = {
    host: url.host,
    "content-type": mime,
    "x-amz-content-sha256": payloadHash
  };
  const signed = awsSigV4Signature({
    method: "PUT",
    url,
    headers: signingHeaders,
    payloadHash,
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region,
    date
  });
  const response = await fetchWithTimeout(url.toString(), {
    method: "PUT",
    headers: {
      "content-type": mime,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": signed.amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.signature}`
    },
    body: buffer
  }, Number(options.timeoutMs || 45000), "对象存储上传");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createHttpError(response.status || 502, `对象存储上传失败：HTTP ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }
  return {
    provider: "s3-compatible",
    bucket: storage.bucket,
    key,
    endpoint: storage.endpoint,
    signedUrl: presignObjectStorageGetUrl(storage, key, options),
    expiresSeconds: storage.expiresSeconds,
    createdAt: nowIso()
  };
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function signedObjectStorageRequest(storage, method, url, queryParams = []) {
  const payloadHash = sha256Hex(Buffer.alloc(0));
  const region = storage.region || "auto";
  const date = new Date();
  const signingHeaders = {
    host: url.host,
    "x-amz-content-sha256": payloadHash
  };
  const signed = awsSigV4Signature({
    method,
    url,
    queryParams,
    headers: signingHeaders,
    payloadHash,
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region,
    date
  });
  url.search = awsCanonicalQuery(queryParams);
  return fetchWithTimeout(url.toString(), {
    method,
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": signed.amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.signature}`
    }
  }, 45000, "对象存储清理");
}

async function listObjectStorageKeys(storage, prefix, continuationToken = "") {
  const url = objectStorageObjectUrl(storage, "");
  const queryParams = [["list-type", "2"], ["prefix", prefix], ["max-keys", "1000"]];
  if (continuationToken) queryParams.push(["continuation-token", continuationToken]);
  const response = await signedObjectStorageRequest(storage, "GET", url, queryParams);
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw createHttpError(response.status || 502, `对象存储列表失败：HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const keys = [...text.matchAll(/<Key>([\s\S]*?)<\/Key>/gi)].map((match) => decodeXmlText(match[1]));
  const next = text.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/i);
  return { keys, continuationToken: next ? decodeXmlText(next[1]) : "" };
}

async function deleteObjectStorageKey(storage, key) {
  const url = objectStorageObjectUrl(storage, key);
  const response = await signedObjectStorageRequest(storage, "DELETE", url);
  if (response.ok || response.status === 404) return true;
  const text = await response.text().catch(() => "");
  throw createHttpError(response.status || 502, `对象存储删除失败：HTTP ${response.status} ${text.slice(0, 200)}`);
}

async function deleteObjectStoragePrefix(config, prefix) {
  if (!isObjectStorageReady(config)) return { deleted: 0, skipped: true };
  const storage = objectStorageConfig(config);
  let continuationToken = "";
  let deleted = 0;
  for (let page = 0; page < 100; page += 1) {
    const listed = await listObjectStorageKeys(storage, prefix, continuationToken);
    for (const key of listed.keys) {
      await deleteObjectStorageKey(storage, key);
      deleted += 1;
    }
    continuationToken = listed.continuationToken;
    if (!continuationToken) break;
  }
  return { deleted, skipped: false };
}

async function processDataDeletionQueue() {
  let entries = [];
  try {
    entries = await readdir(dataDeletionQueueDir, { withFileTypes: true });
  } catch {
    return;
  }
  const config = await loadIntranetConfig().catch(() => defaultIntranetConfig());
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).slice(0, 50)) {
    const filePath = join(dataDeletionQueueDir, entry.name);
    let request;
    try {
      request = JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      continue;
    }
    if (String(request.status || "").startsWith("completed")) continue;
    const userId = String(request.userId || "").trim();
    const safeUserId = safePathId(userId, "");
    if (!userId || !safeUserId) continue;
    try {
      let remoteDeleted = 0;
      for (const upload of Array.isArray(request.remoteImages) ? request.remoteImages : []) {
        const deleted = await deleteRemoteImageBedUpload(config, upload);
        if (!deleted) throw new Error("远程图片存储尚未配置，无法完成删除。");
        remoteDeleted += 1;
      }
      const cloud = cloudSyncConfig(config);
      let cloudResult = { deleted: 0, skipped: true };
      if (cloud.enabled) {
        const prefix = normalizeObjectStorageKey([cloud.pathPrefix, safeUserId].filter(Boolean).join("/"));
        cloudResult = await deleteObjectStoragePrefix(config, prefix ? `${prefix}/` : `${safeUserId}/`);
        if (cloudResult.skipped) throw new Error("云端同步已启用，但对象存储凭据不可用。");
      }
      request = {
        ...request,
        status: cloud.enabled ? "completed" : "completed-no-cloud-sync-configured",
        remoteImages: [],
        remoteDeleted,
        cloudDeleted: cloudResult.deleted,
        completedAt: nowIso(),
        updatedAt: nowIso(),
        lastError: ""
      };
    } catch (error) {
      request = {
        ...request,
        status: "pending-cloud-cleanup",
        attempts: Math.max(0, Number(request.attempts || 0)) + 1,
        lastError: String(error?.message || error).slice(0, 1000),
        updatedAt: nowIso()
      };
    }
    if (request.requestId) {
      await updateDataDeletionRequest(dataDeletionQueueDir, request.requestId, request);
    } else {
      await writeFile(filePath, JSON.stringify(request, null, 2), { encoding: "utf8", mode: 0o600 });
    }
  }
}

async function readDataRetentionState() {
  try {
    return JSON.parse(await readFile(dataRetentionStatePath, "utf8"));
  } catch {
    return {
      lastRunAt: "",
      lastStatus: "idle",
      lastError: "",
      lastResult: null
    };
  }
}

function automaticFailureLog(item = {}) {
  return item.logType === "automatic-failure"
    || Boolean(item.jobId && item.reasonType && item.rating === "down");
}

async function cleanupFeedbackByRetention(retention, now) {
  return withAiFeedbackLock(async () => {
    const store = await readAiFeedbackStore();
    const removed = [];
    const kept = [];
    for (const item of store.items) {
      const days = automaticFailureLog(item)
        ? retention.automaticFailureDays
        : retention.feedbackDays;
      if (dataOlderThanDays(item.updatedAt || item.createdAt, days, now)) {
        removed.push(item);
      } else {
        kept.push(item);
      }
    }
    for (const item of removed) {
      const itemId = safePathId(item.id, "");
      if (!itemId) continue;
      await rm(join(aiFeedbackAssetsDir, itemId), { recursive: true, force: true }).catch(() => {});
    }
    if (removed.length) {
      await writeAiFeedbackStore({ ...store, items: kept });
    }
    return {
      feedback: removed.filter((item) => !automaticFailureLog(item)).length,
      automaticFailures: removed.filter(automaticFailureLog).length
    };
  });
}

async function deleteCloudSnapshotPrefix(config, userId, kind, id) {
  const cloud = cloudSyncConfig(config);
  if (!cloud.enabled || !isObjectStorageReady(config)) return { deleted: 0, skipped: true };
  const snapshotKey = cloudBackupKey(config, userId, kind, id);
  const prefix = `${dirname(snapshotKey).replace(/\/+$/, "")}/`;
  return deleteObjectStoragePrefix(config, prefix);
}

async function cleanupConversationsByRetention(config, retention, now) {
  const result = { conversations: 0, cloudObjects: 0, cloudErrors: 0 };
  let users = [];
  try {
    users = await readdir(aiConversationsDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of users.filter((item) => item.isDirectory()).slice(0, 500)) {
    const userId = safePathId(entry.name, "");
    if (!userId || userId !== entry.name) continue;
    const index = await readAiConversationIndex(userId);
    const stale = index.items.filter((item) => dataOlderThanDays(
      item.updatedAt || item.createdAt,
      retention.conversationsDays,
      now
    ));
    if (!stale.length) continue;
    const staleIds = new Set(stale.map((item) => safePathId(item.id, "")).filter(Boolean));
    for (const conversationId of staleIds) {
      await rm(aiConversationFilePath(userId, conversationId), { force: true }).catch(() => {});
      await rm(join(aiConversationUserDir(userId), conversationId), { recursive: true, force: true }).catch(() => {});
      result.conversations += 1;
      try {
        const cloud = await deleteCloudSnapshotPrefix(config, userId, "conversation", conversationId);
        result.cloudObjects += Number(cloud.deleted || 0);
      } catch {
        result.cloudErrors += 1;
      }
    }
    await writeAiConversationIndex(userId, {
      items: index.items.filter((item) => !staleIds.has(safePathId(item.id, "")))
    });
  }
  return result;
}

async function referencedCanvasAssetNames(projectsDir) {
  const names = new Set();
  let entries = [];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return names;
  }
  const pattern = /\/api\/canvas\/assets\/([^/?#"'\\]+)/gi;
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).slice(0, 1000)) {
    const text = await readFile(join(projectsDir, entry.name), "utf8").catch(() => "");
    let match;
    while ((match = pattern.exec(text))) {
      let decoded = match[1];
      try { decoded = decodeURIComponent(decoded); } catch {}
      const name = basename(decoded);
      if (/^[a-z0-9][a-z0-9._-]{0,180}$/i.test(name)) names.add(name);
    }
    pattern.lastIndex = 0;
  }
  return names;
}

async function cleanupCanvasByRetention(config, retention, now) {
  const result = { projects: 0, assets: 0, rembgJobs: 0, cloudObjects: 0, cloudErrors: 0 };
  let users = [];
  try {
    users = await readdir(canvasProjectsDir, { withFileTypes: true });
  } catch {
    users = [];
  }
  for (const entry of users.filter((item) => item.isDirectory()).slice(0, 500)) {
    const userId = safePathId(entry.name, "");
    if (!userId || userId !== entry.name) continue;
    const projectsDir = join(canvasProjectsDir, userId);
    let projectEntries = [];
    try {
      projectEntries = await readdir(projectsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const projectEntry of projectEntries.filter((item) => item.isFile() && item.name.endsWith(".json")).slice(0, 1000)) {
      const path = join(projectsDir, projectEntry.name);
      const raw = await readFile(path, "utf8").catch(() => "");
      let project = {};
      try { project = JSON.parse(raw); } catch {}
      const fileStat = await stat(path).catch(() => null);
      const timestamp = project.updatedAt || fileStat?.mtime || "";
      if (!dataOlderThanDays(timestamp, retention.canvasProjectsDays, now)) continue;
      const projectId = safePathId(project.id || projectEntry.name.replace(/\.json$/i, ""), "");
      await rm(path, { force: true }).catch(() => {});
      result.projects += 1;
      if (projectId) {
        try {
          const cloud = await deleteCloudSnapshotPrefix(config, userId, "project", projectId);
          result.cloudObjects += Number(cloud.deleted || 0);
        } catch {
          result.cloudErrors += 1;
        }
      }
    }

    const referencedAssets = await referencedCanvasAssetNames(projectsDir);
    const assetsDir = join(canvasAssetsDir, userId);
    let assetEntries = [];
    try {
      assetEntries = await readdir(assetsDir, { withFileTypes: true });
    } catch {
      assetEntries = [];
    }
    for (const assetEntry of assetEntries.filter((item) => item.isFile()).slice(0, 5000)) {
      if (referencedAssets.has(assetEntry.name)) continue;
      const path = join(assetsDir, assetEntry.name);
      const fileStat = await stat(path).catch(() => null);
      if (!fileStat || !dataOlderThanDays(fileStat.mtime, retention.canvasProjectsDays, now)) continue;
      await rm(path, { force: true }).catch(() => {});
      result.assets += 1;
    }
  }

  const rembgRoot = join(canvasBetaDir, "rembg");
  let rembgUsers = [];
  try {
    rembgUsers = await readdir(rembgRoot, { withFileTypes: true });
  } catch {
    rembgUsers = [];
  }
  for (const userEntry of rembgUsers.filter((item) => item.isDirectory()).slice(0, 500)) {
    const userDir = join(rembgRoot, userEntry.name);
    let jobs = [];
    try {
      jobs = await readdir(userDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const job of jobs.filter((item) => item.isDirectory()).slice(0, 2000)) {
      const path = join(userDir, job.name);
      const jobStat = await stat(path).catch(() => null);
      if (!jobStat || !dataOlderThanDays(jobStat.mtime, retention.canvasProjectsDays, now)) continue;
      await rm(path, { recursive: true, force: true }).catch(() => {});
      result.rembgJobs += 1;
    }
  }
  return result;
}

async function cleanupGalleryByRetention(retention, now) {
  return withAiGalleryLock(async () => {
    const index = await readAiGalleryIndex();
    const removed = index.items.filter((item) => dataOlderThanDays(
      item.createdAt,
      retention.generatedImagesDays,
      now
    ));
    if (!removed.length) return { generatedImages: 0, remoteCleanupQueued: 0 };
    const removedIds = new Set(removed.map((item) => item.id));
    const remoteImages = [];
    for (const item of removed) {
      const path = safeAiGalleryImagePath(item);
      if (path) await rm(path, { force: true }).catch(() => {});
      if (item.remoteImageBed) remoteImages.push(item.remoteImageBed);
    }
    await writeAiGalleryIndex({
      ...index,
      items: index.items.filter((item) => !removedIds.has(item.id))
    });
    const queued = await queueTemporaryRemoteImageBedCleanup(remoteImages, {
      reason: "success",
      jobId: "data-retention"
    }).catch(() => ({ queued: 0 }));
    return {
      generatedImages: removed.length,
      remoteCleanupQueued: Number(queued.queued || 0)
    };
  });
}

async function runDataRetentionCleanup(options = {}) {
  const config = options.config || await loadIntranetConfig().catch(() => defaultIntranetConfig());
  const privacy = normalizePrivacyConfig(config.privacy);
  const retention = privacy.retention;
  if (!retention.enabled) return { status: "disabled" };
  const state = await readDataRetentionState();
  const lastRun = new Date(state.lastRunAt || 0).getTime();
  const intervalMs = retention.cleanupIntervalHours * 60 * 60 * 1000;
  if (!options.force && Number.isFinite(lastRun) && lastRun > Date.now() - intervalMs) {
    return { status: "not-due", lastRunAt: state.lastRunAt, lastResult: state.lastResult || null };
  }
  const startedAt = nowIso();
  try {
    const now = Date.now();
    const [feedback, conversations, canvas, gallery] = await Promise.all([
      cleanupFeedbackByRetention(retention, now),
      cleanupConversationsByRetention(config, retention, now),
      cleanupCanvasByRetention(config, retention, now),
      cleanupGalleryByRetention(retention, now)
    ]);
    const result = {
      status: "completed",
      startedAt,
      completedAt: nowIso(),
      retention,
      removed: { ...feedback, ...conversations, ...canvas, ...gallery }
    };
    await writePrivateJsonAtomic(dataRetentionStatePath, {
      lastRunAt: result.completedAt,
      lastStatus: "completed",
      lastError: "",
      lastResult: result
    });
    return result;
  } catch (error) {
    await writePrivateJsonAtomic(dataRetentionStatePath, {
      lastRunAt: nowIso(),
      lastStatus: "failed",
      lastError: String(error?.message || error).slice(0, 1000),
      lastResult: null
    }).catch(() => {});
    throw error;
  }
}

function parseRemoteImageReference(value) {
  const direct = value?.remoteImageBed || value?.remote || null;
  if (direct?.owner && direct?.repo && direct?.path) {
    return {
      owner: String(direct.owner || direct.namespace).trim(),
      repo: String(direct.repo || direct.project).trim(),
      branch: String(direct.branch || direct.revision || "").trim(),
      path: String(direct.path || "").replace(/^\/+/, "")
    };
  }
  const text = String(value?.image_file || value?.url || value || "").trim();
  if (!text) return null;
  let match = text.match(/^remote:\/\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (match) {
    return { owner: match[1], repo: match[2], branch: "", path: match[3].replace(/^\/+/, "") };
  }
  return null;
}

async function readRemoteImageBedReference(value) {
  const ref = parseRemoteImageReference(value);
  if (!ref) return null;
  const config = await loadIntranetConfig();
  const bed = remoteImageBedConfig(config);
  const token = bed.token || normalizeApiKey(process.env.REMOTE_IMAGE_STORAGE_TOKEN || "");
  if (!token) throw createHttpError(400, "远程图片存储未配置访问令牌。");
  const branch = ref.branch || bed.branch || "main";
  const data = await remoteImageBedFetch({ ...bed, token }, remoteStorageApiPath(ref.owner, ref.repo, ref.path, branch), { timeoutMs: 30000 });
  const content = String(data?.content || "").replace(/\s+/g, "");
  if (!content) return null;
  const buffer = Buffer.from(content, "base64");
  if (!buffer.length) return null;
  const mime = imageMimeFromExt(extname(ref.path).toLowerCase());
  return {
    buffer,
    mime,
    fileName: basename(ref.path) || `remote-reference.${imageExtFromMime(mime)}`
  };
}

async function archiveAiImageGeneration(jobId, item, data) {
  const assets = collectGeneratedImageAssets(data);
  if (!assets.length) return { savedCount: 0, totalCount: 0 };
  return withAiGalleryLock(async () => {
    const config = await loadIntranetConfig();
    const index = await readAiGalleryIndex();
    const createdAt = nowIso();
    const safeJobId = String(jobId || `${Date.now()}`).replace(/[^a-z0-9-]/gi, "-");
    const outputDir = join(aiGalleryImageDir, safeJobId);
    await mkdir(outputDir, { recursive: true });
    const saved = [];
    const errors = [];

    for (let i = 0; i < assets.length; i += 1) {
      const asset = await resolveGeneratedArchiveAsset(assets[i]).catch((error) => {
        errors.push(`第 ${i + 1} 张：${error.message || String(error)}`);
        return null;
      });
      if (!asset?.buffer?.length) continue;
      const ext = imageExtFromMime(asset.mime || "image/png");
      const fileName = `${String(i + 1).padStart(2, "0")}.${ext}`;
      const filePath = join(outputDir, fileName);
      await writeFile(filePath, asset.buffer);
      const remoteImageBed = remoteImageBedConfig(config).archiveEnabled
        ? await uploadRemoteImageBedBuffer(config, asset.buffer, {
            mime: asset.mime || imageMimeFromExt(ext),
            jobId: safeJobId,
            index: i + 1,
            name: item.account?.username || item.account?.displayName || fileName
          }).catch(() => null)
        : null;
      const id = createHash("sha1").update(`${safeJobId}:${i + 1}:${createdAt}`).digest("hex").slice(0, 20);
      saved.push({
        id,
        jobId: safeJobId,
        provider: data?.provider || item.provider || "",
        model: data?.model || item.model || "",
        prompt: String(item.prompt || "").slice(0, 1200),
        account: item.account || null,
        fileName,
        relativePath: `images/${safeJobId}/${fileName}`,
        mime: asset.mime || imageMimeFromExt(ext),
        bytes: asset.buffer.length,
        referenceCount: Number(item.referenceCount || data?.metadata?.referenceCount || 0),
        sourceUrl: asset.sourceUrl || "",
        remoteImageBed,
        createdAt
      });
    }

    if (!saved.length) {
      return {
        savedCount: 0,
        totalCount: index.totalGenerated || 0,
        error: errors.join("；") || "AI 结果图没有可保存的图片数据。"
      };
    }
    const items = [...saved, ...index.items].slice(0, 1000);
    await writeAiGalleryIndex({
      version: 1,
      totalGenerated: Number(index.totalGenerated || 0) + saved.length,
      items
    });
    return {
      savedCount: saved.length,
      totalCount: Number(index.totalGenerated || 0) + saved.length,
      items: saved.map((entry) => ({
        id: entry.id,
        provider: entry.provider,
        fileName: entry.fileName,
        relativePath: entry.relativePath,
        mime: entry.mime,
        bytes: entry.bytes,
        sourceUrl: entry.sourceUrl || "",
        url: `/api/ai/gallery/image/${encodeURIComponent(entry.id)}`,
        image_file: `/api/ai/gallery/image/${encodeURIComponent(entry.id)}`,
        remoteImageBed: entry.remoteImageBed || null,
        createdAt: entry.createdAt
      }))
    };
  });
}

function applyArchivedImageUrls(data, archive) {
  const items = Array.isArray(archive?.items) ? archive.items : [];
  if (!items.length || !data || typeof data !== "object") return data;
  const patchList = (list) => {
    if (!Array.isArray(list)) return;
    for (let index = 0; index < Math.min(list.length, items.length); index += 1) {
      const entry = items[index];
      const url = entry?.url || entry?.image_file || "";
      if (!url || !list[index] || typeof list[index] !== "object") continue;
      list[index].url = url;
      list[index].image_file = url;
      list[index].localUrl = url;
      list[index].archiveId = entry.id || "";
    }
  };
  patchList(data.images);
  patchList(data.data?.images);
  if (Array.isArray(data.data)) {
    for (let index = 0; index < Math.min(data.data.length, items.length); index += 1) {
      const entry = items[index];
      const url = entry?.url || "";
      if (!url || !data.data[index] || typeof data.data[index] !== "object") continue;
      data.data[index].url = url;
      data.data[index].localUrl = url;
      data.data[index].archiveId = entry.id || "";
    }
  }
  return data;
}

function collectPrimaryImageImages(data) {
  const images = [];
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  candidates.forEach((candidate) => {
    const parts = candidate?.content?.parts || candidate?.parts || [];
    if (!Array.isArray(parts)) return;
    parts.forEach((part) => {
      const inlineData = part?.inlineData || part?.inline_data;
      const bytes = inlineData?.data;
      if (!bytes) return;
      images.push({
        mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
        data: bytes
      });
    });
  });
  return images;
}

function collectPrimaryImageText(data) {
  const texts = [];
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  candidates.forEach((candidate) => {
    const parts = candidate?.content?.parts || candidate?.parts || [];
    if (!Array.isArray(parts)) return;
    parts.forEach((part) => {
      if (part?.text) texts.push(String(part.text));
    });
  });
  return texts.join("\n").trim();
}

function dataUrlToInlineData(value) {
  const text = String(value || "").trim();
  const match = text.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  return {
    inlineData: {
      mimeType,
      data: match[2].replace(/\s/g, "")
    }
  };
}

function normalizeApiKey(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").trim().replace(/^Bearer\s+/i, "").trim();
}

function normalizeAiUserKeys(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const read = (field) => {
    const raw = String(source[field] || "").trim();
    return raw === "__configured__" ? "" : normalizeApiKey(raw);
  };
  return {
    primaryImageApiKey: read("primaryImageApiKey") || read("primaryApiKey"),
    secondaryImageApiKey: read("secondaryImageApiKey"),
    textServiceBApiKey: read("textServiceBApiKey"),
    textServiceCApiKey: read("textServiceCApiKey")
  };
}

function aiKeyForProvider(providerId, ai = {}, includeEnv = false) {
  const id = String(providerId || "imageservice").toLowerCase();
  let key = "";
  if (id === "primaryimage" || id === "imageservice" || id === "responsesimage") {
    key = ai.primaryImageApiKey;
    if (!key && includeEnv) key = process.env.PRIMARY_IMAGE_API_KEY || process.env.PRIMARY_IMAGE_API_KEY;
  } else if (id === "secondaryimage") {
    key = ai.secondaryImageApiKey;
    if (!key && includeEnv) key = process.env.SECONDARY_IMAGE_API_KEY;
  } else if (id === "textserviceb") {
    key = ai.textServiceBApiKey;
    if (!key && includeEnv) key = process.env.TEXT_SERVICE_B_API_KEY;
  } else if (id === "textservicec") {
    key = ai.textServiceCApiKey;
    if (!key && includeEnv) key = process.env.TEXT_SERVICE_C_API_KEY;
  }
  return normalizeApiKey(key);
}

function configuredAiUserKeyForUser(providerId, user = null) {
  if (!user) return "";
  return aiKeyForProvider(providerId, normalizeAiUserKeys(user.aiKeys || {}), false);
}

function configuredAiGroupKeyForUser(config, user = null) {
  const safe = mergeIntranetConfig(config || {});
  const info = normalizeUserBillingGroup(user || {});
  if (!info.groupId && !info.groupName && !info.department) return null;
  const groups = normalizeAiGroupKeyConfigs(safe.ai?.groupKeys || []).filter((item) => item.enabled !== false);
  return groups.find((item) => info.groupId && item.id === info.groupId)
    || groups.find((item) => info.groupName && item.name === info.groupName && (!info.department || !item.department || item.department === info.department))
    || groups.find((item) => info.groupName && item.name === info.groupName)
    || groups.find((item) => info.department && item.department === info.department)
    || null;
}

function hasAnyConfiguredAiKey(providerId, config) {
  const safe = mergeIntranetConfig(config || {});
  if (aiKeyForProvider(providerId, safe.ai || {}, true)) return true;
  return normalizeAiGroupKeyConfigs(safe.ai?.groupKeys || [])
    .some((item) => item.enabled !== false && Boolean(aiKeyForProvider(providerId, item, false)));
}

function resolveConfiguredAiKey(providerId, config, user = null) {
  const safe = mergeIntranetConfig(config || {});
  const ai = safe.ai || {};
  const userKey = configuredAiUserKeyForUser(providerId, user);
  if (userKey) return userKey;
  const group = configuredAiGroupKeyForUser(safe, user);
  const groupKey = group ? aiKeyForProvider(providerId, group, false) : "";
  return groupKey || aiKeyForProvider(providerId, ai, true);
}

function configuredTextModel(providerId, config, fallback = "") {
  const safe = mergeIntranetConfig(config || {});
  const ai = safe.ai || {};
  const id = String(providerId || "imageservice").toLowerCase();
  if (id === "primaryimage") return String(ai.primaryTextModel || fallback || primaryImageImageModel).trim();
  if (id === "imageservice") {
    return String(ai.imageEditModel || ai.imageService2Model || fallback || defaultImageServiceEditModel).trim();
  }
  if (id === "secondaryimage") return String(fallback || defaultSecondaryApiImageModel).trim();
  if (id === "responsesimage") return String(ai.deepReasoningModel || ai.standardReasoningModel || fallback || defaultImageServicePlannerModel).trim();
  if (id === "textserviceb") return String(ai.textServiceBModel || fallback || "").trim();
  if (id === "textservicec") return String(ai.textServiceCModel || fallback || "").trim();
  return String(fallback || "").trim();
}

function publicAiConfig(config, user = null) {
  const safe = mergeIntranetConfig(config || {});
  const configured = (providerId) => Boolean(user
    ? resolveConfiguredAiKey(providerId, safe, user)
    : hasAnyConfiguredAiKey(providerId, safe));
  const billingGroup = normalizeUserBillingGroup(user || {});
  return {
    providers: {
      primaryimage: {
        configured: configured("primaryimage"),
        textModel: configuredTextModel("primaryimage", safe)
      },
      imageservice: {
        configured: configured("imageservice"),
        textModel: configuredTextModel("imageservice", safe),
        textToImageModel: String(safe.ai?.imageEditModel || safe.ai?.imageService2Model || safe.ai?.imageTextModel || safe.ai?.imageService1Model || defaultImageServiceTextModel).trim(),
        imageEditModel: String(safe.ai?.imageEditModel || safe.ai?.imageService2Model || defaultImageServiceEditModel).trim()
      },
      secondaryimage: {
        configured: configured("secondaryimage"),
        textModel: configuredTextModel("secondaryimage", safe),
        textToImageModel: defaultSecondaryApiImageModel,
        imageEditModel: defaultSecondaryApiImageModel
      },
      responsesimage: {
        configured: configured("responsesimage"),
        textModel: configuredTextModel("responsesimage", safe),
        imageTool: "image_generation"
      },
      textserviceb: {
        configured: configured("textserviceb"),
        textModel: configuredTextModel("textserviceb", safe)
      },
      textservicec: {
        configured: configured("textservicec"),
        textModel: configuredTextModel("textservicec", safe)
      }
    },
    billingGroup: billingGroup.department || billingGroup.groupId || billingGroup.groupName ? billingGroup : null,
    aiImageSkills: normalizeAiImageSkills(safe.ai?.aiImageSkills)
  };
}

function normalizePrimaryImageAspectRatio(value) {
  const allowed = new Set(["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"]);
  const ratio = String(value || "1:1").trim();
  return allowed.has(ratio) ? ratio : "1:1";
}

function normalizePrimaryImageImageSize(value) {
  const size = String(value || "1K").trim().toUpperCase();
  return ["1K", "2K", "4K"].includes(size) ? size : "1K";
}

async function handleAccountLogin(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    sendJson(res, 400, { error: "请输入账号和密码。" });
    return;
  }
  const rateLimitMessage = loginRateLimitError(req, username, "account");
  if (rateLimitMessage) {
    sendJson(res, 429, { error: rateLimitMessage });
    return;
  }

  const db = await loadAccountDb();
  if (accountSetupRequired(db)) {
    sendJson(res, 403, { error: "中控台管理员尚未初始化，请先进入管理后台设置账号密码。" });
    return;
  }
  const user = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (!user || !verifyUserPassword(password, user)) {
    recordLoginFailure(req, username, "account");
    sendJson(res, 401, { error: "账号或密码错误。" });
    return;
  }
  clearLoginFailures(req, username, "account");
  const denial = accountLicenseError(user);
  if (denial) {
    sendJson(res, denial.status, { error: denial.message });
    return;
  }
  const config = await loadIntranetConfig().catch(() => null);
  const maintenance = maintenanceBlockForUser(config, user);
  if (maintenance) {
    sendJson(res, maintenance.status, {
      error: maintenance.message,
      maintenance: maintenance.maintenance
    });
    return;
  }

  const deviceId = String(body.deviceId || "").trim() || "unknown";
  const deviceName = String(body.deviceName || req.headers["user-agent"] || "Unknown device").slice(0, 120);
  user.devices = Array.isArray(user.devices) ? user.devices : [];
  let device = user.devices.find((item) => item.id === deviceId);
  if (!device) {
    if (user.deviceLimit > 0 && user.devices.length >= user.deviceLimit) {
      sendJson(res, 403, { error: "当前账户绑定设备数量已达上限。" });
      return;
    }
    device = { id: deviceId, name: deviceName, createdAt: nowIso(), lastSeenAt: nowIso() };
    user.devices.push(device);
  } else {
    device.name = deviceName;
    device.lastSeenAt = nowIso();
  }
  const upgradedPasswordHash = upgradePasswordHashIfNeeded(user, password);
  user.updatedAt = nowIso();
  await saveAccountDb(db);

  const rememberLogin = body.rememberLogin === true || body.rememberLogin === "true" || body.remember === true || body.remember === "true";
  const ttlMs = rememberLogin ? rememberedSessionTtlMs : sessionTtlMs;
  const token = randomBytes(32).toString("hex");
  const tokenKey = sessionTokenKey(token);
  accountSessions.set(tokenKey, {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    remembered: rememberLogin
  });
  await saveAccountSessions().catch(() => {});
  sendJson(res, 200, { user: publicAccountUser(user), remembered: rememberLogin, passwordUpgraded: upgradedPasswordHash }, { "set-cookie": sessionCookie(token, Math.floor(ttlMs / 1000), req) });
}

async function handleAccountLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[sessionCookieName];
  if (token) {
    accountSessions.delete(sessionTokenKey(token));
    await saveAccountSessions().catch(() => {});
  }
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie(req) });
}

async function handleAccountChangePassword(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!username || !currentPassword || !newPassword) {
    sendJson(res, 400, { error: "请输入账号、当前密码和新密码。" });
    return;
  }
  if (newPassword.length < 6) {
    sendJson(res, 400, { error: "新密码至少 6 位。" });
    return;
  }
  if (confirmPassword && confirmPassword !== newPassword) {
    sendJson(res, 400, { error: "两次输入的新密码不一致。" });
    return;
  }

  const account = await currentAccount(req);
  const db = account?.db || await loadAccountDb();
  if (accountSetupRequired(db)) {
    sendJson(res, 403, { error: "中控台管理员尚未初始化，请先进入管理后台设置账号密码。" });
    return;
  }
  const user = account?.user || db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (!user || !verifyUserPassword(currentPassword, user)) {
    sendJson(res, 401, { error: "账号或当前密码不正确。" });
    return;
  }
  if (account?.user && account.user.username.toLowerCase() !== username.toLowerCase()) {
    sendJson(res, 403, { error: "当前登录账户和输入账号不一致。" });
    return;
  }
  const denial = accountLicenseError(user);
  if (denial) {
    sendJson(res, denial.status, { error: denial.message });
    return;
  }
  const config = await loadIntranetConfig().catch(() => null);
  const maintenance = maintenanceBlockForUser(config, user);
  if (maintenance) {
    sendJson(res, maintenance.status, {
      error: maintenance.message,
      maintenance: maintenance.maintenance
    });
    return;
  }

  const passwordRecord = createPasswordRecord(newPassword);
  user.salt = passwordRecord.salt;
  user.passwordHash = passwordRecord.passwordHash;
  user.updatedAt = nowIso();
  await saveAccountDb(db);

  const currentTokenKey = account?.token ? sessionTokenKey(account.token) : "";
  for (const [tokenKey, session] of accountSessions.entries()) {
    if (session?.userId === user.id && tokenKey !== currentTokenKey) {
      accountSessions.delete(tokenKey);
    }
  }
  await saveAccountSessions().catch(() => {});
  sendJson(res, 200, { user: account ? publicAccountUser(user) : null });
}

async function handleAccountMe(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const account = await currentAccount(req);
  if (!account) {
    sendJson(res, 401, { error: "请先登录账户。" });
    return;
  }
  const config = await loadIntranetConfig().catch(() => null);
  const maintenance = maintenanceBlockForUser(config, account.user);
  if (maintenance) {
    sendJson(res, maintenance.status, {
      error: maintenance.message,
      user: publicAccountUser(account.user),
      maintenance: maintenance.maintenance
    });
    return;
  }
  sendJson(res, 200, { user: publicAccountUser(account.user) });
}

async function getClientConfig(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const config = await loadIntranetConfig();
  const account = await currentAccount(req).catch(() => null);
  sendJson(res, 200, publicClientConfig(config, account?.user || null));
}

function emptyOperationMetrics() {
  return {
    dateKey: localDateKey(),
    accepted: 0,
    completed: 0,
    failed: 0,
    durationMsTotal: 0,
    lastErrors: [],
    byProvider: {}
  };
}

const aiImageOperationMetrics = emptyOperationMetrics();

function refreshOperationMetrics(metrics) {
  const today = localDateKey();
  if (metrics.dateKey === today) return metrics;
  metrics.dateKey = today;
  metrics.accepted = 0;
  metrics.completed = 0;
  metrics.failed = 0;
  metrics.durationMsTotal = 0;
  metrics.lastErrors = [];
  metrics.byProvider = {};
  return metrics;
}

function operationProviderStats(metrics, provider) {
  const key = String(provider || "unknown").trim() || "unknown";
  metrics.byProvider[key] = metrics.byProvider[key] || {
    provider: key,
    accepted: 0,
    completed: 0,
    failed: 0,
    durationMsTotal: 0
  };
  return metrics.byProvider[key];
}

function recordOperationAccepted(metrics, provider) {
  refreshOperationMetrics(metrics);
  metrics.accepted += 1;
  operationProviderStats(metrics, provider).accepted += 1;
}

function recordOperationFinished(metrics, provider, ok, durationMs, error = "") {
  refreshOperationMetrics(metrics);
  const stats = operationProviderStats(metrics, provider);
  const duration = Math.max(0, Number(durationMs || 0));
  metrics.durationMsTotal += duration;
  stats.durationMsTotal += duration;
  if (ok) {
    metrics.completed += 1;
    stats.completed += 1;
  } else {
    metrics.failed += 1;
    stats.failed += 1;
    if (error) {
      metrics.lastErrors.unshift({
        at: nowIso(),
        provider: String(provider || "unknown"),
        error: String(error).slice(0, 240)
      });
      metrics.lastErrors = metrics.lastErrors.slice(0, 8);
    }
  }
}

function publicOperationMetrics(metrics) {
  refreshOperationMetrics(metrics);
  const finished = Number(metrics.completed || 0) + Number(metrics.failed || 0);
  const providers = Object.values(metrics.byProvider || {}).map((item) => {
    const providerFinished = Number(item.completed || 0) + Number(item.failed || 0);
    return {
      provider: item.provider || "unknown",
      accepted: Number(item.accepted || 0),
      completed: Number(item.completed || 0),
      failed: Number(item.failed || 0),
      successRate: providerFinished ? Math.round((Number(item.completed || 0) / providerFinished) * 1000) / 10 : 0,
      averageDurationMs: providerFinished ? Math.round(Number(item.durationMsTotal || 0) / providerFinished) : 0
    };
  }).sort((a, b) => Number(b.accepted || 0) - Number(a.accepted || 0));
  return {
    dateKey: metrics.dateKey,
    accepted: Number(metrics.accepted || 0),
    completed: Number(metrics.completed || 0),
    failed: Number(metrics.failed || 0),
    successRate: finished ? Math.round((Number(metrics.completed || 0) / finished) * 1000) / 10 : 0,
    averageDurationMs: finished ? Math.round(Number(metrics.durationMsTotal || 0) / finished) : 0,
    providers,
    lastErrors: Array.isArray(metrics.lastErrors) ? metrics.lastErrors : []
  };
}

function compactAccountInfo(user = {}) {
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    displayName: String(user.displayName || user.username || "")
  };
}

function activeAiImageJobsForUser(userId) {
  const id = String(userId || "");
  if (!id) return 0;
  let count = 0;
  for (const state of aiImageJobState.values()) {
    if (!["queued", "running"].includes(String(state?.status || ""))) continue;
    if (String(state?.account?.id || "") === id) count += 1;
  }
  return count;
}

function aiImageJobUnits(item = {}) {
  const value = Number(item?.totalCount ?? item?.requestedCount ?? item?.metadata?.requestedCount ?? 1);
  return Math.max(1, Math.min(100, Math.ceil(Number.isFinite(value) ? value : 1)));
}

function queuedAiImageUnits() {
  return aiImageQueue.reduce((sum, item) => sum + aiImageJobUnits(item), 0);
}

function isDetailPageAiWorkflow(workflow = "") {
  const value = String(workflow || "").trim().toLowerCase();
  return value === "detail_page_design_plan" || value === "detail_page";
}

function activeAiImageUnitsForUser(userId, filter = null) {
  const id = String(userId || "");
  if (!id) return 0;
  let count = 0;
  for (const state of aiImageJobState.values()) {
    if (!["queued", "running"].includes(String(state?.status || ""))) continue;
    if (String(state?.account?.id || "") !== id) continue;
    if (typeof filter === "function" && !filter(state)) continue;
    count += aiImageJobUnits(state);
  }
  return count;
}

function activeDetailPageAiStatsForUser(userId, currentConversationId = "") {
  const id = String(userId || "");
  const current = String(currentConversationId || "").trim();
  const groups = new Map();
  let totalUnits = 0;
  let currentGroupUnits = 0;
  if (!id) return { groupCount: 0, totalUnits: 0, currentGroupUnits: 0, currentGroupActive: false };
  for (const state of aiImageJobState.values()) {
    if (!["queued", "running"].includes(String(state?.status || ""))) continue;
    if (String(state?.account?.id || "") !== id) continue;
    if (!isDetailPageAiWorkflow(state?.workflow)) continue;
    const units = aiImageJobUnits(state);
    const groupKey = String(state?.conversationId || state?.jobId || "").trim();
    if (groupKey) groups.set(groupKey, (groups.get(groupKey) || 0) + units);
    totalUnits += units;
  }
  if (current) currentGroupUnits = Number(groups.get(current) || 0);
  return {
    groupCount: groups.size,
    totalUnits,
    currentGroupUnits,
    currentGroupActive: Boolean(current && groups.has(current))
  };
}

function aiImageQueueSnapshot() {
  const activeUsers = new Set();
  for (const state of aiImageJobState.values()) {
    if (!["queued", "running"].includes(String(state?.status || ""))) continue;
    const userId = String(state?.account?.id || "");
    if (userId) activeUsers.add(userId);
  }
  const queuedUnits = queuedAiImageUnits();
  return {
    running: aiImageRunning,
    queued: aiImageQueue.length,
    queuedUnits,
    active: aiImageRunning + queuedUnits,
    activeUsers: activeUsers.size,
    maxConcurrency: aiImageMaxConcurrency,
    maxActiveJobs: aiImageMaxActiveJobs,
    maxActiveJobsPerUser: aiImageMaxActiveJobsPerUser,
    detailPageMaxGroupsPerUser: aiImageDetailPageMaxGroupsPerUser,
    detailPageMaxUnitsPerGroup: aiImageDetailPageMaxUnitsPerGroup,
    detailPageMaxUnitsPerUser: aiImageDetailPageMaxUnitsPerUser,
    metrics: publicOperationMetrics(aiImageOperationMetrics)
  };
}

function assertAiImageQueueCapacity(user, options = {}) {
  const requestedUnits = aiImageJobUnits({ totalCount: options.requestedUnits || options.count || 1 });
  const workflow = String(options.workflow || "").trim();
  const conversationId = String(options.conversationId || options.conversation_id || "").trim();
  const snapshot = aiImageQueueSnapshot();
  if (snapshot.active + requestedUnits > aiImageMaxActiveJobs) {
    throw createHttpError(429, `AI 生图排队已满（${snapshot.active}/${aiImageMaxActiveJobs} 张），请稍后再试。`);
  }
  if (isDetailPageAiWorkflow(workflow)) {
    const stats = activeDetailPageAiStatsForUser(user?.id, conversationId);
    const startingNewGroup = Boolean(conversationId && !stats.currentGroupActive);
    if (startingNewGroup && stats.groupCount >= aiImageDetailPageMaxGroupsPerUser) {
      throw createHttpError(429, `当前账号已有 ${stats.groupCount} 组详情页 Agent 在等待或运行，最多同时保留 ${aiImageDetailPageMaxGroupsPerUser} 组。`);
    }
    if (stats.totalUnits + requestedUnits > aiImageDetailPageMaxUnitsPerUser) {
      throw createHttpError(429, `当前账号详情页 Agent 已有 ${stats.totalUnits} 张在等待或运行，最多同时保留 ${aiImageDetailPageMaxUnitsPerUser} 张。`);
    }
    if (conversationId && stats.currentGroupUnits + requestedUnits > aiImageDetailPageMaxUnitsPerGroup) {
      throw createHttpError(429, `当前详情页 Agent 这一组已有 ${stats.currentGroupUnits} 张在等待或运行，每组最多 ${aiImageDetailPageMaxUnitsPerGroup} 张。`);
    }
    return;
  }
  const userActive = activeAiImageUnitsForUser(user?.id, (state) => !isDetailPageAiWorkflow(state?.workflow));
  if (userActive + requestedUnits > aiImageMaxActiveJobsPerUser) {
    throw createHttpError(429, `当前账号已有 ${userActive} 张 AI 生图在等待或运行，普通生图最多同时保留 ${aiImageMaxActiveJobsPerUser} 张。`);
  }
}

async function reserveAiImageUsageWithCapacity(user, amount, options = {}) {
  const requestedUnits = aiImageJobUnits({ totalCount: options.requestedUnits || amount || 1 });
  const capacityOptions = { ...options, requestedUnits };
  assertAiImageQueueCapacity(user, capacityOptions);
  await reserveUsage(user.id, "aiImages", amount);
  try {
    assertAiImageQueueCapacity(user, capacityOptions);
  } catch (error) {
    await rollbackUsage(user.id, "aiImages", amount).catch(() => {});
    throw error;
  }
}

function setAiImageJobState(jobId, patch) {
  const current = aiImageJobState.get(jobId) || { jobId };
  const next = {
    ...current,
    ...patch,
    jobId,
    updatedAt: nowIso()
  };
  aiImageJobState.set(jobId, next);
  scheduleAiImageJobStatusCacheWrite();
  return next;
}

function publicAiImageJobStateForCache(jobId, state = {}) {
  const status = String(state.status || "").trim() || "queued";
  if (status === "complete") return null;
  const createdAtMs = Number(state.createdAtMs || new Date(state.createdAt || 0).getTime() || Date.now());
  const updatedAtMs = new Date(state.updatedAt || state.finishedAt || state.startedAt || state.createdAt || Date.now()).getTime();
  return {
    jobId,
    status,
    percent: Math.max(0, Math.min(100, Math.round(Number(state.percent || 0)))),
    message: String(state.message || ""),
    provider: String(state.provider || ""),
    totalCount: Number(state.totalCount || 0),
    units: aiImageJobUnits(state),
    workflow: String(state.workflow || ""),
    conversationId: String(state.conversationId || ""),
    completedCount: Number(state.completedCount || 0),
    failedCount: Number(state.failedCount || 0),
    error: String(state.error || ""),
    errorType: String(state.errorType || ""),
    promptRewriteAvailable: Boolean(state.promptRewriteAvailable),
    providerAttempts: normalizeAiProviderAttempts(state.providerAttempts),
    account: state.account && typeof state.account === "object" ? compactAccountInfo(state.account) : {},
    createdAt: state.createdAt || "",
    createdAtMs,
    startedAt: state.startedAt || "",
    finishedAt: state.finishedAt || "",
    updatedAt: state.updatedAt || "",
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now()
  };
}

function aiImageJobStatusCacheSnapshot() {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const items = [];
  for (const [jobId, state] of aiImageJobState.entries()) {
    const item = publicAiImageJobStateForCache(jobId, state);
    if (!item) continue;
    if (!["queued", "running"].includes(item.status) && Number(item.updatedAtMs || 0) < cutoffMs) continue;
    items.push(item);
  }
  items.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
  return {
    version: 1,
    updatedAt: nowIso(),
    pid: process.pid,
    items: items.slice(0, 500)
  };
}

function queueAiImageJobStatusCacheWrite() {
  aiImageJobStatusCacheWrite = aiImageJobStatusCacheWrite.then(async () => {
      await mkdir(aiImageJobsDir, { recursive: true });
      await writeFile(aiImageJobStatusCachePath, JSON.stringify(aiImageJobStatusCacheSnapshot(), null, 2), "utf8");
    }).catch((error) => {
      console.warn("AI 生图任务状态缓存写入失败：", error.message || error);
    });
  return aiImageJobStatusCacheWrite;
}

function scheduleAiImageJobStatusCacheWrite() {
  if (aiImageJobStatusCacheTimer) return;
  aiImageJobStatusCacheTimer = setTimeout(() => {
    aiImageJobStatusCacheTimer = null;
    void queueAiImageJobStatusCacheWrite();
  }, 150);
}

async function flushAiImageJobStatusCacheNow() {
  if (aiImageJobStatusCacheTimer) {
    clearTimeout(aiImageJobStatusCacheTimer);
    aiImageJobStatusCacheTimer = null;
  }
  await queueAiImageJobStatusCacheWrite();
}

async function readAiImageJobStatusCache() {
  try {
    const raw = await readFile(aiImageJobStatusCachePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function interruptedAiImageJobState(item = {}) {
  const message = "服务刚刚重启，原 AI 生图任务已中断，请重新提交。";
  return {
    ...item,
    status: "failed",
    percent: 100,
    message: "AI 生图任务已中断",
    error: item.error || message,
    finishedAt: item.finishedAt || nowIso(),
    updatedAt: nowIso(),
    completedCount: Number(item.completedCount || 0),
    failedCount: Number(item.failedCount || item.totalCount || 1),
    queuePosition: 0,
    queueLength: 0,
    waitingAhead: 0,
    running: aiImageRunning,
    maxConcurrency: aiImageMaxConcurrency
  };
}

async function restoreAiImageJobStatusCache() {
  const cache = await readAiImageJobStatusCache();
  let changed = false;
  for (const item of cache.items) {
    const jobId = String(item.jobId || "").trim();
    if (!/^\d+-[a-z0-9]+$/i.test(jobId)) continue;
    const status = String(item.status || "").trim();
    if (["queued", "running"].includes(status)) {
      aiImageJobState.set(jobId, interruptedAiImageJobState(item));
      const interruptedUserId = String(item?.account?.id || "");
      if (interruptedUserId) {
        await rollbackUsage(interruptedUserId, "aiImages", aiImageJobUnits(item)).catch((error) => {
          console.warn("AI 生图中断任务额度退回失败：", error.message || error);
        });
      }
      changed = true;
    } else if (status === "failed") {
      aiImageJobState.set(jobId, {
        ...item,
        running: aiImageRunning,
        maxConcurrency: aiImageMaxConcurrency
      });
    }
  }
  if (changed) {
    scheduleAiImageJobStatusCacheWrite();
  }
}

async function findCachedAiImageJobState(jobId) {
  const cache = await readAiImageJobStatusCache();
  const item = cache.items.find((entry) => String(entry.jobId || "") === String(jobId || ""));
  if (!item) return null;
  const status = String(item.status || "").trim();
  const state = ["queued", "running"].includes(status) ? interruptedAiImageJobState(item) : {
    ...item,
    running: aiImageRunning,
    maxConcurrency: aiImageMaxConcurrency
  };
  aiImageJobState.set(jobId, state);
  return state;
}

function updateAiImageQueuePositions() {
  const queueLength = aiImageQueue.length;
  let queuedUnitsAhead = 0;
  aiImageQueue.forEach((item, index) => {
    const units = aiImageJobUnits(item);
    const waitingAhead = queuedUnitsAhead + aiImageRunning;
    setAiImageJobState(item.jobId, {
      status: "queued",
      percent: 0,
      message: waitingAhead > 0 ? `AI 生图排队中，前方 ${waitingAhead} 张。` : "AI 生图排队中，即将开始。",
      units,
      workflow: String(item.workflow || "").trim(),
      conversationId: String(item.conversationId || "").trim(),
      queuePosition: index + 1,
      queueLength,
      waitingAhead,
      running: aiImageRunning,
      maxConcurrency: aiImageMaxConcurrency
    });
    queuedUnitsAhead += units;
  });
}

function enqueueAiImageJob(item) {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAtMs = Date.now();
  const account = item.account || {};
  const units = aiImageJobUnits(item);
  aiImageQueue.push({ ...item, jobId, createdAtMs, account });
  recordOperationAccepted(aiImageOperationMetrics, item.provider || "");
  setAiImageJobState(jobId, {
    status: "queued",
    percent: 0,
    message: "AI 生图排队中",
    provider: item.provider || "",
    account,
    createdAt: nowIso(),
    createdAtMs,
    totalCount: Number(item.totalCount || 0),
    units,
    workflow: String(item.workflow || "").trim(),
    conversationId: String(item.conversationId || "").trim(),
    completedCount: 0,
    failedCount: 0,
    queuePosition: aiImageQueue.length,
    queueLength: aiImageQueue.length,
    waitingAhead: Math.max(0, aiImageRunning + queuedAiImageUnits() - units),
    running: aiImageRunning,
    maxConcurrency: aiImageMaxConcurrency
  });
  updateAiImageQueuePositions();
  void pumpAiImageQueue();
  return aiImageJobState.get(jobId);
}

async function pumpAiImageQueue() {
  while (aiImageRunning < aiImageMaxConcurrency && aiImageQueue.length) {
    const availableUnits = Math.max(0, aiImageMaxConcurrency - aiImageRunning);
    const nextIndex = aiImageQueue.findIndex((queuedItem) => aiImageJobUnits(queuedItem) <= availableUnits);
    if (nextIndex < 0) break;
    const [item] = aiImageQueue.splice(nextIndex, 1);
    const units = aiImageJobUnits(item);
    aiImageRunning += units;
    const startedAtMs = Date.now();
    updateAiImageQueuePositions();
    setAiImageJobState(item.jobId, {
      status: "running",
      percent: 10,
      message: "AI 正在生图",
      account: item.account || {},
      startedAt: nowIso(),
      startedAtMs,
      totalCount: Number(item.totalCount || 0),
      units,
      workflow: String(item.workflow || "").trim(),
      conversationId: String(item.conversationId || "").trim(),
      completedCount: 0,
      failedCount: 0,
      queuePosition: 0,
      waitingAhead: 0,
      running: aiImageRunning,
      maxConcurrency: aiImageMaxConcurrency
    });
    const updateProgress = (patch = {}) => setAiImageJobState(item.jobId, {
      ...patch,
      running: aiImageRunning,
      maxConcurrency: aiImageMaxConcurrency
    });
    item.run({ updateProgress, jobId: item.jobId })
      .then(async (data) => {
        const archive = await archiveAiImageGeneration(item.jobId, item, data).catch((error) => ({
          savedCount: 0,
          totalCount: 0,
          error: error.message || String(error)
        }));
        if (archive?.savedCount) {
          data.archive = archive;
          applyArchivedImageUrls(data, archive);
        } else if (archive?.error) {
          data.archive = archive;
        }
        setAiImageJobState(item.jobId, {
          status: "complete",
          provider: data?.provider || item.provider || "",
          percent: 100,
          message: "AI 生图完成",
          finishedAt: nowIso(),
          durationMs: Date.now() - Number(item.createdAtMs || startedAtMs),
          totalCount: Number(data?.metadata?.requestedCount || item.totalCount || 0),
          completedCount: Number(data?.metadata?.imageCount || 0),
          failedCount: Number(data?.metadata?.failedCount || 0),
          data,
          running: aiImageRunning,
          maxConcurrency: aiImageMaxConcurrency
        });
        recordOperationFinished(aiImageOperationMetrics, data?.provider || item.provider || "", true, Date.now() - Number(item.createdAtMs || startedAtMs));
      })
      .catch(async (error) => {
        const failureProvider = error?.aiFailureContext?.provider || item.provider || "";
        const friendlyError = aiVisibleFailureMessage(error, failureProvider);
        const recovery = aiPromptRewriteRecovery(error, failureProvider);
        setAiImageJobState(item.jobId, {
          status: "failed",
          provider: failureProvider,
          percent: 100,
          message: "AI 生图失败",
          finishedAt: nowIso(),
          durationMs: Date.now() - Number(item.createdAtMs || startedAtMs),
          totalCount: Number(item.totalCount || 0),
          completedCount: 0,
          failedCount: Number(item.totalCount || 0),
          error: friendlyError,
          errorType: recovery.errorType,
          promptRewriteAvailable: recovery.promptRewriteAvailable,
          providerAttempts: recovery.providerAttempts,
          running: aiImageRunning,
          maxConcurrency: aiImageMaxConcurrency
        });
        await recordAiImageFailureLog(item.jobId, item, error).catch((logError) => {
          console.warn("AI 生图失败记录写入失败：", logError.message || logError);
        });
        recordOperationFinished(aiImageOperationMetrics, failureProvider, false, Date.now() - Number(item.createdAtMs || startedAtMs), friendlyError);
      })
      .finally(() => {
        aiImageRunning = Math.max(0, aiImageRunning - units);
        updateAiImageQueuePositions();
        void pumpAiImageQueue();
      });
  }
}

function publicAiImageJobPayload(jobId, state) {
  const accountId = String(state?.account?.id || "");
  const detailPageWorkflow = isDetailPageAiWorkflow(state?.workflow);
  const accountActiveUnits = accountId
    ? activeAiImageUnitsForUser(accountId, (item) => isDetailPageAiWorkflow(item?.workflow) === detailPageWorkflow)
    : 0;
  return {
    jobId,
    status: state.status || "queued",
    percent: Math.max(0, Math.min(100, Math.round(Number(state.percent || 0)))),
    message: state.message || "",
    provider: state.provider || "",
    totalCount: Number(state.totalCount || 0),
    units: aiImageJobUnits(state),
    workflow: String(state.workflow || ""),
    conversationId: String(state.conversationId || ""),
    completedCount: Number(state.completedCount || 0),
    failedCount: Number(state.failedCount || 0),
    queuePosition: Number(state.queuePosition || 0),
    queueLength: Number(state.queueLength || 0),
    waitingAhead: Number(state.waitingAhead || 0),
    running: Number(state.running || 0),
    maxConcurrency: Number(state.maxConcurrency || aiImageMaxConcurrency),
    accountActiveUnits,
    accountActiveLimit: detailPageWorkflow ? aiImageDetailPageMaxUnitsPerUser : aiImageMaxActiveJobsPerUser,
    data: state.status === "complete" ? state.data : undefined,
    error: state.error || "",
    errorType: state.errorType || "",
    promptRewriteAvailable: Boolean(state.promptRewriteAvailable),
    providerAttempts: normalizeAiProviderAttempts(state.providerAttempts),
    updatedAt: state.updatedAt || ""
  };
}

async function getAiImageJobStatus(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const jobId = decodeURIComponent(url.pathname.replace(/^\/api\/ai\/image-generation\/status\//, ""));
  if (!/^\d+-[a-z0-9]+$/i.test(jobId)) {
    sendJson(res, 400, { error: "任务 ID 无效" });
    return;
  }
  const account = await requireAccount(req, res);
  if (!account) return;
  const state = aiImageJobState.get(jobId) || await findCachedAiImageJobState(jobId);
  if (!state) {
    sendJson(res, 404, { error: "AI 生图任务不存在或已过期" });
    return;
  }
  if (String(state?.account?.id || "") !== String(account.user.id || "")) {
    sendJson(res, 404, { error: "AI 生图任务不存在或已过期" });
    return;
  }
  sendJson(res, 200, publicAiImageJobPayload(jobId, state));
}

async function handleAiGalleryImage(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const account = await requireAccount(req, res);
  if (!account) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const id = decodeURIComponent(url.pathname.replace(/^\/api\/ai\/gallery\/image\//, ""));
  if (!/^[a-f0-9]{8,40}$/i.test(id)) {
    sendJson(res, 400, { error: "图片 ID 无效。" });
    return;
  }
  const index = await readAiGalleryIndex();
  const item = index.items.find((entry) => String(entry.id || "") === id);
  if (item?.account?.id && String(item.account.id) !== String(account.user.id)) {
    sendJson(res, 403, { error: "无权读取这张图片。" });
    return;
  }
  const filePath = safeAiGalleryImagePath(item);
  if (!item || !filePath || !existsSync(filePath)) {
    sendJson(res, 404, { error: "图片不存在。" });
    return;
  }
  const buffer = await readFile(filePath);
  res.writeHead(200, {
    "content-type": item.mime || imageMimeFromExt(extname(filePath).toLowerCase()),
    "cache-control": "private, max-age=300"
  });
  res.end(buffer);
}

async function runPrimaryImageImageGeneration(apiKey, prompt, imageParts, imageConfig, count, planner = null) {
  const images = [];
  const texts = [];
  const rawMeta = [];
  const model = normalizeClientModelOverride(planner?.imageModel || planner?.model) || primaryImageImageModel;
  const endpoint = model && model !== primaryImageImageModel
    ? `${primaryImageApiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`
    : primaryImageImageEndpoint;

  for (let index = 0; index < count; index += 1) {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: (() => {
        const headers = { "content-type": "application/json" };
        const name = String(process.env.PRIMARY_IMAGE_AUTH_HEADER || "authorization").trim().toLowerCase() || "authorization";
        const prefix = String(process.env.PRIMARY_IMAGE_AUTH_PREFIX || "Bearer").trim();
        headers[name] = prefix ? `${prefix} ${apiKey}` : apiKey;
        return headers;
      })(),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              ...imageParts,
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig
        }
      })
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok || data?.error) {
      throw createHttpError(upstream.status || 502, `图片服务 A 生图请求失败：${JSON.stringify(data)}`);
    }

    const currentImages = collectPrimaryImageImages(data);
    images.push(...currentImages);
    const currentText = collectPrimaryImageText(data);
    if (currentText) texts.push(currentText);
    await recordAiTokenUsage(planner?.userId, {
      provider: "primaryimage",
      model,
      source: "image-generation",
      upstream: data,
      config: planner?.config,
      user: planner?.user
    }).catch(() => {});
    rawMeta.push({
      index: index + 1,
      imageCount: currentImages.length,
      finishReason: data?.candidates?.[0]?.finishReason || ""
    });
  }

  if (!images.length) {
    throw createHttpError(502, "图片服务 A 返回成功但没有图片");
  }

  return {
    provider: "primaryimage",
    model,
    images,
    text: texts.join("\n").trim(),
    metadata: {
      requestedCount: count,
      imageCount: images.length,
      aspectRatio: imageConfig.aspectRatio,
      imageSize: imageConfig.imageSize,
      referenceCount: Number(planner?.originalReferenceCount ?? imageParts.length),
      generationReferenceCount: imageParts.length,
      droppedSelectedBaseReferenceCount: Number(planner?.droppedSelectedBaseReferenceCount || 0),
      selectedImagePolicy: planner?.selectedImagePolicy || "",
      imageModelMode: planner?.imageModelMode || "",
      operationType: planner?.operationType || "",
      submittedReferenceRoles: Array.isArray(planner?.submittedReferenceRoles) ? planner.submittedReferenceRoles : [],
      plannedReferenceRoles: Array.isArray(planner?.plannedReferenceRoles) ? planner.plannedReferenceRoles : [],
      referenceRoleSource: String(planner?.referenceRoleSource || ""),
      originalPrompt: planner?.originalPrompt || prompt,
      plannedPrompt: prompt,
      taskType: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.taskType || planner?.assetType || "") : "",
      executionMode: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.executionMode || "") : "",
      designAgentEnabled: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt),
      designPlan: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.designPlan || null) : null,
      layoutSpec: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.layoutSpec || null) : { enabled: false },
      review: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.review || null) : null,
      imagePrompt: planner?.imagePrompt || prompt,
      reviewChecklist: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) && Array.isArray(planner?.reviewChecklist) ? planner.reviewChecklist : [],
      assetType: isEcommerceDesignAgentEnabled(planner?.originalPrompt || prompt) ? (planner?.assetType || "") : "",
      outputMode: planner?.outputMode || "",
      referenceRoles: Array.isArray(planner?.referenceRoles) ? planner.referenceRoles : [],
      designBrief: planner?.designBrief || null,
      thinkingMode: planner?.mode || "off",
      thinkingProvider: planner?.provider || "",
      thinkingModel: planner?.model || "",
      thinkingNote: planner?.note || "",
      thinkingVisualReferenceCount: Number(planner?.visualReferenceCount || 0),
      thinkingSkippedReferenceReasons: Array.isArray(planner?.skippedReferenceReasons) ? planner.skippedReferenceReasons : [],
      responses: rawMeta
    }
  };
}

function normalizeImageServiceAspectRatio(value) {
  const ratio = String(value || "1:1").trim();
  const allowed = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]);
  return allowed.has(ratio) ? ratio : "1:1";
}

function normalizeImageServiceResolutionTier(value) {
  const tier = String(value || "1K").trim().toUpperCase();
  return ["1K", "2K", "4K"].includes(tier) ? tier : "1K";
}

function normalizeImageServiceSize(aspectRatio, requestedSize, options = {}) {
  const size = String(requestedSize || "").trim();
  const allowed = new Set(["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"]);
  if (allowed.has(size)) return size;
  const ratio = normalizeImageServiceAspectRatio(aspectRatio);
  const tier = normalizeImageServiceResolutionTier(requestedSize);
  if (isDetailPageAiWorkflow(options.workflow) && ratio === "3:4" && tier === "4K") {
    return "2448x3264";
  }
  if (ratio === "1:1") return tier === "1K" ? "1024x1024" : "2048x2048";
  if (ratio === "3:2") return "1536x1024";
  if (ratio === "2:3") return "1024x1536";
  if (ratio === "4:3") return "1536x1024";
  if (ratio === "3:4") return "1024x1536";
  if (ratio === "16:9") return tier === "4K" ? "3840x2160" : "2048x1152";
  if (ratio === "9:16") return "2160x3840";
  return "1024x1024";
}

function normalizeSecondaryApiImageResolution(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (["1K", "2K", "4K"].includes(raw)) return raw;
  if (/^3840x2160$|^2160x3840$/i.test(raw)) return "4K";
  if (/^2048x2048$|^2048x1152$/i.test(raw)) return "2K";
  return "1K";
}

function normalizeSecondaryApiAspectRatio(value) {
  const ratio = String(value || "1:1").trim();
  const allowed = new Set(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]);
  return allowed.has(ratio) ? ratio : "1:1";
}

function resolveImageServiceRequestDimensions(aspectRatio, requestedSize, workflow = "") {
  const normalizedAspectRatio = normalizeImageServiceAspectRatio(aspectRatio);
  const primarySize = normalizeImageServiceSize(normalizedAspectRatio, requestedSize, { workflow });
  return {
    aspectRatio: normalizedAspectRatio,
    resolutionTier: normalizeSecondaryApiImageResolution(requestedSize || primarySize),
    primarySize
  };
}

function normalizeImageServiceQuality(value) {
  const quality = String(value || "auto").trim().toLowerCase();
  return ["auto", "low", "medium", "high"].includes(quality) ? quality : "auto";
}

function normalizeImageServiceOutputFormat(value) {
  const format = String(value || "png").trim().toLowerCase();
  return ["png", "jpeg", "webp"].includes(format) ? format : "png";
}

function collectImageAssets(data) {
  const images = [];
  const outputUrls = secondaryApiV3PredictionOutputs(data);
  if (Array.isArray(outputUrls)) {
    outputUrls.forEach((url, index) => {
      const value = String(url || "").trim();
      if (/^https?:\/\//i.test(value)) {
        images.push({
          url: value,
          mimeType: "image/png",
          revisedPrompt: "",
          index: index + 1
        });
      }
    });
  }
  const items = Array.isArray(data?.data) ? data.data : [];
  items.forEach((item, index) => {
    if (!item) return;
    const url = String(item.url || "").trim();
    const base64 = String(item.b64_json || item.image_base64 || item.base64 || "").trim();
    if (url) {
      images.push({
        url,
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt || ""
      });
      return;
    }
    if (base64) {
      images.push({
        data: base64,
        base64,
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt || "",
        index: index + 1
      });
    }
  });
  return images;
}

function resolveAiConversationAssetPath(value, userId) {
  if (!userId) return "";
  const text = String(value || "").trim();
  if (!text) return "";
  let pathname = "";
  try {
    pathname = new URL(text, "http://local").pathname;
  } catch {
    return "";
  }
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 6 || parts[0] !== "api" || parts[1] !== "ai" || parts[2] !== "conversations" || parts[4] !== "assets") {
    return "";
  }
  const conversationId = safePathId(parts[3]);
  const fileName = basename(parts[5] || "");
  if (!conversationId || !/^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(fileName)) return "";
  const root = normalize(aiConversationAssetsDir(userId, conversationId));
  const filePath = normalize(join(root, fileName));
  if (!filePath.startsWith(root)) return "";
  return filePath;
}

function resolveCanvasReferencePath(value, userId) {
  if (!userId) return "";
  const text = String(value || "").trim();
  if (!text) return "";
  let pathname = "";
  try {
    pathname = new URL(text, "http://local").pathname;
  } catch {
    return "";
  }
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 4 || parts[0] !== "api" || parts[1] !== "canvas") return "";
  const bucket = parts[2];
  const fileName = basename(parts[3] || "");
  const roots = canvasUserRoot(userId);
  let root = "";
  if (bucket === "assets") {
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(fileName)) return "";
    root = normalize(roots.assets);
  } else {
    return "";
  }
  const filePath = normalize(join(root, fileName));
  if (!filePath.startsWith(root) || !existsSync(filePath)) return "";
  return filePath;
}


function resolveLocalImageReferencePath(value, userId) {
  const text = String(value?.image_file || value?.url || (typeof value === "string" ? value : "") || "").trim();
  let bundledBrandAsset = "";
  try {
    const pathname = new URL(text, "http://local").pathname;
    if (/^\/assets\/detail-(?:page-layout-generic|layout-generic-(?:hero|pain-grid|proof|structure|scene|detail|size|info-usage))\.jpg$/.test(pathname)) {
      const candidate = normalize(join(publicDir, pathname.replace(/^\//, "")));
      if (candidate.startsWith(normalize(join(publicDir, "assets"))) && existsSync(candidate)) bundledBrandAsset = candidate;
    }
  } catch {}
  return bundledBrandAsset
    || resolveAiConversationAssetPath(value, userId)
    || resolveCanvasReferencePath(value, userId);
}

async function imageReferenceToBlob(value, index, userId = "") {
  const remoteRef = parseRemoteImageReference(value);
  const text = String(value?.image_file || value?.url || (typeof value === "string" ? value : "") || "").trim();
  if (!text && !remoteRef) return null;
  const dataUrlMatch = text.match(/^data:(image\/(?:png|webp|jpe?g));base64,([\s\S]+)$/i);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1].toLowerCase() === "image/jpg" ? "image/jpeg" : dataUrlMatch[1].toLowerCase();
    const buffer = Buffer.from(dataUrlMatch[2].replace(/\s+/g, ""), "base64");
    if (!buffer.length) return null;
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    return {
      blob: new Blob([buffer], { type: mime }),
      fileName: `reference-${index + 1}.${ext}`
    };
  }
  const localAssetPath = resolveLocalImageReferencePath(text, userId);
  if (localAssetPath) {
    const buffer = await readFile(localAssetPath);
    if (!buffer.length) return null;
    const mime = imageMimeFromExt(extname(localAssetPath));
    const ext = imageExtFromMime(mime);
    return {
      blob: new Blob([buffer], { type: mime }),
      fileName: `reference-${index + 1}.${ext}`
    };
  }
  const galleryAsset = await readAiGalleryImageReference(text, userId);
  if (galleryAsset?.buffer?.length) {
    const mime = galleryAsset.mime || "image/png";
    return {
      blob: new Blob([galleryAsset.buffer], { type: mime }),
      fileName: galleryAsset.fileName || `reference-${index + 1}.${imageExtFromMime(mime)}`
    };
  }
  if (remoteRef) {
    const remoteAsset = await readRemoteImageBedReference(value);
    if (!remoteAsset?.buffer?.length) return null;
    const mime = remoteAsset.mime || "image/png";
    return {
      blob: new Blob([remoteAsset.buffer], { type: mime }),
      fileName: remoteAsset.fileName || `reference-${index + 1}.${imageExtFromMime(mime)}`
    };
  }
  if (/^https?:\/\//i.test(text)) {
    const response = await fetchWithTimeout(text, {}, 30000, `第 ${index + 1} 张参考图下载`);
    if (!response.ok) throw createHttpError(400, `第 ${index + 1} 张参考图下载失败。`);
    const mime = String(response.headers.get("content-type") || "image/png").split(";")[0].toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    return {
      blob: new Blob([buffer], { type: mime.startsWith("image/") ? mime : "image/png" }),
      fileName: `reference-${index + 1}.${ext}`
    };
  }
  return null;
}

async function imageReferenceToDataUrl(value, index, userId = "") {
  const remoteRef = parseRemoteImageReference(value);
  const text = String(value?.image_file || value?.url || (typeof value === "string" ? value : "") || "").trim();
  if (!text && !remoteRef) return null;
  const dataUrlMatch = text.match(/^data:(image\/(?:png|webp|jpe?g));base64,([\s\S]+)$/i);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1].toLowerCase() === "image/jpg" ? "image/jpeg" : dataUrlMatch[1].toLowerCase();
    const base64 = dataUrlMatch[2].replace(/\s+/g, "");
    if (!base64) return null;
    const bytes = Buffer.byteLength(base64, "base64");
    if (bytes > maxThinkingVisionImageBytes) {
      return {
        skipped: true,
        reason: `第 ${index + 1} 张参考图超过 ${Math.round(maxThinkingVisionImageBytes / 1024 / 1024)}MB，已跳过视觉理解。`
      };
    }
    return {
      dataUrl: `data:${mime};base64,${base64}`,
      mime,
      bytes,
      name: String(value?.name || `reference-${index + 1}.${imageExtFromMime(mime)}`)
    };
  }
  const localAssetPath = resolveLocalImageReferencePath(text, userId);
  if (localAssetPath) {
    const buffer = await readFile(localAssetPath);
    if (!buffer.length) return null;
    if (buffer.length > maxThinkingVisionImageBytes) {
      return {
        skipped: true,
        reason: `第 ${index + 1} 张参考图超过 ${Math.round(maxThinkingVisionImageBytes / 1024 / 1024)}MB，已跳过视觉理解。`
      };
    }
    const mime = imageMimeFromExt(extname(localAssetPath));
    return {
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      mime,
      bytes: buffer.length,
      name: String(value?.name || basename(localAssetPath))
    };
  }
  const galleryAsset = await readAiGalleryImageReference(text, userId);
  if (galleryAsset?.buffer?.length) {
    if (galleryAsset.buffer.length > maxThinkingVisionImageBytes) {
      return {
        skipped: true,
        reason: `第 ${index + 1} 张参考图超过 ${Math.round(maxThinkingVisionImageBytes / 1024 / 1024)}MB，已跳过视觉理解。`
      };
    }
    const mime = galleryAsset.mime || "image/png";
    return {
      dataUrl: `data:${mime};base64,${galleryAsset.buffer.toString("base64")}`,
      mime,
      bytes: galleryAsset.buffer.length,
      name: String(value?.name || galleryAsset.fileName || `reference-${index + 1}.${imageExtFromMime(mime)}`)
    };
  }
  if (remoteRef) {
    const remoteAsset = await readRemoteImageBedReference(value);
    if (!remoteAsset?.buffer?.length) return null;
    if (remoteAsset.buffer.length > maxThinkingVisionImageBytes) {
      return {
        skipped: true,
        reason: `第 ${index + 1} 张参考图超过 ${Math.round(maxThinkingVisionImageBytes / 1024 / 1024)}MB，已跳过视觉理解。`
      };
    }
    const mime = remoteAsset.mime || "image/png";
    return {
      dataUrl: `data:${mime};base64,${remoteAsset.buffer.toString("base64")}`,
      mime,
      bytes: remoteAsset.buffer.length,
      name: String(value?.name || remoteAsset.fileName || `reference-${index + 1}.${imageExtFromMime(mime)}`)
    };
  }
  if (/^https?:\/\//i.test(text)) {
    const response = await fetchWithTimeout(text, {}, 30000, `第 ${index + 1} 张参考图下载`);
    if (!response.ok) throw createHttpError(400, `第 ${index + 1} 张参考图下载失败。`);
    const mime = String(response.headers.get("content-type") || "image/png").split(";")[0].toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    if (buffer.length > maxThinkingVisionImageBytes) {
      return {
        skipped: true,
        reason: `第 ${index + 1} 张参考图超过 ${Math.round(maxThinkingVisionImageBytes / 1024 / 1024)}MB，已跳过视觉理解。`
      };
    }
    const actualMime = mime.startsWith("image/") ? mime.replace("image/jpg", "image/jpeg") : "image/png";
    return {
      dataUrl: `data:${actualMime};base64,${buffer.toString("base64")}`,
      mime: actualMime,
      bytes: buffer.length,
      name: String(value?.name || `reference-${index + 1}.${imageExtFromMime(actualMime)}`)
    };
  }
  return null;
}

async function prepareThinkingVisionReferences(references = [], userId = "", thinkingMode = "standard") {
  const result = [];
  const skipped = [];
  const list = Array.isArray(references) ? references : [];
  const maxReferences = thinkingVisionReferenceLimit(thinkingMode);
  for (let index = 0; index < Math.min(list.length, maxReferences); index += 1) {
    try {
      const item = await imageReferenceToDataUrl(list[index], index, userId);
      if (item?.dataUrl) result.push(item);
      else if (item?.skipped) skipped.push(item.reason);
    } catch (error) {
      skipped.push(`第 ${index + 1} 张参考图读取失败：${error.message || String(error)}`);
    }
  }
  if (list.length > maxReferences) {
    const label = thinkingVisionReferenceLimit("deep") === maxReferences ? "深度思考" : "标准思考";
    skipped.push(`参考图超过 ${maxReferences} 张，${label}阶段只读取前 ${maxReferences} 张。`);
  }
  return { images: result, skipped };
}

async function fetchPrimaryImageServiceJson(upstream) {
  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!upstream.ok || data?.error) {
      throw createHttpError(upstream.status || 502, `图片服务生图请求失败：${JSON.stringify(data)}`);
  }
  return data;
}

function normalizeAiThinkingMode(value) {
  const mode = String(value || "off").trim().toLowerCase();
  if (["off", "none", "direct", "false", "0", "关闭"].includes(mode)) return "off";
  if (["deep", "advanced", "deep-reasoning-model", "深度"].includes(mode)) return "deep";
  if (["standard", "normal", "mini", "标准"].includes(mode)) return "standard";
  return "off";
}

function collectPrimaryResponsesText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const texts = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  output.forEach((item) => {
    if (typeof item?.content === "string") {
      texts.push(item.content);
      return;
    }
    if (!Array.isArray(item?.content)) return;
    item.content.forEach((part) => {
      if (typeof part?.text === "string") texts.push(part.text);
      else if (typeof part?.content === "string") texts.push(part.content);
    });
  });
  return texts.join("\n").trim();
}

function collectPrimaryResponsesImages(data) {
  const images = [];
  const seen = new Set();
  const pushBase64 = (base64, mimeType = "image/png", meta = {}) => {
    const value = String(base64 || "").trim();
    if (!value) return;
    const normalized = value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
    if (!normalized || seen.has(normalized.slice(0, 80))) return;
    seen.add(normalized.slice(0, 80));
    images.push({
      data: normalized,
      base64: normalized,
      mimeType: String(mimeType || "image/png").replace("image/jpg", "image/jpeg"),
      ...meta
    });
  };
  const pushUrl = (url, meta = {}) => {
    const value = String(url || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    images.push({ url: value, mimeType: "image/png", ...meta });
  };
  const visit = (node, meta = {}) => {
    if (!node) return;
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node)) pushUrl(node, meta);
      else if (/^[A-Za-z0-9+/=\s]+$/.test(node) && node.replace(/\s+/g, "").length > 400) pushBase64(node, "image/png", meta);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, { ...meta, index: index + 1 }));
      return;
    }
    if (typeof node !== "object") return;
    const type = String(node.type || node.object || "").toLowerCase();
    const mimeType = node.mimeType || node.mime_type || node.media_type || "image/png";
    if (node.result && (type.includes("image_generation") || type.includes("image"))) {
      visit(node.result, { ...meta, source: type || "result" });
    }
    if (node.b64_json || node.image_base64 || node.base64 || node.data) {
      pushBase64(node.b64_json || node.image_base64 || node.base64 || node.data, mimeType, meta);
    }
    if (node.url || node.image_url || node.image_file) {
      const imageUrl = typeof node.image_url === "object" ? node.image_url.url : node.image_url;
      pushUrl(node.url || imageUrl || node.image_file, meta);
    }
    if (node.inline_data || node.inlineData) {
      const inlineData = node.inline_data || node.inlineData;
      pushBase64(inlineData.data, inlineData.mime_type || inlineData.mimeType || mimeType, meta);
    }
    if (node.content) visit(node.content, meta);
    if (node.output) visit(node.output, meta);
    if (node.data) visit(node.data, meta);
  };
  visit(data?.output);
  visit(data?.data);
  visit(data?.images);
  return images;
}

function stripAiJsonText(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function decodeLooseJsonString(value) {
  let output = "";
  let escaping = false;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!escaping) {
      if (char === "\\") {
        escaping = true;
      } else {
        output += char;
      }
      continue;
    }
    escaping = false;
    if (char === "n") output += "\n";
    else if (char === "r") output += "\r";
    else if (char === "t") output += "\t";
    else if (char === "\"" || char === "\\" || char === "/") output += char;
    else if (char === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) {
      output += String.fromCharCode(parseInt(text.slice(index + 1, index + 5), 16));
      index += 4;
    } else {
      output += char;
    }
  }
  return output.trim();
}

function extractLooseJsonStringField(text, fieldNames) {
  const source = String(text || "");
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`, "i");
    const match = source.match(pattern);
    if (!match) continue;
    let index = (match.index || 0) + match[0].length;
    let raw = "";
    let escaping = false;
    while (index < source.length) {
      const char = source[index];
      if (!escaping && char === "\"") break;
      raw += char;
      if (!escaping && char === "\\") escaping = true;
      else escaping = false;
      index += 1;
    }
    const decoded = decodeLooseJsonString(raw);
    if (decoded) return decoded;
  }
  return "";
}

function roleBucketToEntries(value, role) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[；;,，、\n]+/);
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((image) => ({ image, role }));
}

function parsedReferenceRoleEntries(parsed = {}) {
  const direct = Array.isArray(parsed.reference_roles)
    ? parsed.reference_roles
    : Array.isArray(parsed.referenceRoles)
    ? parsed.referenceRoles
    : Array.isArray(parsed.image_roles)
    ? parsed.image_roles
    : Array.isArray(parsed.imageRoles)
    ? parsed.imageRoles
    : [];
  if (direct.length) return direct;
  return [
    ...roleBucketToEntries(parsed.base_images || parsed.baseImages || parsed.base_image || parsed.baseImage || parsed.target_base || parsed.targetBase, "base"),
    ...roleBucketToEntries(parsed.material_images || parsed.materialImages || parsed.source_materials || parsed.sourceMaterials || parsed.element_images || parsed.elementImages, "material"),
    ...roleBucketToEntries(parsed.scene_reference_images || parsed.sceneReferenceImages || parsed.background_images || parsed.backgroundImages, "scene_reference"),
    ...roleBucketToEntries(parsed.style_reference_images || parsed.styleReferenceImages, "style_reference"),
    ...roleBucketToEntries(parsed.reference_images || parsed.referenceImages || parsed.context_images || parsed.contextImages, "reference"),
    ...roleBucketToEntries(parsed.ignore_images || parsed.ignoreImages || parsed.excluded_images || parsed.excludedImages, "ignore")
  ];
}

function parsePlannedImagePrompt(content, fallbackPrompt) {
  const cleaned = stripAiJsonText(content);
  if (!cleaned) return { prompt: fallbackPrompt, note: "" };
  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] || "";
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const prompt = String(parsed.prompt || parsed.final_prompt || parsed.image_prompt || fallbackPrompt || "").trim();
      const imagePrompt = String(parsed.image_prompt || parsed.imagePrompt || parsed.prompt || parsed.final_prompt || "").trim();
      return {
        prompt,
        note: String(parsed.note || parsed.summary || parsed.reason || parsed.reference_analysis || "").trim(),
        assetType: String(parsed.asset_type || parsed.assetType || "").trim(),
        outputMode: String(parsed.output_mode || parsed.outputMode || "").trim(),
        operationType: String(parsed.operation_type || parsed.operationType || parsed.intent || parsed.route || "").trim(),
        selectedImagePolicy: String(parsed.selected_image_policy || parsed.selectedImagePolicy || "").trim(),
        imageModelMode: String(parsed.image_model_mode || parsed.imageModelMode || "").trim(),
        referenceRoles: parsedReferenceRoleEntries(parsed),
        designBrief: parsed.design_brief || parsed.designBrief || null,
        taskType: String(parsed.task_type || parsed.taskType || parsed.asset_type || parsed.assetType || "").trim(),
        executionMode: String(parsed.execution_mode || parsed.executionMode || "").trim(),
        designPlan: parsed.design_plan || parsed.designPlan || parsed.design_brief || parsed.designBrief || null,
        imagePrompt,
        thinkingPrompt: imagePrompt,
        layoutSpec: parsed.layout_spec || parsed.layoutSpec || null,
        reviewChecklist: Array.isArray(parsed.review_checklist) ? parsed.review_checklist : Array.isArray(parsed.reviewChecklist) ? parsed.reviewChecklist : []
      };
    } catch {
      const loosePrompt = extractLooseJsonStringField(jsonText, ["image_prompt", "imagePrompt", "prompt", "final_prompt"]);
      const looseTaskType = extractLooseJsonStringField(jsonText, ["task_type", "taskType", "asset_type", "assetType"]);
      const looseExecutionMode = extractLooseJsonStringField(jsonText, ["execution_mode", "executionMode"]);
      const looseSelectedPolicy = extractLooseJsonStringField(jsonText, ["selected_image_policy", "selectedImagePolicy"]);
      const looseImageModelMode = extractLooseJsonStringField(jsonText, ["image_model_mode", "imageModelMode"]);
      if (loosePrompt) {
        return {
          prompt: loosePrompt,
          imagePrompt: loosePrompt,
          thinkingPrompt: loosePrompt,
          note: "思考模型返回 JSON 不完整，已恢复 image_prompt 字段。",
          taskType: looseTaskType,
          assetType: looseTaskType,
          executionMode: looseExecutionMode,
          selectedImagePolicy: looseSelectedPolicy,
          imageModelMode: looseImageModelMode
        };
      }
      return {
        prompt: fallbackPrompt,
        imagePrompt: fallbackPrompt,
        note: "思考模型返回 JSON 不完整，已回退使用用户原始需求。"
      };
    }
  }
  if (/^\s*\{/.test(cleaned)) {
    return {
      prompt: fallbackPrompt,
      imagePrompt: fallbackPrompt,
      note: "思考模型返回 JSON 不完整，已回退使用用户原始需求。"
    };
  }
  return { prompt: cleaned, note: "" };
}

const designAgentPlanIds = new Set(["main-image-matrix-agent", "detail-page-planner-agent"]);

function normalizeDesignAgentPlanId(value = "") {
  const id = String(value || "").trim();
  return designAgentPlanIds.has(id) ? id : "";
}

function designAgentPlanName(agentId = "") {
  if (agentId === "main-image-matrix-agent") return "主图设计 Agent";
  if (agentId === "detail-page-planner-agent") return "详情页设计 Agent";
  return "设计 Agent";
}

function requestedDesignAgentModuleCount(agentId = "", prompt = "", requestedCount = 0) {
  const text = String(prompt || "");
  const isDetail = agentId === "detail-page-planner-agent";
  const maxCount = isDetail ? 32 : 5;
  const explicit = normalizeImageIndexDigits(text).match(/(?:^|[^\d])(?:生成|做|输出|要)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:张|屏|页|个模块|个方向)/);
  if (explicit) return Math.max(1, Math.min(maxCount, imageIndexTokenToNumber(explicit[1]) || 1));
  if (/单张|一张|1张|只做|首图|首屏|单屏|一屏/.test(text)) return 1;
  const uiCount = Number(requestedCount || 0);
  if (isDetail && (!Number.isFinite(uiCount) || uiCount <= 1)) return 0;
  if (!isDetail) return 5;
  if (Number.isFinite(uiCount) && uiCount > 1) return Math.max(1, Math.min(maxCount, Math.floor(uiCount)));
  return 0;
}

function designAgentDefaultModule(agentId = "", index = 1) {
  const main = [
    ["首图点击", "用最强第一眼构图展示产品主体和核心利益点", "清晰产品主视觉，强点击但不过度促销"],
    ["核心卖点", "解释产品最重要的功能价值", "信息卡片、卖点标签和产品细节结合"],
    ["场景代入", "让用户看到使用场景和目标人群", "模特或生活场景，保持同一视觉系统"],
    ["对比转化", "建立购买理由或差异化优势", "对比结构、简洁数据或利益点收口"],
    ["活动收口", "用购买理由、活动氛围或品牌价值完成转化收口", "延续整套视觉系统，用产品主视觉和简洁利益点完成收口"]
  ];
  const detail = [
    ["首屏利益点", "建立产品定位和第一屏购买理由", "详情页首屏，产品/人群/利益点清楚"],
    ["痛点引入", "承接用户问题，说明为什么需要该产品", "痛点场景和简洁问题表达"],
    ["核心卖点", "展开核心功能、结构或材质优势", "产品细节、图标和说明模块"],
    ["材质工艺", "说明材质、结构、工艺或品质细节", "细节放大、结构拆解和短句卖点"],
    ["使用场景", "让用户看到具体使用场景和目标人群", "真实场景、人物或环境代入"],
    ["参数说明", "把规格、尺寸、适用范围等信息清晰表达", "参数卡片和简洁图标系统"],
    ["对比证明", "建立差异化优势或解决方案对比", "对比结构、利益点和证据表达"],
    ["信任收口", "用背书、服务、适用人群或购买理由收尾", "详情页收口模块，干净可信"],
    ["产品全貌", "补充产品整体形态和组合关系", "产品全貌、包装和核心部件有秩序展示"],
    ["人群定位", "说明适合的目标用户和使用需求", "人群标签、使用需求和简洁场景结合"],
    ["第一卖点展开", "把最强卖点拆开讲清楚", "卖点拆解、细节放大和短句说明"],
    ["第二卖点展开", "补充第二购买理由", "结构化信息卡片和产品局部结合"],
    ["第三卖点展开", "补充第三购买理由", "统一图标系统和产品使用画面结合"],
    ["细节特写", "展示材质、纹理、结构或做工细节", "微距细节、柔和光影和少量标注"],
    ["体验说明", "说明使用时的感受和便利性", "使用步骤、手部动作或生活场景"],
    ["安全/安心说明", "建立安全、合规或安心感，不夸大功效", "专业但克制的数据卡片和图标"],
    ["场景一", "展示高频使用场景", "真实生活场景，产品为主，人物辅助"],
    ["场景二", "展示第二个使用场景", "不同场景但延续同一色彩和光源"],
    ["场景三", "展示第三个使用场景", "场景化构图和短句利益点"],
    ["步骤说明", "让用户理解使用流程或操作方法", "1-3步流程图，文字简短可读"],
    ["规格拆解", "解释尺寸、容量、数量或规格", "参数卡片、比例示意和产品图"],
    ["包装说明", "说明包装、收纳、携带或开合方式", "包装细节和使用动作结合"],
    ["对比一", "与普通方案做克制对比", "左右对比结构，不夸大承诺"],
    ["对比二", "强调差异化选择理由", "图表化对比和简洁文案"],
    ["品质证明", "说明品质控制、检测或工艺依据", "证书感/实验室感视觉但不写虚假认证"],
    ["品牌背书", "建立品牌专业感和一致性", "品牌气质、产品家族和可信视觉"],
    ["口碑理由", "总结用户在意的购买理由", "评价关键词式模块，不伪造具体评价"],
    ["适用清单", "列出适用/不适用场景或人群", "清单式卡片，图标简洁"],
    ["常见疑问", "回答购买前常见顾虑", "问答卡片，信息少而清楚"],
    ["购买理由", "收束前面的卖点形成决策理由", "三点理由收口和产品主视觉"],
    ["转化收口", "最后强调安心购买和产品价值", "详情页尾屏，干净可信，不放价格促销"]
  ];
  const source = agentId === "detail-page-planner-agent" ? detail : main;
  const item = source[Math.min(index - 1, source.length - 1)] || source[0];
  return {
    index,
    title: item[0],
    purpose: item[1],
    visualPrompt: item[2],
    copy: [],
    referenceUse: "按用户上传图角色使用参考，不照搬品牌、Logo、原文案、价格或平台水印。",
    avoid: ["不要风格跳变", "不要照抄竞品", "不要生成无关品牌或价格"]
  };
}


function parseDesignAgentPlanningResponse(content = "") {
  const cleaned = stripAiJsonText(content);
  const parsedObjects = extractJsonObjectsFromText(cleaned);
  const structuredPlan = parsedObjects.find((item) => Array.isArray(item?.modules));
  if (structuredPlan) return structuredPlan;
  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] || "";
  try {
    return jsonText ? JSON.parse(jsonText) : {};
  } catch {
    return {};
  }
}

function sanitizeDesignAgentImageReferenceText(value = "", referenceCount = 0) {
  const available = Math.max(0, Math.floor(Number(referenceCount || 0)));
  const replacement = available > 0 ? "已上传参考图" : "参考素材";
  const token = "([1-9]\\d*|[一二两三四五六七八九十]{1,3})";
  return normalizeImageIndexDigits(value)
    .replace(new RegExp(`第\\s*${token}\\s*张\\s*(?:参考图|图片)`, "g"), (full, index) => imageIndexTokenToNumber(index) > available ? replacement : full)
    .replace(new RegExp(`(?:参考图|图片|图)\\s*${token}`, "g"), (full, index) => imageIndexTokenToNumber(index) > available ? replacement : full)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDesignAgentStyleLock(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    palette: String(raw.palette || raw.color || "统一主色、辅助色和文字色；整套图不得一张一个配色。").trim(),
    background: String(raw.background || "统一背景语言、光影和留白节奏。").trim(),
    typography: String(raw.typography || raw.font || "统一标题、卖点标签和正文气质；少字、清晰、可读。").trim(),
    productVisual: String(raw.product_visual || raw.productVisual || "统一产品身份、材质、比例和展示角度，不得改成另一类商品。").trim(),
    layoutSystem: String(raw.layout_system || raw.layoutSystem || raw.decorative_system || raw.decorativeSystem || "统一卡片、标签、图标、分割线和装饰系统。").trim(),
    forbidden: normalizeStringArray(raw.forbidden || raw.avoid).slice(0, 10)
  };
}


function isDetailTemplateOnlyPlanningRequest(prompt = "", hasPlanningMaterials = false) {
  const text = normalizeImageIndexDigits(String(prompt || "")).replace(/\s+/g, " ");
  const explicitlyTrustedProductData = /(?:Excel|excel|表格|工作簿|资料表)[^。；;\n]{0,60}(?:本轮|本产品|新产品|真实|最新)[^。；;\n]{0,60}(?:参数|规格|认证|文案|产品资料)[^。；;\n]{0,36}(?:以此为准|可以使用|属实|真实|有效)/i.test(text)
    || /(?:参数|规格|认证|文案|产品资料)[^。；;\n]{0,60}(?:在|见|来自)[^。；;\n]{0,20}(?:Excel|excel|表格|工作簿|资料表)[^。；;\n]{0,30}(?:以此为准|属实|真实|有效)/i.test(text);
  if (explicitlyTrustedProductData) return false;
  if (/(?:仅|只|单纯)?作为[^。；;\n]{0,20}(?:线框|模板|版式|布局)|(?:Excel|excel|表格|工作簿|资料表)[^。；;\n]{0,40}(?:线框|模板|版式|布局)|(?:线框|模板|版式)[^。；;\n]{0,50}(?:不要沿用|不沿用|旧产品|旧品牌|旧参数|只参考)/i.test(text)) return true;
  if (hasPlanningMaterials && /(?:只参考|不沿用|旧商品|旧产品)[^。；;\n]{0,40}(?:内容|资料|信息|参数|品牌|文案)/i.test(text)) return true;
  return false;
}

const detailPlanHighRiskClaimRules = [
  { id: "percentage", test: /(?:[><≥≤]\s*\d+(?:\.\d+)?\s*%?|\d+(?:\.\d+)?\s*%)/i },
  { id: "standard", test: /\b(?:GB|YY|ISO|EN|ASTM|CE|FDA)\s*[-/\w.]*/i },
  { id: "certification", test: /(?:SGS|CNAS|械字号|备案证|注册证|一类器械|二类器械|三类器械|认证通过|检测通过|权威认证|资质认证|认证证书|检测报告|检验报告|测试报告)/i },
  { id: "medical-claim", test: /(?:(?:0|零)\s*致敏|无致敏|低致敏|细胞毒性|抗菌|抑菌|无菌|灭菌|医用级|医疗级)/i },
  { id: "performance-claim", test: /(?:耐酸|耐碱|耐酸碱|不渗透|防渗透|不透水|防穿刺|耐穿刺|食品接触级|食品接触认证)/i }
];

function detailPlanUnsupportedClaimIds(value = "", rawUserPrompt = "") {
  const text = String(value || "");
  const source = String(rawUserPrompt || "");
  return detailPlanHighRiskClaimRules.filter((rule) => {
    if (!rule.test.test(text)) return false;
    if (rule.id !== "percentage") return !rule.test.test(source);
    const values = [...text.matchAll(/(?:[><≥≤]\s*)?(\d+(?:\.\d+)?)\s*%?/g)].map((match) => match[1]);
    return values.some((number) => !new RegExp(`(?:^|\\D)${String(number).replace(".", "\\.")}(?:\\D|$)`).test(source));
  }).map((rule) => rule.id);
}

function sanitizeUnsupportedDetailClaims(value = "", rawUserPrompt = "") {
  const text = String(value || "").trim();
  if (!text || !detailPlanUnsupportedClaimIds(text, rawUserPrompt).length) return { text, changed: false };
  const parts = text.split(/([\n。；;]+)/);
  let changed = false;
  const cleaned = parts.map((part, index) => {
    if (index % 2 === 1 || !part.trim()) return part;
    if (!detailPlanUnsupportedClaimIds(part, rawUserPrompt).length) return part;
    changed = true;
    return "";
  }).join("")
    .replace(/^[\s。；;]+|[\s。；;]+$/g, "")
    .replace(/([\n。；;]){2,}/g, "$1")
    .trim();
  return { text: cleaned, changed };
}

function stripGeneratedProductColorClaims(value = "") {
  const text = String(value || "").trim();
  if (!text) return { text, changed: false };
  const productToken = "(?:产品|商品|主体|实物|包装|包装盒|罐体|瓶身|盒身|袋身|手套)";
  const colorToken = "(?:颜色|配色|色系|红色|橙色|黄色|绿色|青色|蓝色|紫色|粉色|黑色|白色|灰色|金色|银色)";
  const conflict = new RegExp(`${productToken}[^\u3002；;\n]{0,36}${colorToken}|${colorToken}[^\u3002；;\n]{0,24}${productToken}`, "i");
  const parts = text.split(/([\n。；;]+)/);
  let changed = false;
  const cleaned = parts.map((part, index) => {
    if (index % 2 === 1 || !part.trim() || !conflict.test(part)) return part;
    changed = true;
    return "";
  }).join("")
    .replace(/^[\s。；;]+|[\s。；;]+$/g, "")
    .replace(/([\n。；;]){2,}/g, "$1")
    .trim();
  return { text: cleaned, changed };
}

function stripRepeatedDetailBrandDecorations(value = "") {
  const text = String(value || "").trim();
  if (!text) return text;
  return text.split(/([\n。；;]+)/).map((part, index) => {
    if (index % 2 === 1 || !part.trim()) return part;
    return /(?:品牌|logo)[^。；;\n]{0,36}(?:水印|页眉|顶栏)|(?:水印|页眉|顶栏)[^。；;\n]{0,36}(?:品牌|logo)/i.test(part) ? "" : part;
  }).join("")
    .replace(/^[\s。；;]+|[\s。；;]+$/g, "")
    .replace(/([\n。；;]){2,}/g, "$1")
    .trim();
}

function sanitizeDetailPagePlan(plan = {}, options = {}) {
  if (!plan || plan.mode !== "detail_page") return plan;
  const rawUserPrompt = String(options.rawUserPrompt || "");
  const templateOnly = Boolean(options.templateOnly);
  const productIdentityIndexes = Array.isArray(options.productIdentityIndexes)
    ? options.productIdentityIndexes.filter((value) => Number(value) > 0)
    : [];
  const warnings = [];
  const sanitizeField = (value, flags = {}) => {
    let current = String(value || "").trim();
    let changed = false;
    if (templateOnly) {
      const result = sanitizeUnsupportedDetailClaims(current, rawUserPrompt);
      current = result.text;
      changed = changed || result.changed;
    }
    if (productIdentityIndexes.length && !flags.allowProductColor) {
      const result = stripGeneratedProductColorClaims(current);
      current = result.text;
      changed = changed || result.changed;
    }
    return { text: current, changed };
  };
  const strategy = sanitizeField(plan.strategy);
  if (strategy.changed) warnings.push("已移除策略中模板遗留的未验证产品声称或颜色。");
  plan.strategy = strategy.text || "按模板顺序与统一视觉系统规划详情页，产品事实以本轮身份图和用户明确资料为准。";
  if (productIdentityIndexes.length) {
    const label = productIdentityIndexes.map((index) => `图${index}`).join("、");
    plan.styleLock.productVisual = `${label}为本轮唯一产品身份基准；凡画面出现产品或包装时，其品牌名称、Logo、文字、结构、比例、颜色、材质和识别特征均必须与身份图一致；不得添加其他颜色版本，也不强制每屏重复完整包装。独立品牌标识仅在首屏、品牌背书/收口屏上出现，禁止每屏重复独立 Logo 页眉。`;
  }
  const conflictsWithProductBrand = (value = "") => /(?:禁止|不要|忽略|删除|去除|移除|替换|重做|重新设计)[^。；;]{0,30}(?:品牌|logo|标志|商标|包装文字)|(?:品牌|logo|标志|商标|包装文字)[^。；;]{0,30}(?:禁止|不要|忽略|删除|去除|移除|替换|重做|重新设计)/i.test(String(value));
  plan.styleLock.forbidden = (plan.styleLock.forbidden || []).filter((item) => !conflictsWithProductBrand(item));
  plan.styleLock.layoutSystem = [
    plan.styleLock.layoutSystem,
    "整套是一条连续的长详情页，不是多张独立海报的拼图；中间屏不设独立页眉、页脚、外框、页码或进度点，上下边界背景必须连续。"
  ].filter(Boolean).join("。");
  plan.styleLock.forbidden = [...new Set([
    ...(plan.styleLock.forbidden || []),
    "禁止每屏顶部重复品牌 Logo、固定页眉、页码或进度点",
    "禁止把每屏做成带独立外框和完整收尾的单张海报"
  ])].slice(0, 12);
  plan.modules = (plan.modules || []).map((module) => {
    const fields = {
      title: sanitizeField(module.title),
      purpose: sanitizeField(module.purpose),
      visualPrompt: sanitizeField(module.visualPrompt),
      referenceUse: sanitizeField(module.referenceUse)
    };
    const copy = (module.copy || []).map((item) => sanitizeField(item)).filter((item) => item.text);
    const changed = Object.values(fields).some((item) => item.changed)
      || copy.length !== (module.copy || []).length
      || copy.some((item, index) => item.changed || item.text !== module.copy[index]);
    if (changed) warnings.push(`第${module.index}屏已清除模板旧参数、未验证声称或产品换色指令。`);
    const neutralTitle = templateOnly ? "产品核心信息展示" : `第 ${module.index} 屏`;
    return {
      ...module,
      title: fields.title.text || neutralTitle,
      purpose: fields.purpose.text || "仅展示本轮产品身份图或用户明确提供资料中可确认的信息。",
      visualPrompt: [
        fields.visualPrompt.text || "依照当前模块版式展示真实产品与可确认信息。",
        changed ? "不得出现模板旧产品、旧品牌、未验证参数、认证或功效。" : ""
      ].filter(Boolean).join("。"),
      copy: copy.map((item) => item.text),
      referenceUse: fields.referenceUse.text || "产品只以本轮身份图为准；模板图只参考构图与信息位置。",
      avoid: (module.avoid || []).filter((item) => !conflictsWithProductBrand(item))
    };
  });
  plan.validationWarnings = [...new Set(warnings)];
  return plan;
}

function normalizeDesignAgentPlan(raw = {}, options = {}) {
  const agentId = normalizeDesignAgentPlanId(options.agentId) || "main-image-matrix-agent";
  const count = requestedDesignAgentModuleCount(agentId, options.prompt, options.count);
  const referenceCount = Math.max(0, Number(options.referenceCount || 0));
  const source = raw && typeof raw === "object" ? raw : {};
  const rawModules = Array.isArray(source.modules) ? source.modules : [];
  const targetCount = count > 0
    ? count
    : agentId === "detail-page-planner-agent"
    ? Math.max(4, Math.min(32, rawModules.length || 6))
    : 5;
  const modules = [];
  for (let index = 1; index <= targetCount; index += 1) {
    const item = rawModules.find((module) => Number(module?.index || module?.no || 0) === index)
      || rawModules[index - 1]
      || {};
    const fallback = designAgentDefaultModule(agentId, index);
    modules.push({
      ...fallback,
      index,
      title: String(item.title || item.name || item.module_title || fallback.title).trim(),
      purpose: String(item.purpose || item.goal || item.role || fallback.purpose).trim(),
      visualPrompt: sanitizeDesignAgentImageReferenceText(
        String(item.visual_prompt || item.visualPrompt || item.prompt || fallback.visualPrompt).trim(),
        referenceCount
      ),
      copy: normalizeStringArray(item.copy || item.visible_copy || item.visibleCopy || item.text || []).slice(0, 12),
      referenceUse: sanitizeDesignAgentImageReferenceText(
        String(item.reference_use || item.referenceUse || item.reference_instruction || fallback.referenceUse).trim(),
        referenceCount
      ),
      avoid: normalizeStringArray(item.avoid || item.forbidden || fallback.avoid).slice(0, 8)
    });
  }
  return {
    agentId,
    agentName: designAgentPlanName(agentId),
    mode: agentId === "detail-page-planner-agent" ? "detail_page" : "main_image",
    originalPrompt: String(options.prompt || "").trim(),
    strategy: String(source.strategy || source.page_strategy || source.set_strategy || source.summary || "").trim()
      || (agentId === "detail-page-planner-agent"
        ? "按统一风格锁规划详情页分屏。"
        : "按统一风格锁规划主图套组。"),
    styleLock: normalizeDesignAgentStyleLock(
      source.style_lock
      || source.styleLock
      || source.global_style?.style_lock
      || source.globalStyle?.styleLock
      || source.global_style
      || source.globalStyle
      || {}
    ),
    modules
  };
}

function normalizeDetailPagePlanningMaterials(value, agentId = "") {
  if (normalizeDesignAgentPlanId(agentId) !== "detail-page-planner-agent") return [];
  let remaining = 12000;
  return (Array.isArray(value) ? value : []).slice(0, 3).map((item, index) => {
    const content = String(item?.content || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, remaining);
    remaining -= content.length;
    return {
      name: String(item?.name || `详情页资料表${index + 1}`).replace(/\s+/g, " ").trim().slice(0, 120),
      kind: "spreadsheet",
      moduleCount: Math.max(0, Math.min(32, Math.floor(Number(item?.module_count || item?.moduleCount || 0)))),
      content
    };
  }).filter((item) => item.content);
}





function buildDesignAgentPlanningMessages(options = {}) {
  const agentId = normalizeDesignAgentPlanId(options.agentId);
  const isDetail = agentId === "detail-page-planner-agent";
  const count = requestedDesignAgentModuleCount(agentId, options.prompt, options.count);
  const referenceCount = Math.max(0, Number(options.referenceCount || 0));
  const referenceNames = Array.isArray(options.referenceNames) ? options.referenceNames : [];
  const planningMaterials = normalizeDetailPagePlanningMaterials(options.planningMaterials, agentId);
  const productIdentityIndexes = Array.isArray(options.productIdentityIndexes)
    ? options.productIdentityIndexes.filter((value) => Number(value) > 0)
    : [];
  const referenceRule = referenceCount > 0
    ? `本轮只有图1到图${referenceCount}。描述只能引用真实存在的图号。`
    : "本轮没有上传参考图，禁止虚构图号。";
  const identityRule = productIdentityIndexes.length
    ? `图${productIdentityIndexes.join("、图")}是产品身份图，必须保留真实包装、文字、结构、颜色和识别特征。其他参考图的品牌、价格和水印不得复制。`
    : "不得照抄参考图中的品牌、Logo、价格、原文案或平台水印。";
  const system = [
    "你是资深电商视觉设计总监，只做设计编排，不直接出图。",
    "先识别参考图角色，再规划每张输出图的职责，并为整套图建立统一风格锁。",
    identityRule,
    referenceRule,
    "只输出 JSON，不输出 Markdown 或解释。"
  ].join("\n");
  const user = [
    `Agent：${designAgentPlanName(agentId)}`,
    `任务类型：${isDetail ? "详情页分屏设计" : "电商主图套组设计"}`,
    count > 0 ? `计划输出：${count} 张` : "计划输出：根据内容自动决定 4-32 屏，最多 32 屏。",
    `画幅比例：${options.aspectRatio || "auto"}`,
    `清晰度：${options.imageSize || "1K"}`,
    `参考图数量：${referenceCount}`,
    referenceNames.length ? `参考图编号：${referenceNames.join("；")}` : "",
    referenceRule,
    isDetail
      ? "详情页每屏承担不同模块，最终会纵向拼接；风格、留白、背景语言和模块边界必须连续。"
      : "主图套组每张承担不同转化目标，但视觉系统必须统一。",
    isDetail && options.templateOnly
      ? "资料表只作线框和模块顺序参考；其中旧产品、旧品牌、旧参数、旧认证和示例文案均不是本轮事实。"
      : "",
    "风格锁应明确 palette、background、typography、product_visual、layout_system、forbidden。",
    "每个模块给出 title、purpose、visual_prompt、copy、reference_use、avoid；copy 使用可读短句。",
    "JSON 格式：",
    "{\"strategy\":\"整套设计策略\",\"style_lock\":{\"palette\":\"\",\"background\":\"\",\"typography\":\"\",\"product_visual\":\"\",\"layout_system\":\"\",\"forbidden\":[\"\"]},\"modules\":[{\"index\":1,\"title\":\"\",\"purpose\":\"\",\"visual_prompt\":\"\",\"copy\":[\"\"],\"reference_use\":\"\",\"avoid\":[\"\"]}]}",
    ...planningMaterials.map((material, index) => `--- 资料表${index + 1}：${material.name} ---\n${material.content}\n--- 资料表${index + 1}结束 ---`),
    "用户需求：",
    String(options.rawUserPrompt || options.prompt || "").trim()
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

async function proxyAiDesignAgentPlan(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const agentId = normalizeDesignAgentPlanId(body.agent_id || body.agentId);
    if (!agentId) throw createHttpError(400, "当前 Agent 不需要设计编排确认。");
    const prompt = normalizeAiPromptText(body.prompt);
    const rawUserPrompt = normalizeAiPromptText(body.user_prompt || body.userPrompt || body.prompt);
    if (!prompt) throw createHttpError(400, "请先填写设计需求。");
    const config = await loadIntranetConfig();
    const references = collectImageGenerationReferences(body.references);
    assertPromptReferenceCount(rawUserPrompt, references);
    const mode = normalizeAiThinkingMode(body.thinking_mode) === "deep" ? "deep" : "standard";
    const preparedReferences = await prepareThinkingVisionReferences(references, account.user.id, mode);
    const referenceNames = preparedReferences.images.map((item, index) => `${index + 1}. ${String(item.name || `参考图${index + 1}`).trim()}`);
    const productIdentityIndexes = references.map((item, index) => {
      const role = String(item?.role || "").trim().toLowerCase();
      return ["uploaded_base", "base", "product_identity"].includes(role) ? index + 1 : 0;
    }).filter(Boolean);
    const planningMaterials = normalizeDetailPagePlanningMaterials(body.planning_materials || body.planningMaterials, agentId);
    const templateOnly = agentId === "detail-page-planner-agent"
      && (
        planningMaterials.some((item) => /(?:公司详情页线框模板|模板旧商品示例内容)/.test(String(item?.content || "")))
        || isDetailTemplateOnlyPlanningRequest(rawUserPrompt, planningMaterials.length > 0)
      );
    const apiKey = resolveConfiguredAiKey("imageservice", config, account.user);
    const model = mode === "deep"
      ? String(config?.ai?.deepReasoningModel || defaultImageServicePlannerModel).trim()
      : String(config?.ai?.standardReasoningModel || defaultImageServiceStandardPlannerModel).trim();
    if (!apiKey) throw createHttpError(400, "中控未配置图片模型 Key，无法进行设计编排。");
    if (!model) throw createHttpError(400, "中控未配置思考模型名，无法进行设计编排。");
    const requestedCount = requestedDesignAgentModuleCount(agentId, rawUserPrompt, body.count || body.n || 0);
    const templateModuleCount = planningMaterials.reduce((best, item) => Math.max(best, Number(item.moduleCount || 0)), 0);
    const count = requestedCount || templateModuleCount;
    const result = await requestPrimaryResponsesText(
      apiKey,
      model,
      buildDesignAgentPlanningMessages({
        agentId,
        prompt,
        rawUserPrompt,
        templateOnly,
        count,
        aspectRatio: body.aspect_ratio || body.aspectRatio || "",
        imageSize: body.image_size || body.imageSize || "",
        referenceCount: references.length,
        referenceNames,
        productIdentityIndexes,
        planningMaterials
      }),
      0,
      preparedReferences.images,
      {
        endpoint: configuredCompatibleEndpoints(config, "primary").responses,
        webSearch: Boolean(body.web_search || body.enable_web_search),
        maxOutputTokens: agentId === "detail-page-planner-agent" ? 12000 : 3600
      }
    );
    await recordAiTokenUsage(account.user.id, {
      provider: "primary-responses",
      model,
      source: "design-agent-plan",
      upstream: result.upstream,
      config,
      user: account.user
    }).catch(() => {});
    const plan = normalizeDesignAgentPlan(parseDesignAgentPlanningResponse(result.content), {
      agentId,
      prompt: rawUserPrompt,
      count,
      referenceCount: references.length
    });
    sanitizeDetailPagePlan(plan, {
      rawUserPrompt,
      templateOnly,
      productIdentityIndexes,
      brandProfile: String(body.brand_profile || body.brandProfile || "").trim().toLowerCase()
    });
    sendJson(res, 200, {
      ok: true,
      plan,
      rawText: result.content,
      metadata: {
        agentId,
        model,
        thinkingMode: mode,
        referenceCount: references.length,
        planningMaterialCount: planningMaterials.length,
        templateOnly,
        validationWarnings: plan.validationWarnings || [],
        visualReferenceCount: preparedReferences.images.length,
        skippedReferenceReasons: preparedReferences.skipped
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "设计编排异常" });
  }
}

function isRegenerateLikePrompt(prompt) {
  return /重新做|重新设计|重新生成|重新来|换方向|换一个方向|不要沿用|不要延用|不沿用|不要参考上一张|不要基于上一张|不要基于这张|全新|另做|做一张|生成一张|平台主图|电商主图|商品主图|点击率|高点击|转化率|高转化|推广图|工业海报|商业海报|品牌海报|活动海报|宣传海报|海报|主视觉|详情页|详情图|详情首屏/.test(String(prompt || ""));
}

function isGenericCommerceMainRequest(prompt, options = {}) {
  if (Number(options.referenceCount || 0) > 0) return false;
  const text = String(prompt || "").replace(/\s+/g, "");
  if (!/(平台|电商|商品)?主图|推广图|点击率|高点击|高转化|转化率/.test(text)) return false;
  const residue = text.replace(/生成|做|制作|设计|来|帮我|一张|一个|张|个|平台|电商|商品|主图|推广图|好看|点击率|高点击|高转化|转化率|要|更|比较|的|图|图片|新版|全新|重新|有|点|一些|风格|商业|高级|适合/g, "");
  return residue.length < 3;
}

function isContinueEditLikePrompt(prompt) {
  return /基于这张|基于上一张|继续改|继续修改|沿用这张|延用这张|保留主体|保留这个|保留人物|保留产品|保留姿势|只换|只改|换背景|背景换|改成|修改成|优化这张|修一下这张|这张图/.test(String(prompt || ""));
}

function isCanvasFocusReferenceOnlyPrompt(prompt) {
  const text = String(prompt || "");
  if (isContinueEditLikePrompt(text)) return false;
  return /参考|根据|按照|仿照|借鉴|生成一个|生成一张|做一个|做一张|素材|背景图|模特图|产品图|商品图|不要文字|不要任何文字|无文字|单独/.test(text);
}

function isCanvasFocusEditPrompt(prompt) {
  return isContinueEditLikePrompt(prompt)
    || /选中区域|这个区域|局部|替换|去掉|删除|移除|擦除|修改|调整|优化|美化|换背景|背景换|改成|修改成|只换|只改/.test(String(prompt || ""));
}

function inferDesignIntentHint(prompt, options = {}) {
  const text = String(prompt || "").toLowerCase();
  if (/平台主图|电商主图|商品主图|主图|点击率|高点击|转化率|高转化|推广图/.test(text)) {
    return "commerce_main_image";
  }
  if (/工业海报|商业海报|品牌海报|活动海报|宣传海报|海报|poster|kv|主视觉|banner|横幅/.test(text)) {
    return "poster_or_kv";
  }
  if (/详情页|详情图|详情长图|详情首屏|卖点模块|功能模块/.test(text)) return "detail_page_module";
  if (/透明底|透明背景|无背景|去背景|抠图|透明\s*png|transparent|alpha|素材层/.test(text)) return "transparent_cutout";
  if (/白底|纯白|商品图|产品图|棚拍/.test(text)) return "white_bg_product";
  if (isContinueEditLikePrompt(text) || /修改|换成|保留|沿用|延用|基于这张|参考这张|继续/.test(text)) return "image_edit";
  if (isRegenerateLikePrompt(text)) return "general_commercial_image";
  if (options.hasSelectedBase) return "image_edit";
  if (Number(options.referenceCount || 0) > 0) return "reference_based_generation";
  return "general_commercial_image";
}

function designIntentHintLabel(value) {
  const map = {
    commerce_main_image: "电商主图/推广图",
    poster_or_kv: "商业海报/KV",
    detail_page_module: "详情页模块",
    transparent_cutout: "透明底素材",
    white_bg_product: "白底商品图",
    image_edit: "图片续改",
    reference_based_generation: "参考图生成",
    general_commercial_image: "通用商业图"
  };
  return map[value] || "通用商业图";
}

function isCanvasFocusReference(item) {
  const role = String(item?.role || "").trim().toLowerCase();
  const id = String(item?.id || "").trim().toLowerCase();
  return role === "canvas_focus_region" || id.startsWith("canvas-focus-") || Boolean(item?.focus_target);
}

function isUploadedBaseReference(item) {
  const role = String(item?.role || "").trim().toLowerCase();
  const id = String(item?.id || "").trim().toLowerCase();
  return role === "base" || role === "uploaded_base" || id.startsWith("upload-base-");
}

function isPreviousResultBaseReference(item) {
  const role = String(item?.role || "").trim().toLowerCase();
  const id = String(item?.id || "").trim().toLowerCase();
  return role === "previous_result_base" || id.startsWith("selected-");
}

function isDroppableSelectedContextReference(item) {
  return isPreviousResultBaseReference(item) || isCanvasFocusReference(item);
}

function sanitizeCanvasFocusPrompt(prompt, references = []) {
  const text = String(prompt || "").trim();
  if (!text || !Array.isArray(references) || !references.some(isCanvasFocusReference)) return text;

  const focusMatch = text.match(/本次用户在画布中临时点选[\s\S]*?(?=\n\s*\n用户当前需求[:：]|\n\s*\n你正在进行|\n\s*\n第\s*\d+\s*轮用户需求|$)/);
  const currentMatch = text.match(/用户当前需求[:：]\s*([\s\S]*?)\s*$/);
  if (currentMatch) {
    return [focusMatch?.[0]?.trim(), `用户当前需求：${currentMatch[1].trim()}`]
      .filter(Boolean)
      .join("\n\n");
  }

  const rounds = Array.from(text.matchAll(/第\s*\d+\s*轮用户需求[:：]\s*([^\n]+)/g));
  if (rounds.length) {
    const latest = rounds[rounds.length - 1][1].trim();
    return [focusMatch?.[0]?.trim(), `用户当前需求：${latest}`]
      .filter(Boolean)
      .join("\n\n");
  }

  return focusMatch?.[0]?.trim() || text;
}

function isSelectedBaseReference(item) {
  return isUploadedBaseReference(item)
    || isPreviousResultBaseReference(item)
    || isCanvasFocusReference(item);
}

function normalizeImageIndexDigits(text) {
  return String(text || "").replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function chineseImageIndexToNumber(token) {
  const text = String(token || "").trim();
  if (!text) return 0;
  const digitMap = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (Object.prototype.hasOwnProperty.call(digitMap, text)) return digitMap[text];
  if (text === "十") return 10;
  const teen = text.match(/^十([一二两三四五六七八九])$/);
  if (teen) return 10 + digitMap[teen[1]];
  const tens = text.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
  if (tens) return digitMap[tens[1]] * 10 + (tens[2] ? digitMap[tens[2]] : 0);
  return 0;
}

function imageIndexTokenToNumber(token) {
  const text = String(token || "").trim();
  if (!text) return 0;
  if (/^[1-9]\d*$/.test(text)) return Number(text);
  return chineseImageIndexToNumber(text);
}

function collectPromptImageIndexes(text) {
  const result = new Set();
  const source = normalizeImageIndexDigits(text);
  const patterns = [
    /图\s*([1-9]\d*)/g,
    /图片\s*([1-9]\d*)/g,
    /第\s*([1-9]\d*)\s*张/g,
    /([1-9]\d*)\s*号图/g,
    /图\s*([一二两三四五六七八九十]{1,3})/g,
    /图片\s*([一二两三四五六七八九十]{1,3})/g,
    /第\s*([一二两三四五六七八九十]{1,3})\s*张/g,
    /([一二两三四五六七八九十]{1,3})\s*号图/g
  ];
  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      const value = imageIndexTokenToNumber(match[1]);
      if (value > 0) result.add(value);
    }
  });
  return result;
}

function maxPromptImageIndexInText(text) {
  let maxIndex = 0;
  collectPromptImageIndexes(text).forEach((index) => {
    maxIndex = Math.max(maxIndex, index);
  });
  return maxIndex;
}

function stripNonReferenceImageMentions(prompt) {
  const token = "(?:[1-9]\\d*|[一二两三四五六七八九十]{1,3})";
  let text = normalizeImageIndexDigits(prompt);
  const sourceToOutputPattern = new RegExp(`((?:图\\s*${token}\\s*(?:和|与|跟|及|以及|、|,|，|\\s)*){1,10})\\s*(?:作为|当作)?\\s*(?:基础|基于|素材|来源|原料)?\\s*(?:合成|融合|合并|生成|输出|做成)\\s*(?:输出|生成|做成|得到|产出)?\\s*(?:图|图片)\\s*(${token})`, "g");
  text = text.replace(sourceToOutputPattern, (full, sourcePart, outputToken) => {
    const sourceMax = maxPromptImageIndexInText(sourcePart);
    const outputIndex = imageIndexTokenToNumber(outputToken);
    return outputIndex > sourceMax ? sourcePart : full;
  });
  const standaloneOutputPattern = new RegExp(`(^|[\\s，,。；;：:])(?:请)?(?:生成|输出|做成|得到|产出|导出)\\s*(?:一张|新的|新)?\\s*(?:图|图片)\\s*${token}(?=\\s*(?:$|[\\s，,。；;：:]))`, "g");
  text = text.replace(standaloneOutputPattern, "$1");
  const standaloneOrdinalOutputPattern = new RegExp(`(^|[\\s，,。；;：:])(?:请)?(?:生成|输出|做成|得到|产出|导出)\\s*第\\s*${token}\\s*张(?=\\s*(?:$|[\\s，,。；;：:]))`, "g");
  text = text.replace(standaloneOrdinalOutputPattern, "$1");
  const noUploadPattern = new RegExp(`不(?:需要|用|必)\\s*(?:(?:生成|输出|上传|提供|提交|补充)\\s*(?:或|和|、|,|，)?\\s*){1,4}(?:第\\s*)?(?:图|图片)?\\s*${token}`, "g");
  text = text.replace(noUploadPattern, "");
  const resultNumberPattern = new RegExp(`(?:这里的|此处的|上面的|前面的)?\\s*(?:图|图片)\\s*${token}\\s*(?:只是|仅是|是|为|代表)?\\s*(?:最终|最后|结果|新图|输出|生成|产出)?\\s*(?:新图|图片)?\\s*(?:编号|序号|代号|结果编号)`, "g");
  text = text.replace(resultNumberPattern, "");
  const notUploadedOrdinalPattern = new RegExp(`不(?:代表|表示|等于|是)\\s*(?:已经|已|当前)?\\s*(?:上传|提供|提交|补充)\\s*(?:了)?\\s*第\\s*${token}\\s*张\\s*(?:图|图片)?`, "g");
  text = text.replace(notUploadedOrdinalPattern, "");
  const explicitOutputNumberPattern = new RegExp(`(?:生成|输出|做成|得到|产出|导出)\\s*(?:最终|最后|结果|新图|新的|一张|图片)?\\s*(?:图|图片)\\s*${token}`, "g");
  text = text.replace(explicitOutputNumberPattern, "");
  const ignoreBeforePattern = new RegExp(`(?:不用|不要|排除|忽略|去掉|不使用)\\s*(?:图|图片)\\s*${token}`, "g");
  text = text.replace(ignoreBeforePattern, "");
  const ignoreAfterPattern = new RegExp(`(?:图|图片)\\s*${token}\\s*(?:不用|不要用|不要使用|不要参与|不要提交|排除|忽略|去掉|不使用)`, "g");
  text = text.replace(ignoreAfterPattern, "");
  return text;
}

function maxPromptImageReferenceIndex(prompt) {
  return maxPromptImageIndexInText(stripNonReferenceImageMentions(prompt));
}

function assertPromptReferenceCount(prompt, references = []) {
  const requiredCount = maxPromptImageReferenceIndex(prompt);
  if (requiredCount <= 0) return;
  const availableCount = (Array.isArray(references) ? references : [])
    .filter((item) => item && String(item?.role || "").trim().toLowerCase() !== "ignore")
    .length;
  if (requiredCount > availableCount) {
    throw createHttpError(400, `你提到了图${requiredCount}，但当前只上传了${availableCount}张图，请补充对应图片后再生成。`);
  }
}

function completeDesignAssetTypes() {
  return new Set(["commerce_main_image", "poster_or_kv", "detail_page_module"]);
}

function normalizeAssetType(value, prompt, options = {}) {
  const raw = String(value || "").trim();
  if (raw) return raw;
  return inferDesignIntentHint(prompt, options);
}

function normalizeSelectedImagePolicy(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/use[_-]?as[_-]?base|base|edit|continue|keep|沿用|延用|继续/.test(text)) return "use_as_base";
  if (/context|look|analysis|参考问题|只看|只供|参考/.test(text)) return "context_only";
  if (/ignore|none|drop|不使用|不用/.test(text)) return "ignore";
  return "";
}

function decideSelectedImagePolicy(planned, prompt, options = {}) {
  const references = Array.isArray(options.references) ? options.references : [];
  const hasSelectedImage = Boolean(options.hasSelectedImage || options.hasSelectedBase || references.some(isSelectedBaseReference));
  if (!hasSelectedImage) return "ignore";

  const hasCanvasFocus = references.some(isCanvasFocusReference);
  if (hasCanvasFocus) {
    if (/不要使用画布|不用画布|取消点选|忽略点选|不要基于画布|不要基于这张点选|不要用选区/.test(String(prompt || ""))) return "context_only";
    if (isCanvasFocusEditPrompt(prompt)) return "use_as_base";
    if (isCanvasFocusReferenceOnlyPrompt(prompt) || isRegenerateLikePrompt(prompt)) return "context_only";
    return "context_only";
  }
  if (/不要沿用|不要延用|不沿用|不要参考上一张|不要基于上一张|不要基于这张/.test(String(prompt || ""))) return "context_only";
  if (isContinueEditLikePrompt(prompt)) return "use_as_base";
  if (isRegenerateLikePrompt(prompt)) return "context_only";

  const plannedPolicy = normalizeSelectedImagePolicy(planned?.selectedImagePolicy || planned?.selected_image_policy || planned?.operationType);
  if (plannedPolicy) return plannedPolicy;

  const assetType = normalizeAssetType(planned?.assetType, prompt, options);
  if (completeDesignAssetTypes().has(assetType)) return "context_only";
  if (options.hasSelectedBase) return "use_as_base";
  return "context_only";
}

function normalizeImageModelMode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/text|new|generate|文生|重新/.test(text)) return "text_to_image";
  if (/edit|image|reference|图生|续改|参考/.test(text)) return "image_edit";
  return "";
}

function countReferencesForImageModelPolicy(references = [], selectedImagePolicy = "") {
  const list = Array.isArray(references) ? references : [];
  if (selectedImagePolicy === "use_as_base") return list.length;
  return list.filter((item) => !isDroppableSelectedContextReference(item)).length;
}

function decideImageModelMode(planned, prompt, options = {}) {
  const plannedMode = normalizeImageModelMode(planned?.imageModelMode || planned?.image_model_mode);
  if (plannedMode) return plannedMode;
  const references = Array.isArray(options.references) ? options.references : [];
  const selectedPolicy = options.selectedImagePolicy || decideSelectedImagePolicy(planned, prompt, options);
  const activeReferenceCount = countReferencesForImageModelPolicy(references, selectedPolicy);
  if (selectedPolicy === "use_as_base" || activeReferenceCount > 0) return "image_edit";
  return "text_to_image";
}

function finalizePlannedImagePrompt(planned, originalPrompt, options = {}) {
  const references = Array.isArray(options.references) ? options.references : [];
  const genericCommerceMain = isGenericCommerceMainRequest(originalPrompt, { ...options, referenceCount: references.length });
  const assetType = normalizeAssetType(planned?.assetType, originalPrompt, {
    referenceCount: references.length,
    hasSelectedBase: options.hasSelectedBase
  });
  const selectedImagePolicy = decideSelectedImagePolicy(planned, originalPrompt, {
    ...options,
    references,
    assetType
  });
  const imageModelMode = decideImageModelMode(planned, originalPrompt, {
    ...options,
    references,
    assetType,
    selectedImagePolicy
  });
  const activeReferenceCount = countReferencesForImageModelPolicy(references, selectedImagePolicy);
  const operationType = String(planned?.operationType || "").trim()
    || (selectedImagePolicy === "use_as_base" ? "continue_edit" : activeReferenceCount ? "reference_based_generation" : "new_generation");
  const result = {
    ...planned,
    assetType,
    taskType: normalizeTaskType(planned?.taskType || planned?.assetType, originalPrompt, options),
    selectedImagePolicy,
    imageModelMode,
    operationType,
    executionMode: normalizeExecutionMode(planned?.executionMode, {
      ...options,
      prompt: originalPrompt,
      assetType,
      selectedImagePolicy,
      imageModelMode,
      operationType
    }),
    designPlan: normalizeDesignPlan(planned, originalPrompt, {
      ...options,
      prompt: originalPrompt,
      assetType,
      selectedImagePolicy,
      imageModelMode,
      operationType
    }),
    layoutSpec: normalizeLayoutSpec(planned, originalPrompt, {
      ...options,
      prompt: originalPrompt,
      assetType,
      selectedImagePolicy,
      imageModelMode,
      operationType
    }),
    reviewChecklist: normalizeReviewChecklist(planned?.reviewChecklist || planned?.review_checklist, assetType)
  };
  if (genericCommerceMain && selectedImagePolicy !== "use_as_base") {
    result.assetType = "commerce_main_image";
    result.taskType = "commerce_main_image";
    result.executionMode = "full_ai_image";
    result.imageModelMode = "text_to_image";
    result.operationType = "new_generation";
    result.prompt = originalPrompt;
    result.imagePrompt = originalPrompt;
    result.image_prompt = originalPrompt;
    result.note = result.note
      ? `${result.note}；泛平台主图需求已保留原始提示词，避免思考层过度改写。`
      : "泛平台主图需求已保留原始提示词，避免思考层过度改写。";
    result.designPlan = normalizeDesignPlan(result, originalPrompt, {
      ...options,
      prompt: originalPrompt,
      assetType: result.assetType,
      executionMode: result.executionMode,
      selectedImagePolicy,
      imageModelMode: result.imageModelMode,
      operationType: result.operationType
    });
    result.layoutSpec = normalizeLayoutSpec(result, originalPrompt, {
      ...options,
      prompt: originalPrompt,
      assetType: result.assetType,
      executionMode: result.executionMode,
      selectedImagePolicy,
      imageModelMode: result.imageModelMode,
      operationType: result.operationType
    });
  }
  return result;
}

function normalizeTaskType(value, prompt, options = {}) {
  return normalizeAssetType(value, prompt, options);
}

function normalizeExecutionMode(value, options = {}) {
  const text = String(value || "").trim().toLowerCase();
  if (/ai_material|material.*layout|layout|system_layout|商业排版|系统排版/.test(text)) return "ai_material_plus_layout";
  if (/image_edit|edit|续改|继续/.test(text)) return "image_edit";
  if (/analysis|拆解|建议/.test(text)) return "analysis_only";
  if (/full|complete|整图|海报|kv/.test(text)) return "full_ai_image";

  const assetType = String(options.assetType || "").trim();
  const operationType = String(options.operationType || "").trim();
  if (options.selectedImagePolicy === "use_as_base" || operationType === "continue_edit" || assetType === "image_edit") return "image_edit";
  if (assetType === "commerce_main_image" && isGenericCommerceMainRequest(options.prompt, options)) return "full_ai_image";
  if (["commerce_main_image", "detail_page_module", "transparent_cutout", "white_bg_product", "product_scene"].includes(assetType)) return "ai_material_plus_layout";
  if (["poster_or_kv", "general_commercial_image"].includes(assetType)) return "full_ai_image";
  return "full_ai_image";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[；;、\n]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function promptTitleCandidate(prompt, assetType = "") {
  const cleaned = String(prompt || "")
    .replace(/你正在进行电商图片多轮生成\/修改[\s\S]*?当前补充：/g, "")
    .replace(/第 \d+ 轮用户需求：/g, "")
    .replace(/追加需求 \d+：/g, "")
    .replace(/当前选中的 Skills：[\s\S]*?\n\n/g, "")
    .trim();
  const productMatch = cleaned.match(/(?:生成|做|制作|设计|参考).*?([\u4e00-\u9fa5A-Za-z0-9.%]+(?:袜|液|贴|膏|器|仪|鞋|包|盒|霜|乳|水|杯|灯|机|主图|海报))/);
  const keywordMatch = cleaned.match(/([\u4e00-\u9fa5A-Za-z0-9.%]{2,12})(?:平台主图|电商主图|推广图|海报)/);
  const title = firstNonEmpty(productMatch?.[1], keywordMatch?.[1]);
  if (title) return title.slice(0, 16);
  if (assetType === "poster_or_kv") return "品牌视觉海报";
  if (assetType === "detail_page_module") return "核心卖点";
  return "高转化主图";
}

function normalizeDesignPlan(planned, originalPrompt, options = {}) {
  const raw = planned?.designPlan || planned?.design_plan || planned?.designBrief || planned?.design_brief || {};
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const assetType = String(options.assetType || planned?.assetType || inferDesignIntentHint(originalPrompt, options));
  const goal = firstNonEmpty(rawObject.goal, rawObject.objective, rawObject.title, designIntentHintLabel(assetType));
  return {
    taskType: assetType,
    executionMode: normalizeExecutionMode(planned?.executionMode, { ...options, prompt: originalPrompt, assetType }),
    goal,
    subject: firstNonEmpty(rawObject.subject, rawObject.main_subject, rawObject.product, promptTitleCandidate(originalPrompt, assetType)),
    composition: firstNonEmpty(rawObject.composition, rawObject.layout, assetType === "commerce_main_image" ? "主体居中偏右，左侧/上方保留标题和卖点区，底部可放信任感信息。" : "主体清晰，层次分明，保留安全留白。"),
    title: firstNonEmpty(rawObject.title, rawObject.headline, promptTitleCandidate(originalPrompt, assetType)),
    subtitle: firstNonEmpty(rawObject.subtitle, rawObject.sub_title, rawObject.slogan, assetType === "commerce_main_image" ? "清晰展示核心卖点" : ""),
    sellingPoints: normalizeStringArray(rawObject.selling_points || rawObject.sellingPoints || rawObject.points || rawObject.bullets).slice(0, 4),
    background: firstNonEmpty(rawObject.background, rawObject.scene, "干净、真实、有商业摄影质感。"),
    visualStyle: firstNonEmpty(rawObject.visual_style, rawObject.visualStyle, rawObject.style, "高级、清爽、可信赖的商业视觉。"),
    textStrategy: firstNonEmpty(rawObject.text_strategy, rawObject.textStrategy, "商业文字由系统排版叠加，生图模型尽量不要生成复杂中文。"),
    avoid: normalizeStringArray(rawObject.avoid || rawObject.negative || rawObject.forbidden).slice(0, 8)
  };
}

function normalizeLayoutSpec(planned, originalPrompt, options = {}) {
  const raw = planned?.layoutSpec || planned?.layout_spec || {};
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const assetType = String(options.assetType || planned?.assetType || inferDesignIntentHint(originalPrompt, options));
  const executionMode = normalizeExecutionMode(planned?.executionMode, { ...options, prompt: originalPrompt, assetType });
  const plan = normalizeDesignPlan(planned, originalPrompt, { ...options, prompt: originalPrompt, assetType, executionMode });
  const sellingPoints = plan.sellingPoints.length ? plan.sellingPoints : [
    assetType === "white_bg_product" ? "主体清晰" : "核心卖点突出",
    assetType === "commerce_main_image" ? "提升点击率" : "信息层级清楚",
    "真实可信"
  ];
  const title = firstNonEmpty(rawObject.title, plan.title, promptTitleCandidate(originalPrompt, assetType));
  const subtitle = firstNonEmpty(rawObject.subtitle, plan.subtitle);
  const layout = firstNonEmpty(rawObject.layout, rawObject.template, assetType === "detail_page_module" ? "detail-card" : "main-left-copy");
  const theme = rawObject.theme && typeof rawObject.theme === "object" ? rawObject.theme : {};
  return {
    enabled: executionMode === "ai_material_plus_layout",
    version: 1,
    assetType,
    layout,
    theme: {
      primary: firstNonEmpty(theme.primary, "#0f766e"),
      secondary: firstNonEmpty(theme.secondary, "#f97316"),
      dark: firstNonEmpty(theme.dark, "#111827"),
      light: firstNonEmpty(theme.light, "#ffffff"),
      text: firstNonEmpty(theme.text, "#111827")
    },
    title,
    subtitle,
    sellingPoints: sellingPoints.slice(0, 4),
    badges: normalizeStringArray(rawObject.badges).slice(0, 3),
    safeAreas: Array.isArray(rawObject.safeAreas) ? rawObject.safeAreas : [],
    textBlocks: Array.isArray(rawObject.textBlocks) ? rawObject.textBlocks : []
  };
}

function normalizeReviewChecklist(value, assetType = "") {
  const existing = normalizeStringArray(value);
  if (existing.length) return existing.slice(0, 8);
  const base = ["主体是否完整清晰", "画面主次是否明确", "是否存在乱码文字或错误 Logo"];
  if (assetType === "commerce_main_image") {
    return ["是否像电商主图而不是普通场景照", "标题和卖点是否有点击吸引力", ...base].slice(0, 8);
  }
  if (assetType === "poster_or_kv") {
    return ["是否有海报级视觉冲击", "品牌氛围是否统一", ...base].slice(0, 8);
  }
  return base;
}

function buildDesignReview(planned, metadata = {}) {
  const assetType = String(metadata.assetType || planned?.assetType || planned?.taskType || "");
  const executionMode = String(metadata.executionMode || planned?.executionMode || "");
  const checklist = normalizeReviewChecklist(planned?.reviewChecklist || planned?.review_checklist, assetType);
  const strengths = [];
  const risks = [];
  const nextSuggestions = [];
  if (executionMode === "ai_material_plus_layout") {
    strengths.push("已把中文标题、卖点和商业信息交给系统排版，避免生图模型乱写字。");
    risks.push("AI 原图如果主体不完整或角度不合适，排版图仍然会显得不够像成品主图。");
    nextSuggestions.push("保留当前商品主体，背景更干净，主体占比更大，卖点更集中。");
  } else if (executionMode === "image_edit") {
    strengths.push("本轮按续改处理，会优先保留上一张图的主体和构图。");
    risks.push("如果上一张图本身方向不对，续改会继承它的问题。");
    nextSuggestions.push("重新生成一版，不沿用上一张图。");
  } else {
    strengths.push("本轮更适合整图生成，画面自由度更高。");
    risks.push("整图生成的中文、Logo 和商业排版稳定性不如系统排版。");
    nextSuggestions.push("把标题、卖点改为系统排版，只让 AI 生成背景和主体素材。");
  }
  if (assetType === "commerce_main_image") {
    nextSuggestions.push("做成更像平台高点击主图：主体更大、标题更短、卖点用标签承载、背景更干净。");
  }
  return {
    summary: "已完成一次设计 Agent 复盘，建议先看主体完整度、商业感和文字可控性。",
    checklist,
    strengths,
    risks,
    nextSuggestions: Array.from(new Set(nextSuggestions)).slice(0, 4)
  };
}

function selectedAiSkillNameFromPrompt(prompt = "") {
  const match = String(prompt || "").match(/当前选中的\s*(?:Skills|画布续改\s*Agent|Agent)\s*[:：]\s*([^\n]+)/i);
  return String(match?.[1] || "").trim();
}

function isEcommerceDesignAgentEnabled(prompt = "") {
  const skillName = selectedAiSkillNameFromPrompt(prompt);
  if (!skillName) return false;
  return /电商设计\s*Agent|设计\s*Agent|爆款视觉重构\s*Agent|主图矩阵\s*Agent|详情页策划\s*Agent|场景种草\s*Agent|活动海报\s*Agent|内容平台封面\s*Agent|品牌风格延展\s*Agent|commerce\s*design\s*agent/i.test(skillName);
}

function buildAiDesignMetadata(planned, originalPrompt, requestPrompt, base = {}) {
  const designAgentEnabled = isEcommerceDesignAgentEnabled(originalPrompt);
  if (!designAgentEnabled) {
    return {
      taskType: "",
      executionMode: "",
      designAgentEnabled: false,
      designPlan: null,
      layoutSpec: { enabled: false },
      reviewChecklist: [],
      review: null,
      imagePrompt: String(planned?.imagePrompt || planned?.image_prompt || requestPrompt || planned?.prompt || originalPrompt).trim(),
      originalPrompt,
      referenceCount: Number(base.referenceCount || 0),
      generationReferenceCount: Number(base.generationReferenceCount || 0),
      selectedImagePolicy: String(base.selectedImagePolicy || ""),
      imageModelMode: String(base.imageModelMode || ""),
      submittedReferenceRoles: Array.isArray(base.submittedReferenceRoles) ? base.submittedReferenceRoles : [],
      plannedReferenceRoles: Array.isArray(base.plannedReferenceRoles) ? base.plannedReferenceRoles : [],
      referenceRoleSource: String(base.referenceRoleSource || ""),
      droppedSelectedBaseReferenceCount: Number(base.droppedSelectedBaseReferenceCount || 0)
    };
  }
  const assetType = normalizeAssetType(planned?.assetType, originalPrompt, {
    referenceCount: base.referenceCount,
    hasSelectedBase: base.selectedImagePolicy === "use_as_base"
  });
  const taskType = normalizeTaskType(planned?.taskType || assetType, originalPrompt, base);
  const executionMode = normalizeExecutionMode(planned?.executionMode, { ...base, prompt: originalPrompt, assetType });
  const designPlan = normalizeDesignPlan(planned, originalPrompt, { ...base, prompt: originalPrompt, assetType, executionMode });
  const layoutSpec = normalizeLayoutSpec(planned, originalPrompt, { ...base, prompt: originalPrompt, assetType, executionMode });
  const imagePrompt = String(planned?.imagePrompt || planned?.image_prompt || requestPrompt || planned?.prompt || originalPrompt).trim();
  const metadata = {
    taskType,
    executionMode,
    designAgentEnabled: true,
    designPlan,
    layoutSpec,
    reviewChecklist: normalizeReviewChecklist(planned?.reviewChecklist || planned?.review_checklist, assetType),
    imagePrompt,
    originalPrompt,
    referenceCount: Number(base.referenceCount || 0),
    generationReferenceCount: Number(base.generationReferenceCount || 0),
    selectedImagePolicy: String(base.selectedImagePolicy || ""),
    imageModelMode: String(base.imageModelMode || ""),
    submittedReferenceRoles: Array.isArray(base.submittedReferenceRoles) ? base.submittedReferenceRoles : [],
    plannedReferenceRoles: Array.isArray(base.plannedReferenceRoles) ? base.plannedReferenceRoles : [],
    referenceRoleSource: String(base.referenceRoleSource || ""),
    droppedSelectedBaseReferenceCount: Number(base.droppedSelectedBaseReferenceCount || 0)
  };
  metadata.review = buildDesignReview(planned, { ...base, ...metadata, assetType, executionMode });
  return metadata;
}

function summarizeImageReferenceRoles(references = []) {
  return (Array.isArray(references) ? references : []).map((item, index) => ({
    index: index + 1,
    id: String(item?.id || ""),
    name: String(item?.name || `图${index + 1}`),
    role: String(item?.role || "uploaded_reference"),
    plannedRole: String(item?.plannedRole || ""),
    plannedScope: String(item?.plannedScope || ""),
    plannedStrength: String(item?.plannedStrength || ""),
    plannedExplicit: Boolean(item?.plannedExplicit),
    plannedInstruction: String(item?.plannedInstruction || ""),
    width: Number(item?.width || 0),
    height: Number(item?.height || 0),
    aspectRatio: String(item?.aspect_ratio || item?.aspectRatio || ""),
    hasFocusTarget: Boolean(item?.focus_target)
  }));
}

function normalizePlannedReferenceRole(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/ignore|exclude|drop|none|不用|不要|忽略|排除|不使用/.test(text)) return "ignore";
  if (/output|result|target_output|输出图|结果图/.test(text)) return "ignore";
  if (/base|target|main|background_base|canvas|底图|主图|目标图|承载图|画面主体|最终画面/.test(text)) return "base";
  if (/material|source|element|pattern|asset|素材|元素|图案|来源|提取/.test(text)) return "material";
  if (/scene|background|environment|场景|背景|环境|展台/.test(text)) return "scene_reference";
  if (/style|look|mood|风格|视觉参考/.test(text)) return "style_reference";
  if (/reference|context|参考|借鉴|对照/.test(text)) return "reference";
  return "";
}

function normalizePlannedReferenceStrength(value, role = "") {
  const text = String(value || "").trim().toLowerCase();
  if (/required|must|locked|critical|核心|必须|锁定/.test(text)) return "required";
  if (/strong|high|明确|强/.test(text)) return "strong";
  if (/flexible|soft|inspiration|weak|灵感|自由|弱/.test(text)) return "flexible";
  if (role === "base" || role === "material") return "required";
  if (role === "scene_reference" || role === "style_reference") return "strong";
  return "flexible";
}

function normalizePlannedReferenceScope(value, role = "", instruction = "") {
  const text = `${String(value || "").trim().toLowerCase()} ${String(instruction || "").trim().toLowerCase()}`;
  if (/product_identity|subject_identity|identity|产品身份|主体身份|产品外形|包装身份|产品结构|主体结构/.test(text)) return "product_identity";
  if (/surface_attribute|material_attribute|texture|surface|材质属性|表面属性|表面材质|纹理|质感|触感|纤维|光泽|布艺质感/.test(text)) return "surface_attribute";
  if (/composition|layout|camera|构图|版式|信息层级|区块比例|镜头|主体位置/.test(text)) return "composition";
  if (/lighting|light_direction|光线|光影|主光|侧光|逆光|照明/.test(text)) return "lighting";
  if (/scene|environment|background|场景|背景|环境|空间|台面/.test(text)) return "scene";
  if (/visual_style|style|风格|色调|氛围|画面气质/.test(text)) return "visual_style";
  if (/accessory|prop|配件|道具|装饰/.test(text)) return "accessory";
  if (role === "scene_reference") return "scene";
  if (role === "style_reference") return "visual_style";
  if (role === "base") return "product_identity";
  if (role === "material") return "product_identity";
  return "general_reference";
}

function referenceRoleImageIndex(entry = {}, references = []) {
  const direct = entry.index ?? entry.imageIndex ?? entry.image_index ?? entry.number ?? entry.imageNumber ?? entry.image_number;
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) return Number(direct) - 1;

  const idText = String(entry.id || entry.imageId || entry.image_id || "").trim();
  if (idText) {
    const idIndex = references.findIndex((item) => String(item?.id || "") === idText);
    if (idIndex >= 0) return idIndex;
  }

  const text = normalizeImageIndexDigits(firstNonEmpty(
    entry.image,
    entry.imageLabel,
    entry.image_label,
    entry.name,
    entry.label,
    entry.target,
    entry.source
  ));
  const numeric = text.match(/(?:图|图片|第)?\s*([1-9]\d*)\s*(?:张|号图)?/);
  if (numeric) return Number(numeric[1]) - 1;
  const chinese = text.match(/(?:图|图片|第)?\s*([一二两三四五六七八九十]{1,3})\s*(?:张|号图)?/);
  if (chinese) return chineseImageIndexToNumber(chinese[1]) - 1;
  return -1;
}

function normalizePlannedReferenceRoles(planned = {}, references = []) {
  const entries = Array.isArray(planned?.referenceRoles)
    ? planned.referenceRoles
    : Array.isArray(planned?.reference_roles)
    ? planned.reference_roles
    : [];
  const byIndex = new Map();
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const index = referenceRoleImageIndex(entry, references);
    if (index < 0 || index >= references.length) return;
    const role = normalizePlannedReferenceRole(entry.role || entry.type || entry.use || entry.usage || entry.kind);
    if (!role) return;
    const instruction = String(entry.instruction || entry.usage || entry.use || entry.note || "").trim().slice(0, 180);
    byIndex.set(index, {
      index: index + 1,
      role,
      strength: normalizePlannedReferenceStrength(entry.strength || entry.priority || entry.weight, role),
      scope: normalizePlannedReferenceScope(entry.scope || entry.referenceScope || entry.reference_scope, role, instruction),
      instruction,
      reason: String(entry.reason || entry.note || "").trim().slice(0, 180)
    });
  });
  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

function inferPromptReferenceRoles(prompt = "", references = []) {
  const count = Array.isArray(references) ? references.length : 0;
  if (!count) return [];
  const text = normalizeImageIndexDigits(prompt).replace(/[，、]/g, " ");
  const token = "([1-9]\\d*|[一二两三四五六七八九十]{1,3})";
  const roles = new Map();
  const priority = {
    ignore: 100,
    base: 80,
    material: 60,
    scene_reference: 50,
    style_reference: 45,
    reference: 20
  };
  const setRole = (number, role, instruction = "", customPriority) => {
    const index = Number(number) - 1;
    if (index < 0 || index >= count) return;
    const nextPriority = Number(customPriority || priority[role] || 1);
    const current = roles.get(index);
    if (current && current.priority > nextPriority) return;
    if (current?.role === "ignore" && role !== "ignore") return;
    roles.set(index, {
      index: index + 1,
      role,
      instruction,
      reason: instruction,
      priority: nextPriority
    });
  };
  const setRoleFromToken = (value, role, instruction = "", customPriority) => {
    const number = imageIndexTokenToNumber(value);
    if (number > 0) setRole(number, role, instruction, customPriority);
  };
  const setRoleFromText = (value, role, instruction = "", customPriority) => {
    collectPromptImageIndexes(value).forEach((number) => setRole(number, role, instruction, customPriority));
  };

  const sourceToOutputPattern = new RegExp(`((?:图\\s*(?:[1-9]\\d*|[一二两三四五六七八九十]{1,3})\\s*(?:和|与|跟|及|以及|、|,|，|\\s)*){1,10})\\s*(?:作为|当作)?\\s*(?:基础|基于|素材|来源|原料)?\\s*(?:合成|融合|合并|生成|输出|做成)\\s*(?:输出|生成|做成|得到|产出)?\\s*(?:图|图片)\\s*${token}`, "g");
  for (const match of text.matchAll(sourceToOutputPattern)) {
    const sourceText = match[1] || "";
    const outputNumber = imageIndexTokenToNumber(match[2]);
    const sourceMax = maxPromptImageIndexInText(sourceText);
    setRoleFromText(sourceText, "reference", "参与合成/融合的输入素材。", priority.reference);
    if (outputNumber > sourceMax) setRole(outputNumber, "ignore", "用户这里说的是输出结果编号，不是上传参考图。", priority.ignore);
  }

  const ignorePatterns = [
    new RegExp(`(?:不用|不要|排除|忽略|去掉|不使用)\\s*((?:图\\s*(?:[1-9]\\d*|[一二两三四五六七八九十]{1,3})\\s*)+)`, "g"),
    new RegExp(`((?:图\\s*(?:[1-9]\\d*|[一二两三四五六七八九十]{1,3})\\s*)+)\\s*(?:不用|不要用|不要使用|不要参与|不要提交|排除|忽略|去掉|不使用)`, "g")
  ];
  ignorePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) setRoleFromText(match[1], "ignore", "用户明确要求不使用这张图。", priority.ignore);
  });

  const applyToTargetPatterns = [
    new RegExp(`(?:把|将)?\\s*图\\s*${token}[^图]{0,36}(?:放到|放进|贴到|贴进|合到|融合到|套到|应用到|移到|加到|加入|替换到|替换进)\\s*图\\s*${token}`, "g"),
    new RegExp(`(?:用|拿)\\s*图\\s*${token}[^图]{0,20}(?:替换|换掉|换成)\\s*图\\s*${token}`, "g")
  ];
  applyToTargetPatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      setRoleFromToken(match[1], "material", "这张图提供要合入/替换的素材或元素。");
      setRoleFromToken(match[2], "base", "这张图是承载修改的底图/目标图。");
    }
  });

  const referenceToTargetPattern = new RegExp(`(?:参考|借鉴|对照|仿照)\\s*图\\s*${token}\\s*(?:生成|输出|做成|制作|变成|套到|应用到)\\s*图\\s*${token}`, "g");
  for (const match of text.matchAll(referenceToTargetPattern)) {
    setRoleFromToken(match[1], "reference", "这张图只作为参考。");
    setRoleFromToken(match[2], "base", "这张图是目标图/底图。");
  }

  const basePatterns = [
    new RegExp(`(?:以|基于|根据|沿用|保留|保持|修改)\\s*图\\s*${token}`, "g"),
    new RegExp(`图\\s*${token}[^图]{0,28}(?:作为|当作|用作|为)?\\s*(?:底图|基图|主图|基础|主体|承载图|目标图)`, "g"),
    new RegExp(`图\\s*${token}[^图]{0,24}(?:保持|保留)(?:不变|不改|原样)`, "g")
  ];
  basePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) setRoleFromToken(match[1], "base", "用户要求保留/基于这张图。");
  });

  const materialPattern = new RegExp(`图\\s*${token}[^图]{0,32}(?:材质|图案|元素|纹理|表盘|主体|商品|产品)`, "g");
  for (const match of text.matchAll(materialPattern)) {
    setRoleFromToken(match[1], "material", "这张图提供材质、图案、元素或主体。", priority.material);
  }
  const stylePattern = new RegExp(`图\\s*${token}[^图]{0,32}(?:风格|色调|光线|氛围|动效|走势|背景)`, "g");
  for (const match of text.matchAll(stylePattern)) {
    setRoleFromToken(match[1], "style_reference", "这张图提供风格、色调、光线或背景参考。", priority.style_reference);
  }
  const referencePattern = new RegExp(`(?:参考|借鉴|对照|仿照|只参考|只取|提取)\\s*图\\s*${token}`, "g");
  for (const match of text.matchAll(referencePattern)) {
    setRoleFromToken(match[1], "reference", "这张图只作为参考。", priority.reference);
  }

  return Array.from(roles.values())
    .sort((a, b) => a.index - b.index)
    .map(({ priority: _priority, ...entry }) => entry);
}

function inferExplicitReferenceScopes(prompt = "", references = []) {
  const count = Array.isArray(references) ? references.length : 0;
  if (!count) return [];
  const text = normalizeImageIndexDigits(prompt);
  const token = "([1-9]\\d*|[一二两三四五六七八九十]{1,3})";
  const pattern = new RegExp(`(?:第\\s*)?图(?:片)?\\s*${token}\\s*([^图。；;\\n]{0,80})`, "g");
  const entries = new Map();
  for (const match of text.matchAll(pattern)) {
    const number = imageIndexTokenToNumber(match[1]);
    const index = number - 1;
    if (index < 0 || index >= count) continue;
    const instruction = String(match[2] || "").replace(/^[：:\s，,]+|[，,\s]+$/g, "").trim().slice(0, 180);
    if (!instruction) continue;
    let scope = "";
    let role = "reference";
    let strength = "strong";
    if (/(?:产品|商品|主体|外形|包装|瓶身|盒体|结构|身份)/.test(instruction)) {
      scope = "product_identity";
      role = "material";
      strength = "required";
    } else if (/(?:材质|纹理|质感|触感|纤维|光泽|表面|布艺|金属感|木纹)/.test(instruction)) {
      scope = "surface_attribute";
      role = "material";
    } else if (/(?:背景|场景|环境|空间|台面|房间|室内|室外)/.test(instruction)) {
      scope = "scene";
      role = "scene_reference";
    } else if (/(?:构图|版式|排版|信息层级|区块|留白|镜头|角度|主体位置)/.test(instruction)) {
      scope = "composition";
      role = "style_reference";
    } else if (/(?:光线|光影|主光|侧光|逆光|照明|色温)/.test(instruction)) {
      scope = "lighting";
      role = "style_reference";
    } else if (/(?:风格|色调|氛围|画面气质|视觉语言)/.test(instruction)) {
      scope = "visual_style";
      role = "style_reference";
    } else if (/(?:配件|道具|装饰|点缀)/.test(instruction)) {
      scope = "accessory";
      role = "material";
    }
    if (!scope) continue;
    entries.set(index, {
      index: index + 1,
      role,
      scope,
      strength,
      instruction,
      reason: "用户明确说明图片用途。",
      explicit: true
    });
  }
  return Array.from(entries.values()).sort((a, b) => a.index - b.index);
}

function plannedRoleToReferenceRole(role) {
  if (role === "base") return "uploaded_base";
  if (role === "material") return "material_reference";
  if (role === "scene_reference") return "scene_reference";
  if (role === "style_reference") return "style_reference";
  if (role === "ignore") return "ignore";
  return "uploaded_reference";
}

function buildPlannedReferenceRolePlan(originalReferences = [], planned = {}, prompt = "", options = {}) {
  const references = normalizeReferenceRolesForImageModel(originalReferences, prompt);
  const plannedRoles = normalizePlannedReferenceRoles(planned, references);
  const promptRoles = inferPromptReferenceRoles(prompt, references);
  const explicitScopes = inferExplicitReferenceScopes(prompt, references);
  if (!plannedRoles.length && !promptRoles.length && !explicitScopes.length) return null;
  const enhancedRoleTable = options.multiReferenceEnhancementMode === "role_table";
  const roleByIndex = new Map();
  if (enhancedRoleTable) {
    plannedRoles.forEach((item) => roleByIndex.set(item.index - 1, {
      ...item,
      role: item.role === "ignore" ? "reference" : item.role,
      strength: "flexible",
      explicit: false
    }));
    promptRoles.forEach((item) => roleByIndex.set(item.index - 1, {
      ...item,
      explicit: true
    }));
    explicitScopes.forEach((item) => roleByIndex.set(item.index - 1, item));
  } else {
    promptRoles.forEach((item) => roleByIndex.set(item.index - 1, item));
    plannedRoles.forEach((item) => {
      const promptRole = roleByIndex.get(item.index - 1);
      if (promptRole?.role === "ignore" && item.role !== "ignore") return;
      roleByIndex.set(item.index - 1, item);
    });
  }
  const mergedRoles = Array.from(roleByIndex.values()).sort((a, b) => a.index - b.index);
  const hasPlannedBase = mergedRoles.some((item) => item.role === "base" && (!enhancedRoleTable || item.explicit));
  const mapped = references.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    const plannedRole = roleByIndex.get(index);
    if (!plannedRole) {
      if (hasPlannedBase && isUploadedBaseReference(item)) {
        return {
          ...item,
          role: "uploaded_reference",
          plannedRole: "reference",
          plannedInstruction: "思考模型已指定其他图片为底图，本图降级为参考图。"
        };
      }
      return item;
    }
    if (enhancedRoleTable && !plannedRole.explicit) {
      return {
        ...item,
        role: String(item?.role || "uploaded_reference").toLowerCase() === "ignore" ? "uploaded_reference" : (item?.role || "uploaded_reference"),
        plannedRole: plannedRole.role === "ignore" ? "reference" : plannedRole.role,
        plannedScope: normalizePlannedReferenceScope(plannedRole.scope, plannedRole.role, plannedRole.instruction),
        plannedStrength: "flexible",
        plannedExplicit: false,
        plannedInstruction: plannedRole.instruction || plannedRole.reason || "作为辅助视觉参考"
      };
    }
    return {
      ...item,
      role: plannedRoleToReferenceRole(plannedRole.role),
      plannedRole: plannedRole.role,
      plannedScope: normalizePlannedReferenceScope(plannedRole.scope, plannedRole.role, plannedRole.instruction),
      plannedStrength: normalizePlannedReferenceStrength(plannedRole.strength, plannedRole.role),
      plannedExplicit: Boolean(plannedRole.explicit),
      plannedInstruction: plannedRole.instruction || plannedRole.reason || ""
    };
  });
  const filtered = mapped.filter((item) => String(item?.role || "").trim().toLowerCase() !== "ignore");
  if (!filtered.length) return null;
  const selectedImagePolicy = filtered.some(isSelectedBaseReference) ? "use_as_base" : "context_only";
  return {
    references: filtered,
    droppedSelectedBaseCount: mapped.length - filtered.length,
    selectedImagePolicy,
    imageModelMode: "image_edit",
    assetType: normalizeAssetType(planned?.assetType, prompt, options),
    plannedReferenceRoles: mergedRoles,
    referenceRoleSource: plannedRoles.length ? (promptRoles.length ? "thinking+prompt" : "thinking") : "prompt"
  };
}

function buildImageReferenceRolePrompt(references = []) {
  const list = Array.isArray(references) ? references.filter(Boolean).slice(0, maxImageServiceReferences) : [];
  if (!list.length) return "";
  return list.map((item, index) => {
    const role = String(item?.role || "").trim().toLowerCase();
    const scope = normalizePlannedReferenceScope(item?.plannedScope, item?.plannedRole || role, item?.plannedInstruction);
    const name = String(item?.name || "").trim();
    const label = `图${index + 1}${name ? `（${name.slice(0, 48)}）` : ""}`;
    const extra = item?.plannedInstruction ? `补充要求：${String(item.plannedInstruction).slice(0, 120)}。` : "";
    if (role === "ignore") return `${label}：本轮不要提交给出图模型。`;
    if (scope === "composition") {
      return `${label}：版式母板，只提取标题行数、网格、留白、图文比例和信息层级；禁止提取颜色、辅助线、占位块、示例产品、品牌、参数、认证或文案。${extra}`;
    }
    if (isCanvasFocusReference(item)) {
      return `${label}：画布点选图/续改底图，必须作为当前修改对象，保留未要求修改的主体、文字、构图和关键细节。${extra}`;
    }
    if (isSelectedBaseReference(item) || isUploadedBaseReference(item) || role === "base") {
      return `${label}：主图/底图，作为最终画面的核心来源；除非用户明确要求，保留主体、文字、版式、颜色和关键细节，不要被其他参考图替代。${extra}`;
    }
    if (isPreviousResultBaseReference(item)) {
      return `${label}：上一版结果，只有用户明确说继续修改/沿用时才当底图，否则只作上下文参考。${extra}`;
    }
    if (role === "material_reference") {
      return `${label}：素材/元素来源，只提取用户指定的图案、主体或局部元素，融合到主图中，不要替代主图。${extra}`;
    }
    if (role === "scene_reference") {
      return `${label}：场景/背景参考，只提取场景、展台、环境和光影，不要替代主图。${extra}`;
    }
    if (role === "style_reference") {
      return `${label}：风格参考，只提取风格、色调和质感，不要替代主图内容。${extra}`;
    }
    return `${label}：参考图/素材图，只提取用户指定的场景、背景、风格或元素，不要替代主图/底图。${extra}`;
  }).join(" ");
}

function positiveReferenceInstruction(value = "") {
  const clauses = String(value || "")
    .split(/[。；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/(?:不要|不用|不使用|不能|禁止|忽略|排除|去掉|不得|避免|无需|不参与|不替代|不修改|不改动)/i.test(item));
  return clauses.join("；").slice(0, 120);
}

function buildPositiveImageReferenceRoleTable(references = []) {
  const strengthLabels = {
    required: "核心锁定",
    strong: "明确参考",
    flexible: "灵感参考"
  };
  return (Array.isArray(references) ? references : []).filter(Boolean).slice(0, maxImageServiceReferences).map((item, index) => {
    const role = String(item?.role || "").trim().toLowerCase();
    const plannedRole = normalizePlannedReferenceRole(item?.plannedRole || role) || "reference";
    const strength = normalizePlannedReferenceStrength(item?.plannedStrength, plannedRole);
    const scope = normalizePlannedReferenceScope(item?.plannedScope, plannedRole, item?.plannedInstruction);
    const explicit = Boolean(item?.plannedExplicit);
    const name = String(item?.name || "").trim();
    const label = `图${index + 1}${name ? `（${name.slice(0, 48)}）` : ""}`;
    const instruction = positiveReferenceInstruction(item?.plannedInstruction);
    let usage = "提供与用户需求对应的视觉信息";
    let scopeLabel = "综合参考";
    if (scope === "product_identity" || isCanvasFocusReference(item) || isSelectedBaseReference(item) || isUploadedBaseReference(item) || plannedRole === "base") {
      scopeLabel = "产品身份";
      usage = explicit
        ? "作为最终画面的核心产品来源，落实主体身份、关键内容、比例与结构"
        : "辅助理解产品主体、比例、结构与视觉身份";
    } else if (scope === "surface_attribute") {
      scopeLabel = "表面属性";
      usage = "提取材质、纹理、触感、纤维与表面光泽，转化为目标对象的表面表现";
    } else if (scope === "scene" || plannedRole === "scene_reference" || role === "scene_reference") {
      scopeLabel = "场景空间";
      usage = "提供场景、背景、空间层次与环境光线";
    } else if (scope === "composition") {
      scopeLabel = "构图版式";
      usage = "提取镜头角度、主体位置、留白比例与信息层级，文案语义围绕当前用户需求重新组织";
    } else if (scope === "lighting") {
      scopeLabel = "光线方向";
      usage = "提供主光方向、明暗关系、色温与光影节奏";
    } else if (scope === "visual_style" || plannedRole === "style_reference" || role === "style_reference") {
      scopeLabel = "视觉风格";
      usage = "提供视觉风格、色调、光影与画面质感";
    } else if (scope === "accessory") {
      scopeLabel = "配件元素";
      usage = "提供用户指定的配件、道具与局部装饰元素";
    } else if (plannedRole === "material" || role === "material_reference") {
      scopeLabel = "产品元素";
      usage = "提供指定产品、主体、图案或局部元素";
    } else if (isPreviousResultBaseReference(item)) {
      scopeLabel = "视觉连续";
      usage = "提供上一版画面的主体身份与视觉连续性";
    }
    const scopeNeedsExecutionRule = scope === "surface_attribute" || scope === "composition";
    const positiveUsage = instruction && !scopeNeedsExecutionRule
      ? instruction
      : scopeNeedsExecutionRule && instruction
      ? `${instruction}；${usage}`
      : usage;
    return `${label}｜${strengthLabels[strength]}｜${scopeLabel}｜${positiveUsage}`;
  });
}

function buildPositiveMultiReferencePrompt(originalPrompt, references = []) {
  const rawPrompt = String(originalPrompt || "").trim();
  if (!rawPrompt) return "";
  const roleTable = buildPositiveImageReferenceRoleTable(references);
  if (!roleTable.length) return rawPrompt;
  return [
    "用户原始需求：",
    rawPrompt,
    "",
    "参考图角色表：",
    ...roleTable,
    "",
    "执行顺序：先落实核心锁定项，再融合明确参考项，灵感参考项用于丰富画面表达。保持用户指定的创意方向与画面目标。"
  ].join("\n");
}

function collectImageGenerationReferences(value) {
  const references = (Array.isArray(value) ? value : [])
    .filter((item) => item && (item.image_file || item.url || typeof item === "string"));
  if (references.length > maxImageServiceReferences) {
    throw createHttpError(400, `最多支持 ${maxImageServiceReferences} 张参考图，请删除多余图片后再生成。`);
  }
  return references;
}

function buildLightweightImagePrompt(originalPrompt, planned = {}, options = {}) {
  const rawPrompt = String(originalPrompt || "").trim();
  const wantsTransparentOutput = /透明底|透明背景|无背景|去背景|抠图|透明\s*png|transparent|alpha|素材层/i.test(rawPrompt);
  const transparentInstruction = "输出必须是透明背景 PNG：主体之外保持 alpha 透明，不要生成房间、墙面、窗户、光影场景、纯色底或任何矩形背景。";
  const basePrompt = wantsTransparentOutput && !rawPrompt.includes(transparentInstruction)
    ? `${rawPrompt}\n${transparentInstruction}`
    : rawPrompt;
  if (!basePrompt) return "";
  const mode = normalizeAiThinkingMode(planned?.mode || options.thinkingMode);
  if (mode === "off") {
    const explicitRolePrompt = buildImageReferenceRolePrompt(options.references || []);
    return explicitRolePrompt ? `${basePrompt}\n\n图片角色（必须执行）：${explicitRolePrompt}` : basePrompt;
  }

  const selectedImagePolicy = options.selectedImagePolicy || decideSelectedImagePolicy(planned, basePrompt, options);
  const imageModelMode = options.imageModelMode || decideImageModelMode(planned, basePrompt, { ...options, selectedImagePolicy });
  const referenceCount = Number(options.referenceCount || 0);
  const generationReferenceCount = Number(options.generationReferenceCount || 0);
  const hasCanvasFocusReference = Array.isArray(options.references) && options.references.some(isCanvasFocusReference);
  const hasUploadedBaseReference = Array.isArray(options.references) && options.references.some(isUploadedBaseReference);
  const hasPreviousResultReference = Array.isArray(options.references) && options.references.some(isPreviousResultBaseReference);
  const note = String(planned?.note || "").replace(/\s+/g, " ").trim();
  const details = [];

  if (hasCanvasFocusReference) {
    details.push("用户本轮在画布中 Ctrl 点选了图片局部；必须以这张点选图片作为图生图底图，并优先响应当前需求。");
  } else if (selectedImagePolicy === "use_as_base") {
    details.push(hasPreviousResultReference && !hasUploadedBaseReference
      ? "用户明确要求继续修改时，才把选中的上一版作为底图。"
      : "用户上传的主图/底图必须作为图生图依据，按用户原话中的图号关系处理。");
  } else if (selectedImagePolicy === "context_only") {
    if (hasPreviousResultReference && !hasUploadedBaseReference) {
      details.push("选中的上一版只用于理解问题和方向，不作为底图。");
    } else if (hasUploadedBaseReference) {
      details.push("用户上传的图片按图号参与最终出图，不要只把图片改写成文字描述。");
    }
  }
  if (referenceCount > 0) {
    details.push(`本轮共有 ${referenceCount} 张图片；按用户原话中的图1、图2、图3关系使用。`);
  }
  if (generationReferenceCount > 0) {
    details.push(`实际提交给生图模型的参考图 ${generationReferenceCount} 张。`);
  }
  const referenceRolePrompt = buildImageReferenceRolePrompt(options.references || []);
  if (referenceRolePrompt) {
    details.push(`图片角色：${referenceRolePrompt}`);
  }
  if (imageModelMode === "text_to_image") {
    details.push("这是重新生成，不要被上一张结果限制。");
  }
  if (note && note.length <= 180) {
    details.push(`轻量理解：${note}`);
  }

  if (!details.length) return basePrompt;
  return [
    "用户原始需求：",
    basePrompt,
    "",
    "上下文说明：",
    details.join(" "),
    "",
    "请优先按用户原始需求执行；上下文说明只用于判断图片关系和是否沿用旧图，不要过度改写用户意图。"
  ].join("\n");
}

function shouldUseFirstReferenceAsImplicitBase(prompt, references = []) {
  return false;
}


function normalizeMultiReferenceAbMode(value, workflow = "", referenceCount = 0) {
  if (!/^formal_multiref_ab_/i.test(String(workflow || "").trim())) return "";
  if (Number(referenceCount || 0) < 2) return "";
  const text = String(value || "").trim().toLowerCase();
  if (text === "role_table") return "role_table";
  if (text === "original") return "original";
  return "";
}

function isMultiReferenceEnhancementExcluded(options = {}) {
  const workflow = String(options.workflow || "").trim().toLowerCase();
  const references = Array.isArray(options.references) ? options.references : [];
  if (isDetailPageAiWorkflow(workflow)) return true;
  if (workflow === "canvas_image_edit" || /(?:^|_)(?:agent|design_plan|image_edit)(?:_|$)/.test(workflow)) return true;
  if (isEcommerceDesignAgentEnabled(options.prompt || "")) return true;
  if (options.forceSelectedBase || options.hasSelectedBase || options.hasSelectedImage) return true;
  if (references.some(isSelectedBaseReference)) return true;
  if (isContinueEditLikePrompt(options.prompt || "") || /局部|框选|选区|蒙版|续改/.test(String(options.prompt || ""))) return true;
  return false;
}

function resolveMultiReferenceEnhancementMode(options = {}) {
  const testMode = normalizeMultiReferenceAbMode(
    options.requestedMode,
    options.workflow,
    Array.isArray(options.references) ? options.references.length : options.referenceCount
  );
  if (testMode) return testMode;
  const references = Array.isArray(options.references) ? options.references : [];
  if (references.length < 2) return "";
  if (normalizeAiThinkingMode(options.thinkingMode) !== "deep") return "";
  if (isMultiReferenceEnhancementExcluded(options)) return "";
  return "role_table";
}


function normalizeReferenceRolesForImageModel(originalReferences = [], prompt = "") {
  const references = Array.isArray(originalReferences) ? originalReferences.filter(Boolean) : [];
  if (!shouldUseFirstReferenceAsImplicitBase(prompt, references)) return references;
  return references.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    if (String(item.role || "").trim().toLowerCase() === "ignore") return item;
    return {
      ...item,
      id: index === 0 && !String(item.id || "").startsWith("upload-base-") ? `upload-base-${item.id || index + 1}` : item.id,
      role: index === 0 ? "uploaded_base" : "uploaded_reference"
    };
  });
}

function referencesForImageModel(originalReferences, planned, prompt, options = {}) {
  const hasImplicitUploadBase = shouldUseFirstReferenceAsImplicitBase(prompt, originalReferences);
  const references = normalizeReferenceRolesForImageModel(originalReferences, prompt);
  if (options.forceSelectedBase) {
    return {
      references,
      droppedSelectedBaseCount: 0,
      selectedImagePolicy: "use_as_base",
      imageModelMode: "image_edit",
      assetType: normalizeAssetType(planned?.assetType, prompt, options)
    };
  }
  const plannedRolePlan = buildPlannedReferenceRolePlan(references, planned, prompt, options);
  if (plannedRolePlan) return plannedRolePlan;
  const hasSelectedBaseReference = references.some(isSelectedBaseReference);
  const selectedImagePolicy = hasImplicitUploadBase ? "use_as_base" : decideSelectedImagePolicy(planned, prompt, {
    ...options,
    references,
    hasSelectedBase: options.hasSelectedBase || hasSelectedBaseReference,
    hasSelectedImage: options.hasSelectedImage || hasSelectedBaseReference
  });
  const filtered = selectedImagePolicy === "use_as_base"
    ? references
    : references.filter((item) => !isDroppableSelectedContextReference(item));
  return {
    references: filtered,
    droppedSelectedBaseCount: references.length - filtered.length,
    selectedImagePolicy,
    imageModelMode: decideImageModelMode(planned, prompt, {
      ...options,
      references: filtered,
      selectedImagePolicy
    }),
    assetType: normalizeAssetType(planned?.assetType, prompt, options),
    plannedReferenceRoles: normalizePlannedReferenceRoles(planned, references),
    referenceRoleSource: "fallback"
  };
}

function buildImageThinkingText(options) {
  if (options.multiReferenceAbMode === "role_table") {
    return buildMultiReferenceRoleTableThinkingText(options);
  }
  const providerLabel = options.targetProvider === "primaryimage" ? "图片服务 A" : options.targetProvider === "imageservice" ? "图片服务" : options.targetProvider || "AI image model";
  const thinkingReferences = Array.isArray(options.references) ? options.references : [];
  const hasExplicitSelectedEditImage = thinkingReferences.some((item) => isPreviousResultBaseReference(item) || isCanvasFocusReference(item));
  const hasDefaultUploadedBase = thinkingReferences.some(isUploadedBaseReference);
  const maxReferenceBriefs = thinkingVisionReferenceLimit(options.thinkingMode || options.mode || "standard");
  const referenceBriefs = Array.isArray(options.references) ? options.references.slice(0, maxReferenceBriefs).map((item, index) => {
    const name = String(item?.name || `图${index + 1}`);
    const roleHint = isCanvasFocusReference(item)
      ? "画布 Ctrl 点选区域。只有用户明确说修改、替换、去掉、换背景或局部调整时才作为图生图底图；如果用户说参考它生成素材，就只理解位置和内容关系。"
      : isPreviousResultBaseReference(item)
      ? "上一轮生成图。只有用户明确说继续编辑、保留、沿用、只换某处时才把它当底图。"
      : isUploadedBaseReference(item)
      ? "用户本轮上传的主图/图生图底图，必须按用户原话中的图号参与最终出图。"
      : "用户上传图片。请按用户话里的图1、图2、图3理解它的用途。";
    return `${index + 1}. ${name}：${roleHint}`;
  }) : [];
  const system = [
    "你是 AI 生图前的轻量理解层，只负责判断图片关系和生成路由，不负责重新创作用户需求。",
    "不要设计复杂工作流，不要输出排版方案，不要输出复盘，不要替系统决定画布合成。",
    "不要大幅改写用户提示词；prompt 字段只允许原样保留或做极轻微整理，不能加一堆用户没说的营销词、文字、构图规则。",
    "如果用户提供图1、图2、图3，请按用户自然语言理解关系，例如“图1参考图2”“图1图2合成图3”“不要图4”。",
    "必须为每张真实上传图输出 reference_roles：role 只能是 base、material、scene_reference、style_reference、reference、ignore。",
    "base 表示最终画面的底图/承载图；material 表示把这张图的主体、图案或元素合到别的图；scene_reference 表示只取场景/背景/展台；style_reference 表示只取风格；reference 表示普通参考；ignore 表示用户明确不用。",
    "如果用户说“把图1的图案合到图2”，图2 是 base，图1 是 material；如果用户说“参考图2生成图1，图1保持不变”，图1 是 base，图2 是 scene_reference 或 reference。",
    "如果用户说“合成/生成图3/输出图3”，图3 通常是输出结果编号，不代表必须有第3张上传图；不要把输出编号当成缺失上传图。",
    "如果用户明确说继续编辑、保留主体、只换背景，intent 用 edit；如果说重新做、换方向、重新生成，intent 用 new；如果主要是参考上传图生成，intent 用 reference。",
    "selected_image_policy 只能是 use_as_base、context_only、ignore；只有明确继续编辑时才用 use_as_base。",
    "image_model_mode 只能是 text_to_image 或 image_edit；重新生成时用 text_to_image，有上传参考图或明确续改时用 image_edit。",
    "不要输出解释，只输出 JSON：{\"intent\":\"new/edit/reference\",\"selected_image_policy\":\"use_as_base/context_only/ignore\",\"image_model_mode\":\"text_to_image/image_edit\",\"reference_roles\":[{\"image\":\"图1\",\"role\":\"base/material/scene_reference/style_reference/reference/ignore\",\"instruction\":\"这张图在最终出图中的用途\"}],\"prompt\":\"尽量保留用户原话\",\"note\":\"一句话说明图片关系\"}"
  ].join("\n");
  const user = [
    `目标生图模型：${providerLabel}`,
    `画幅比例：${options.aspectRatio || "1:1"}`,
    `清晰度/尺寸：${options.imageSize || "1K"}`,
    `生成数量：${options.count || 1}`,
    `图片数量：${options.referenceCount || 0}`,
    Number(options.visualReferenceCount || 0) > 0 ? `本次已提供 ${options.visualReferenceCount} 张可供视觉理解的图片。` : "",
    Array.isArray(options.referenceNames) && options.referenceNames.length ? `图片编号：${options.referenceNames.join("；")}` : "",
    referenceBriefs.length ? `图片说明：\n${referenceBriefs.join("\n")}` : "",
    Array.isArray(options.skippedReferenceReasons) && options.skippedReferenceReasons.length ? `未进入视觉理解的参考图：${options.skippedReferenceReasons.join("；")}` : "",
    hasExplicitSelectedEditImage
      ? "用户已明确选择“继续编辑这张”，请把选中上一版作为底图继续改。"
      : hasDefaultUploadedBase
      ? "前端可能默认把第1张上传图标为主图；这只是兜底提示，不得覆盖用户原话。如果用户说把图1合到图2、贴到图2、应用到图2，应以图2作为底图。"
      : options.hasSelectedImage ? "当前有选中上一版图片，但用户未明确要求沿用时，不要默认当底图。" : "",
    options.webSearch ? "本轮用户开启了联网搜索；如接口支持，请结合公开网络信息理解趋势、商品卖点或风格关键词，但最终 prompt 仍要简洁，不要编造来源。" : "",
    "用户多轮需求：",
    options.prompt
  ].filter(Boolean).join("\n");
  return { system, user };
}

function buildMultiReferenceRoleTableThinkingText(options) {
  const providerLabel = options.targetProvider === "primaryimage" ? "图片服务 A" : options.targetProvider === "imageservice" ? "图片服务" : options.targetProvider || "AI image model";
  const maxReferenceBriefs = thinkingVisionReferenceLimit(options.thinkingMode || options.mode || "standard");
  const referenceBriefs = Array.isArray(options.references) ? options.references.slice(0, maxReferenceBriefs).map((item, index) => {
    const name = String(item?.name || `图${index + 1}`);
    return `${index + 1}. ${name}`;
  }) : [];
  const system = [
    "你是复杂多参考图任务的关系整理器。你的职责是忠实识别用户为每张图片指定的用途，并形成结构化角色表。",
    "保持用户的创意、主体、画面目标与审美方向。角色表用于提升图号关系的准确性。",
    "为每张实际上传图片给出 role、scope、strength 和 instruction。",
    "role 取值：base、material、scene_reference、style_reference、reference、ignore。",
    "scope 取值：product_identity、surface_attribute、scene、composition、lighting、visual_style、accessory、general_reference。",
    "product_identity 用于产品外形、包装、比例和结构；surface_attribute 用于材质、纹理、触感、纤维和表面光泽。",
    "scene 用于环境空间；composition 用于构图和版式；lighting 用于光线方向；visual_style 用于色彩与画面气质；accessory 用于指定配件。",
    "strength 取值：required、strong、flexible。required 表示核心身份或承载画面；strong 表示明确视觉来源；flexible 表示灵感来源。",
    "instruction 使用简短正向描述，例如‘提供产品外形与包装身份’、‘提供室内背景与空间层次’、‘提供镜头角度与主体位置’。",
    "prompt 字段原样保留用户文字。note 用一句话概括图片分工。",
    "输出 JSON：{\"intent\":\"new/edit/reference\",\"selected_image_policy\":\"use_as_base/context_only/ignore\",\"image_model_mode\":\"text_to_image/image_edit\",\"reference_roles\":[{\"image\":\"图1\",\"role\":\"base/material/scene_reference/style_reference/reference/ignore\",\"scope\":\"product_identity/surface_attribute/scene/composition/lighting/visual_style/accessory/general_reference\",\"strength\":\"required/strong/flexible\",\"instruction\":\"正向用途描述\"}],\"prompt\":\"用户原文\",\"note\":\"图片关系摘要\"}"
  ].join("\n");
  const user = [
    `目标生图模型：${providerLabel}`,
    `画幅比例：${options.aspectRatio || "1:1"}`,
    `清晰度/尺寸：${options.imageSize || "1K"}`,
    `图片数量：${options.referenceCount || 0}`,
    Number(options.visualReferenceCount || 0) > 0 ? `已提供 ${options.visualReferenceCount} 张图片用于视觉理解。` : "",
    referenceBriefs.length ? `图片编号：\n${referenceBriefs.join("\n")}` : "",
    "用户需求：",
    options.prompt
  ].filter(Boolean).join("\n");
  return { system, user };
}

function buildImageThinkingMessages(options) {
  const { system, user } = buildImageThinkingText(options);
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function isUnsupportedResponsesWebSearchError(data) {
  const error = data?.error || {};
  const message = String(error.message || data?.message || data?.raw || "");
  const param = String(error.param || data?.param || "");
  const code = String(error.code || data?.code || "");
  const text = `${message} ${param} ${code}`;
  return /(web_search|web_search_preview|tools)/i.test(text) && /(unknown|unsupported|not support|invalid)/i.test(text);
}

function isTransientAiNetworkError(error) {
  const text = [
    error?.code,
    error?.cause?.code,
    error?.cause?.name,
    error?.cause?.message,
    error?.message
  ].filter(Boolean).join(" ");
  return /ConnectTimeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR_SOCKET|fetch failed|socket hang up/i.test(text);
}

async function requestPrimaryResponsesText(apiKey, model, messages, timeoutMs = 0, visionReferences = [], options = {}) {
  const endpoint = String(options.endpoint || primaryResponsesEndpoint).trim() || primaryResponsesEndpoint;
  const input = messages.map((message) => `${message.role === "system" ? "系统要求" : "用户需求"}：\n${message.content}`).join("\n\n");
  const imageContent = (Array.isArray(visionReferences) ? visionReferences : [])
    .filter((item) => item?.dataUrl)
    .map((item) => ({
      type: "input_image",
      image_url: item.dataUrl
    }));
  const buildBody = (withWebSearch = false) => {
    const body = imageContent.length
      ? {
          model,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: input },
              ...imageContent
            ]
          }],
          max_output_tokens: Math.max(300, Math.min(6000, Number(options.maxOutputTokens || 1400)))
        }
      : {
          model,
          input,
          max_output_tokens: Math.max(300, Math.min(6000, Number(options.maxOutputTokens || 1200)))
        };
    if (withWebSearch) body.tools = [{ type: "web_search_preview" }];
    return body;
  };
  const requestOnce = async (withWebSearch = false) => {
    const upstream = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildBody(withWebSearch))
    }, timeoutMs, withWebSearch ? "联网思考" : "深度思考");
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { upstream, data };
  };
  const requestWithNetworkRetry = async (withWebSearch = false) => {
    const attempts = Math.max(1, Number(options.networkRetryAttempts || 3));
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await requestOnce(withWebSearch);
      } catch (error) {
        lastError = error;
        if (!isTransientAiNetworkError(error) || attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    throw lastError;
  };
  let { upstream, data } = await requestWithNetworkRetry(Boolean(options.webSearch));
  if ((!upstream.ok || data?.error) && options.webSearch && isUnsupportedResponsesWebSearchError(data)) {
    ({ upstream, data } = await requestWithNetworkRetry(false));
  }
  if (!upstream.ok || data?.error) {
    throw createHttpError(upstream.status || 502, `深度思考请求失败：${JSON.stringify(data)}`);
  }
  return {
    content: collectPrimaryResponsesText(data),
    upstream: data
  };
}

function normalizeResponsesImagePrompt(raw) {
  let text = String(raw || "").trim();
  if (!text) return "";
  const attrMatch = text.match(/<image_generation\b[^>]*\bprompt\s*=\s*(["'])([\s\S]*?)(?:\1|$)/i);
  if (attrMatch?.[2]) {
    text = attrMatch[2].trim();
  } else if (/^<image_generation\b/i.test(text)) {
    text = text
      .replace(/^<image_generation\b/i, "")
      .replace(/\/?>\s*$/i, "")
      .replace(/^prompt\s*=\s*/i, "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
  }
  return text
    .replace(/<\/?image_generation[^>]*>/gi, "")
    .replace(/^\s*prompt\s*=\s*/i, "")
    .trim();
}

function isUnsupportedResponsesToolChoiceError(data) {
  const error = data?.error || {};
  const message = String(error.message || data?.message || data?.raw || "");
  const param = String(error.param || data?.param || "");
  const code = String(error.code || data?.code || "");
  const text = `${message} ${param} ${code}`;
  return /tool_choice/i.test(text) && /(unknown|unsupported|not support|invalid)/i.test(text);
}

async function requestPrimaryResponsesImageGeneration(apiKey, options = {}) {
  const endpoint = String(options.responsesEndpoint || primaryResponsesEndpoint).trim() || primaryResponsesEndpoint;
  const model = String(options.model || defaultImageServicePlannerModel).trim();
  const prompt = normalizeResponsesImagePrompt(options.plannedPrompt || options.prompt);
  if (!prompt) throw createHttpError(400, "Responses 出图测试缺少提示词。");
  const preparedReferences = await prepareThinkingVisionReferences(options.references || [], options.userId || "", options.thinkingMode || "deep");
  const imageContent = preparedReferences.images.map((item) => ({
    type: "input_image",
    image_url: item.dataUrl
  }));
  const size = normalizeImageServiceSize(options.aspectRatio, options.size);
  const inputText = [
    "使用 image_generation 工具生成一张图片。不要输出文字、XML、Markdown、代码或工具标签。",
    "如果无法生成图片，请返回明确错误，不要用文本模拟工具调用。",
    "如果有参考图，请理解参考图的角色，再生成符合用户需求的新图。",
    "除非用户明确要求，否则不要在图片中生成大段中文文字、Logo、价格和夸张促销字。",
    `用户需求：${prompt}`
  ].join("\n");
  const buildBody = (forceImageTool = true) => ({
    model,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: inputText },
        ...imageContent
      ]
    }],
    tools: [{
      type: "image_generation",
      size
    }],
    ...(forceImageTool ? { tool_choice: {
      type: "image_generation"
    } } : {}),
    max_output_tokens: 1200
  });
  const requestTimeoutMs = isNoTimeoutValue(options.timeoutMs) ? 0 : Number(options.timeoutMs || appDefaultAiRequestTimeoutMs);
  let body = buildBody(true);
  let upstream = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  }, requestTimeoutMs, "Responses 出图测试");
  let text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if ((!upstream.ok || data?.error) && isUnsupportedResponsesToolChoiceError(data)) {
    body = buildBody(false);
    upstream = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }, requestTimeoutMs, "Responses 出图测试");
    text = await upstream.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!upstream.ok || data?.error) {
    throw createHttpError(upstream.status || 502, `Responses 出图请求失败：${JSON.stringify(data)}`);
  }
  const images = collectPrimaryResponsesImages(data);
  if (!images.length) {
    const responseText = collectPrimaryResponsesText(data);
    throw createHttpError(502, `Responses 返回成功但没有图片${responseText ? `：${responseText.slice(0, 300)}` : ""}`);
  }
  await recordAiTokenUsage(options.userId, {
    provider: "responsesimage",
    model,
    source: "responses-image",
    upstream: data,
    config: options.config,
    user: options.user
  }).catch(() => {});
  return {
    provider: "responsesimage",
    model,
    images,
    text: collectPrimaryResponsesText(data),
    metadata: {
      requestedCount: 1,
      imageCount: images.length,
      aspectRatio: normalizeImageServiceAspectRatio(options.aspectRatio),
      size,
      referenceCount: preparedReferences.images.length,
      skippedReferenceReasons: preparedReferences.skipped,
      imageTool: "image_generation",
      originalPrompt: prompt,
      plannedPrompt: prompt
    }
  };
}

async function planAiImagePrompt(config, options) {
  const mode = normalizeAiThinkingMode(options.thinkingMode);
  const originalPrompt = String(options.prompt || "").trim();
  if (mode === "off" || !originalPrompt) {
    return finalizePlannedImagePrompt({ prompt: originalPrompt, mode: "off", model: "", provider: "", note: "" }, originalPrompt, options);
  }

  const preparedReferences = await prepareThinkingVisionReferences(options.references || [], options.userId || "", mode);
  const visionReferences = preparedReferences.images;
  const referenceNames = visionReferences.map((item, index) => `${index + 1}. ${item.name || `参考图${index + 1}`}`);
  const messages = buildImageThinkingMessages({
    ...options,
    prompt: originalPrompt,
    thinkingMode: mode,
    visualReferenceCount: visionReferences.length,
    referenceNames,
    skippedReferenceReasons: preparedReferences.skipped,
    webSearch: Boolean(options.webSearch)
  });
  if (mode === "deep") {
    const endpoints = configuredCompatibleEndpoints(config, "primary");
    const apiKey = resolveConfiguredAiKey("imageservice", config, options.user || null);
    const model = String(config?.ai?.deepReasoningModel || defaultImageServicePlannerModel).trim();
    if (!apiKey) throw createHttpError(400, "中控未配置图片服务 Key，无法使用深度思考。");
    if (!model) throw createHttpError(400, "中控未配置深度思考模型名。");
    const result = await requestPrimaryResponsesText(apiKey, model, messages, 0, visionReferences, { webSearch: Boolean(options.webSearch), endpoint: endpoints.responses });
    await recordAiTokenUsage(options.userId, {
      provider: "primary-responses",
      model,
      source: "image-thinking-deep",
      upstream: result.upstream,
      config,
      user: options.user
    }).catch(() => {});
    const parsed = parsePlannedImagePrompt(result.content, originalPrompt);
    return {
      ...parsed,
      prompt: originalPrompt,
      imagePrompt: originalPrompt,
      image_prompt: originalPrompt,
      thinkingPrompt: parsed.imagePrompt || parsed.image_prompt || parsed.prompt || "",
      note: parsed.note || "",
      mode: "deep",
      provider: "primary-responses",
      model,
      visualReferenceCount: visionReferences.length,
      skippedReferenceReasons: preparedReferences.skipped
    };
  }

  const endpoints = configuredCompatibleEndpoints(config, "primary");
  const apiKey = resolveConfiguredAiKey("imageservice", config, options.user || null);
  const model = String(config?.ai?.standardReasoningModel || defaultImageServiceStandardPlannerModel).trim();
  if (!apiKey) throw createHttpError(400, "中控未配置图片服务 Key，无法使用标准思考。");
  if (!model) throw createHttpError(400, "中控未配置标准思考模型名。");
  const result = await requestPrimaryResponsesText(apiKey, model, messages, 0, visionReferences, { webSearch: Boolean(options.webSearch), endpoint: endpoints.responses });
  await recordAiTokenUsage(options.userId, {
    provider: "primary-responses",
    model,
    source: "image-thinking-standard",
    upstream: result.upstream,
    config,
    user: options.user
  }).catch(() => {});
  const parsed = parsePlannedImagePrompt(result.content, originalPrompt);
  return {
    ...parsed,
    prompt: originalPrompt,
    imagePrompt: originalPrompt,
    image_prompt: originalPrompt,
    thinkingPrompt: parsed.imagePrompt || parsed.image_prompt || parsed.prompt || "",
    note: parsed.note || "",
    mode: "standard",
    provider: "primary-responses",
    model,
    visualReferenceCount: visionReferences.length,
    skippedReferenceReasons: preparedReferences.skipped
  };
}

async function requestPrimaryImageServiceEdit(apiKey, options, count) {
  const endpoint = String(options.imageEditEndpoint || primaryImageEditEndpoint).trim() || primaryImageEditEndpoint;
  const preparedImages = [];
  for (let index = 0; index < options.references.length; index += 1) {
    const file = await imageReferenceToBlob(options.references[index], index, options.userId);
    if (file) {
      preparedImages.push(file);
    }
  }
  if (options.references.length && preparedImages.length < 1) {
    throw createHttpError(400, "画布点选的底图没有传成功，请重新 Ctrl 点选图片后再发送。");
  }

  const buildForm = () => {
    const form = new FormData();
    form.append("model", options.model);
    form.append("prompt", options.prompt);
    form.append("n", String(count));
    form.append("size", options.size);
    form.append("quality", options.quality);
    form.append("output_format", options.outputFormat);
    preparedImages.forEach((file) => form.append("image", file.blob, file.fileName));
    return form;
  };
  const attempts = Math.max(1, Math.min(5, Number(options.networkRetryAttempts || 3)));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const upstream = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: buildForm()
      }, options.timeoutMs, "图片服务图生图");
      return await fetchPrimaryImageServiceJson(upstream);
    } catch (error) {
      lastError = error;
      if (!isTransientAiNetworkError(error) || attempt >= attempts) throw error;
      options.onProgress?.({
        status: "running",
        message: `图片服务连接中断，正在自动重试（${attempt + 1}/${attempts}）`
      });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function requestPrimaryImageServiceText(apiKey, options, count) {
  const endpoint = String(options.imageGenerationEndpoint || primaryImageGenerationEndpoint).trim() || primaryImageGenerationEndpoint;
  return fetchPrimaryImageServiceJson(await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      n: count,
      size: options.size,
      quality: options.quality,
      output_format: options.outputFormat
    })
  }, options.timeoutMs, "图片服务文生图"));
}

function secondaryApiV3Headers(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json"
  };
}

function secondaryApiV3PredictionId(data) {
  return String(data?.data?.id || data?.id || "").trim();
}

function secondaryApiV3PredictionStatus(data) {
  return String(data?.data?.status || data?.status || data?.data?.state || data?.state || "").trim().toLowerCase();
}

function secondaryApiV3PredictionOutputs(data) {
  const urls = [];
  const collect = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (text) urls.push(text);
      return;
    }
    if (typeof value === "object") {
      [
        value.url,
        value.image_url,
        value.imageUrl,
        value.output_url,
        value.outputUrl,
        value.raw_url,
        value.rawUrl
      ].forEach(collect);
    }
  };
  const candidates = [
    data?.data?.outputs,
    data?.outputs,
    data?.data?.output,
    data?.output,
    data?.data?.image_urls,
    data?.image_urls,
    data?.data?.result?.outputs,
    data?.result?.outputs,
    data?.data?.result?.output,
    data?.result?.output
  ];
  candidates.forEach(collect);
  return [...new Set(urls)];
}

function secondaryApiV3PredictionGetUrl(data, base) {
  const direct = String(data?.urls?.get || data?.data?.urls?.get || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const id = secondaryApiV3PredictionId(data);
  return id ? `${base}/predictions/${encodeURIComponent(id)}/result` : "";
}

async function readSecondaryApiV3Json(response, label) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data?.error || data?.data?.error || (data?.code && Number(data.code) >= 400)) {
    throw createHttpError(response.status || 502, `${label}请求失败：${JSON.stringify(data)}`);
  }
  return data;
}

async function pollSecondaryApiV3Prediction(apiKey, url, options = {}) {
  const noTimeout = isNoTimeoutValue(options.timeoutMs);
  const timeoutMs = noTimeout ? 0 : Math.max(30000, Number(options.timeoutMs || appDefaultAiRequestTimeoutMs));
  const started = Date.now();
  let latest = null;
  while (noTimeout || Date.now() - started < timeoutMs) {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: secondaryApiV3Headers(apiKey)
    }, noTimeout ? 0 : Math.min(30000, timeoutMs), "备用图片服务 查询结果");
    latest = await readSecondaryApiV3Json(response, "备用图片服务 查询结果");
    const status = secondaryApiV3PredictionStatus(latest);
    const outputs = secondaryApiV3PredictionOutputs(latest);
    if (["completed", "succeeded", "success", "done", "finished"].includes(status) || outputs.length) return latest;
    if (["failed", "failure", "error", "canceled", "cancelled"].includes(status)) {
      throw createHttpError(502, `备用图片服务 任务失败：${JSON.stringify(latest)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw createHttpError(504, `备用图片服务 任务超时：${JSON.stringify(latest || {})}`);
}

async function requestSecondaryApiV3Prediction(apiKey, pathName, body, options = {}) {
  const base = normalizeSecondaryApiV3BaseUrl(options.baseUrl || defaultSecondaryApiBaseUrl);
  const endpoint = `${base}${pathName}`;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: secondaryApiV3Headers(apiKey),
    body: JSON.stringify(body)
  }, isNoTimeoutValue(options.timeoutMs) ? 0 : Math.min(30000, Number(options.timeoutMs || appDefaultAiRequestTimeoutMs)), "备用图片服务 生图");
  const created = await readSecondaryApiV3Json(response, "备用图片服务 生图");
  const status = secondaryApiV3PredictionStatus(created);
  const outputs = secondaryApiV3PredictionOutputs(created);
  if (["completed", "succeeded", "success", "done", "finished"].includes(status) || outputs.length) return created;
  const getUrl = secondaryApiV3PredictionGetUrl(created, base);
  if (!getUrl) throw createHttpError(502, `备用图片服务 创建成功但没有查询地址：${JSON.stringify(created)}`);
  return pollSecondaryApiV3Prediction(apiKey, getUrl, options);
}

function isSecondaryApiPublicInputUrl(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (host === "0.0.0.0" || host === "127.0.0.1" || host === "::1") return false;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 169 && b === 254 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

function secondaryApiPublicUrlFromReference(value, config = {}) {
  const direct = value?.remoteImageBed || value?.remote || null;
  const rawUrl = String(direct?.rawUrl || direct?.raw_url || "").trim();
  if (isSecondaryApiPublicInputUrl(rawUrl)) return rawUrl;
  const storageDirect = value?.objectStorage || value?.storage || null;
  const signedUrl = String(storageDirect?.signedUrl || storageDirect?.signed_url || "").trim();
  if (isSecondaryApiPublicInputUrl(signedUrl)) return signedUrl;
  const text = String(value?.image_file || value?.url || (typeof value === "string" ? value : "") || "").trim();
  if (isSecondaryApiPublicInputUrl(text)) return text;
  const remoteRef = parseRemoteImageReference(value);
  if (remoteRef?.owner && remoteRef?.repo && remoteRef?.path) {
    const branch = remoteRef.branch || remoteImageBedConfig(config).branch || "main";
    const url = remoteStorageRawUrl(remoteRef.owner, remoteRef.repo, remoteRef.path, branch);
    if (isSecondaryApiPublicInputUrl(url)) return url;
  }
  return "";
}

async function uploadSecondaryApiReferenceToImageBed(value, index, userId, config, temporaryUploads = []) {
  const file = await imageReferenceToBlob(value, index, userId);
  if (!file?.blob) throw createHttpError(400, `第 ${index + 1} 张参考图读取失败，无法上传到图床或对象存储。`);
  const buffer = Buffer.from(await file.blob.arrayBuffer());
  if (!buffer.length) throw createHttpError(400, `第 ${index + 1} 张参考图为空，无法上传到图床或对象存储。`);
  const mime = String(file.blob.type || "image/png").split(";")[0].toLowerCase();
  if (isObjectStorageReady(config)) {
    const uploaded = await uploadObjectStorageBuffer(config, buffer, {
      mime: mime.startsWith("image/") ? mime : "image/png",
      fileName: file.fileName,
      jobId: `secondary-ref-${Date.now()}`,
      index: index + 1,
      name: value?.name || file.fileName || `reference-${index + 1}`
    });
    if (uploaded?.signedUrl) return uploaded.signedUrl;
  }
  if (!isRemoteImageBedReady(config)) {
    throw createHttpError(400, `第 ${index + 1} 张参考图不是公网 URL。备用图片服务图生图需要 input_urls，请先在中控配置对象存储签名 URL 或远程图片存储。`);
  }
  const uploaded = await uploadRemoteImageBedBuffer(config, buffer, {
    mime: mime.startsWith("image/") ? mime : "image/png",
    fileName: file.fileName,
    jobId: `secondary-ref-${Date.now()}`,
    index: index + 1,
    name: value?.name || file.fileName || `reference-${index + 1}`
  });
  if (!uploaded?.rawUrl) throw createHttpError(400, `第 ${index + 1} 张参考图上传图床失败。`);
  if (Array.isArray(temporaryUploads)) temporaryUploads.push(uploaded);
  return uploaded.rawUrl;
}

async function collectSecondaryApiV3InputUrlReferences(references = [], userId = "", config = {}, temporaryUploads = []) {
  const inputUrls = [];
  const skipped = [];
  const list = Array.isArray(references) ? references.slice(0, maxImageServiceReferences) : [];
  for (let index = 0; index < list.length; index += 1) {
    try {
      const publicUrl = secondaryApiPublicUrlFromReference(list[index], config)
        || await uploadSecondaryApiReferenceToImageBed(list[index], index, userId, config, temporaryUploads);
      if (publicUrl) inputUrls.push(publicUrl);
    } catch (error) {
      skipped.push(error.message || `第 ${index + 1} 张参考图公网化失败`);
    }
  }
  return { inputUrls, skipped };
}

function buildSecondaryApiV3ReferenceRolePrompt(prompt, references = []) {
  const rawPrompt = String(prompt || "").trim();
  const list = Array.isArray(references) ? references.slice(0, maxImageServiceReferences) : [];
  if (!list.length) return rawPrompt;
  const roleLines = buildImageReferenceRolePrompt(list);

  const hasBase = list.some(isSelectedBaseReference);
  const hasReference = list.some((item) => !isSelectedBaseReference(item));
  const constraints = [];
  if (!hasBase && list.length > 1 && /(图\s*2|第二张|换成|替换|参考图|素材图)/i.test(rawPrompt)) {
    constraints.push("如果用户没有另外指定，按默认上传顺序理解：图1是底图/主图，图2及之后是参考素材。");
  }
  if (hasBase) {
    constraints.push("不要把参考素材混合成新的主体；只在用户要求的位置做局部修改，底图未提到的区域保持不变。");
  }
  if (hasReference) {
    constraints.push("参考素材只服务于指定替换对象，不要把参考素材中的人物、背景、构图迁移到底图。");
  }
  if (/(敷贴|贴片|膏贴|膏药|肩胛|背部|后背)/.test(rawPrompt)) {
    constraints.push("敷贴替换时，只替换底图背部/肩胛骨处的敷贴外观；不要改变底图人物的性别、年龄、脸部、头发、身体姿势、肤色、床铺和环境。");
  }

  return [
    "用户原始需求：",
    rawPrompt,
    "",
    "本次图生图的图片角色如下，必须严格按编号使用：",
    roleLines,
    "",
    "执行约束：",
    constraints.length ? constraints.join("\n") : "按用户原始需求处理，保持底图稳定，只修改用户明确要求的部分。"
  ].join("\n");
}

async function requestSecondaryApiV3ImageEdit(apiKey, options, count) {
  const temporaryRemoteUploads = [];
  let cleanupReason = "failure";
  try {
    const prepared = await collectSecondaryApiV3InputUrlReferences(options.references || [], options.userId || "", options.config || {}, temporaryRemoteUploads);
    if (prepared.skipped.length) {
      throw createHttpError(400, `备用图片服务 图生图参考图准备失败：${prepared.skipped.join("；")}`);
    }
    if (!prepared.inputUrls.length) {
      const reason = prepared.skipped.length ? `：${prepared.skipped.join("；")}` : "";
      throw createHttpError(400, `参考图没有传成功${reason}`);
    }
    const prompt = buildSecondaryApiV3ReferenceRolePrompt(options.prompt, options.references || []);
    const result = await requestSecondaryApiV3Prediction(apiKey, "/textserviceb/image-model/image-edit", {
      prompt,
      input_urls: prepared.inputUrls,
      aspect_ratio: normalizeSecondaryApiAspectRatio(options.aspectRatio),
      resolution: options.resolutionTier || normalizeSecondaryApiImageResolution(options.requestedSize || options.size)
    }, {
      baseUrl: options.secondaryImageBaseUrl,
      timeoutMs: options.timeoutMs
    });
    cleanupReason = collectImageAssets(result).length ? "success" : "failure";
    return result;
  } finally {
    await queueTemporaryRemoteImageBedCleanup(temporaryRemoteUploads, {
      reason: cleanupReason,
      jobId: options.jobId || "",
      userId: options.userId || ""
    }).catch((error) => {
      console.warn("远程图片存储临时文件清理入队失败：", error.message || error);
    });
  }
}

async function requestSecondaryApiV3ImageText(apiKey, options, count) {
  return requestSecondaryApiV3Prediction(apiKey, "/textserviceb/image-model/text-to-image", {
    prompt: options.prompt,
    aspect_ratio: normalizeSecondaryApiAspectRatio(options.aspectRatio),
    resolution: options.resolutionTier || normalizeSecondaryApiImageResolution(options.requestedSize || options.size)
  }, {
    baseUrl: options.secondaryImageBaseUrl,
    timeoutMs: options.timeoutMs
  });
}

function combineSecondaryApiImageResponses(responses = []) {
  const data = (Array.isArray(responses) ? responses : []).flatMap((response) => (
    collectImageAssets(response).map((image) => {
      const url = String(image?.url || "").trim();
      if (url) return { url };
      const base64 = String(image?.base64 || image?.data || "").trim();
      return base64 ? { b64_json: base64 } : null;
    }).filter(Boolean)
  ));
  return { data };
}

function attachAiProviderFallbackFailure(error, nativeReason, attempts = []) {
  const target = error && typeof error === "object"
    ? error
    : createHttpError(502, String(error || nativeReason?.message || "原生供应商生成失败"));
  const detail = nativeReason?.message || "备用图片服务生成失败：接口没有返回可读原因。";
  target.aiFailureReason = {
    type: nativeReason?.type || "unknown",
    message: `图片服务触发内容安全拦截，已自动切换备用图片服务；备用图片服务仍失败：${detail}`
  };
  target.aiProviderAttempts = Array.isArray(attempts) ? attempts : [];
  return target;
}

function missingAiProviderFallbackError(primaryError, attempts = []) {
  const error = primaryError && typeof primaryError === "object"
    ? primaryError
    : createHttpError(503, String(primaryError || "图片服务内容安全拦截"));
  error.aiFailureReason = {
    type: "fallback_unavailable",
    message: "图片服务触发内容安全拦截，但备用线路未配置，无法自动重试。请联系系统管理员配置备用图片服务。"
  };
  error.aiProviderAttempts = Array.isArray(attempts) ? attempts : [];
  return error;
}

async function runPrimaryImageServiceGeneration(apiKey, options) {
  const endpoints = configuredCompatibleEndpoints(options.config || {}, options.apiProvider || options.imageApiProvider || "");
  const useSecondaryApiV3 = endpoints.provider === "secondary";
  const imageProviderId = useSecondaryApiV3 ? "secondaryimage" : "imageservice";
  const sourceReferences = Array.isArray(options.references) ? options.references.filter(Boolean) : [];
  if (sourceReferences.length > maxImageServiceReferences) {
    throw createHttpError(400, `最多支持 ${maxImageServiceReferences} 张参考图，请删除多余图片后再生成。`);
  }
  const references = sourceReferences.slice(0, maxImageServiceReferences);
  const prompt = sanitizeCanvasFocusPrompt(options.prompt, references);
  const hasReferences = references.length > 0;
  const hasSelectedImage = Boolean(options.hasSelectedImage || options.hasSelectedBase || references.some(isSelectedBaseReference));
  const rawModel = String(options.editModel || options.textModel || "").trim();
  const model = useSecondaryApiV3 && (!rawModel || rawModel === defaultImageServiceEditModel)
    ? defaultSecondaryApiImageModel
    : (rawModel || defaultImageServiceEditModel);
  const requestDimensions = resolveImageServiceRequestDimensions(options.aspectRatio, options.size, options.workflow);
  const aspectRatio = requestDimensions.aspectRatio;
  const size = requestDimensions.primarySize;
  const quality = normalizeImageServiceQuality(options.quality);
  const outputFormat = normalizeImageServiceOutputFormat(options.outputFormat);
  const count = Math.min(Math.max(Number(options.count || 1), 1), aiImageMaxActiveJobsPerUser);
  const timeoutMs = 0;
  const multiReferenceAbMode = normalizeMultiReferenceAbMode(options.multiReferenceAbMode, options.workflow, references.length);
  const multiReferenceEnhancementMode = resolveMultiReferenceEnhancementMode({
    requestedMode: multiReferenceAbMode,
    workflow: options.workflow,
    references,
    referenceCount: references.length,
    thinkingMode: options.thinkingMode,
    prompt,
    forceSelectedBase: Boolean(options.forceSelectedBase),
    hasSelectedBase: Boolean(options.hasSelectedBase),
    hasSelectedImage
  });
  const multiReferenceEnhancementSource = multiReferenceAbMode
    ? "ab_test"
    : multiReferenceEnhancementMode === "role_table"
    ? "deep_user_choice"
    : "";

  if (!prompt) throw createHttpError(400, "请先填写生图提示词。");
  if (!model) throw createHttpError(400, "中控未配置图片服务模型名。");

  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  if (onProgress && normalizeAiThinkingMode(options.thinkingMode) !== "off") {
    onProgress({
      status: "running",
      percent: 8,
      message: normalizeAiThinkingMode(options.thinkingMode) === "deep" ? "深度思考中，正在理解需求和图片关系" : "标准思考中，正在整理生图提示词",
      totalCount: count,
      completedCount: 0,
      failedCount: 0
    });
  }
  const planned = await planAiImagePrompt(options.config || {}, {
    prompt,
    thinkingMode: options.thinkingMode,
    targetProvider: "imageservice",
    apiProvider: endpoints.provider,
    aspectRatio,
    imageSize: options.size || options.imageSize || size,
    count,
    referenceCount: references.length,
    references,
    userId: options.userId || "",
    user: options.user || null,
    webSearch: Boolean(options.webSearch),
    hasSelectedBase: Boolean(options.hasSelectedBase),
    hasSelectedImage,
    multiReferenceAbMode: multiReferenceEnhancementMode
  });
  const generationReferencePlan = referencesForImageModel(references, planned, prompt, {
    referenceCount: references.length,
    hasSelectedBase: Boolean(options.hasSelectedBase),
    hasSelectedImage,
    forceSelectedBase: Boolean(options.forceSelectedBase),
    workflow: options.workflow,
    multiReferenceEnhancementMode
  });
  const plannedGenerationReferences = generationReferencePlan.references;
  const surfaceAttributeReferences = multiReferenceEnhancementMode === "role_table"
    ? plannedGenerationReferences.filter((item) => item?.plannedExplicit && normalizePlannedReferenceScope(item?.plannedScope, item?.plannedRole, item?.plannedInstruction) === "surface_attribute")
    : [];
  const generationReferences = plannedGenerationReferences;
  const hasGenerationReferences = generationReferences.length > 0;
  const finalPrompt = multiReferenceEnhancementMode === "role_table"
    ? buildPositiveMultiReferencePrompt(prompt, generationReferences)
    : buildLightweightImagePrompt(prompt, planned, {
    thinkingMode: options.thinkingMode,
    referenceCount: references.length,
    generationReferenceCount: generationReferences.length,
    references: generationReferences,
    hasSelectedBase: Boolean(options.hasSelectedBase),
    hasSelectedImage,
    selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
    imageModelMode: generationReferencePlan.imageModelMode,
    workflow: options.workflow
  });
  const designAgentEnabled = isEcommerceDesignAgentEnabled(prompt);
  const requestOptions = {
    model,
    prompt: finalPrompt,
    references: generationReferences,
    size,
    quality,
    outputFormat,
    timeoutMs,
    userId: options.userId || "",
    aspectRatio,
    resolutionTier: requestDimensions.resolutionTier,
    requestedSize: options.size || options.imageSize || "",
    imageEditEndpoint: endpoints.imageEdit,
    imageGenerationEndpoint: endpoints.imageGeneration,
    secondaryImageBaseUrl: options.config?.ai?.secondaryImageBaseUrl || defaultSecondaryApiBaseUrl,
    networkRetryAttempts: 3,
    onProgress,
    config: options.config || {},
    jobId: options.jobId || "",
    workflow: options.workflow || ""
  };
  const designMetadataBase = () => buildAiDesignMetadata(planned, prompt, finalPrompt, {
    referenceCount: references.length,
    generationReferenceCount: generationReferences.length,
    selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
    imageModelMode: generationReferencePlan.imageModelMode,
    operationType: planned.operationType || "",
    assetType: planned.assetType || "",
    outputMode: planned.outputMode || "",
    submittedReferenceRoles: summarizeImageReferenceRoles(generationReferences),
    plannedReferenceRoles: generationReferencePlan.plannedReferenceRoles || [],
    referenceRoleSource: generationReferencePlan.referenceRoleSource || "",
    droppedSelectedBaseReferenceCount: generationReferencePlan.droppedSelectedBaseCount
  });
  const failureContext = {
    provider: imageProviderId,
    model,
    originalPrompt: prompt,
    plannedPrompt: finalPrompt,
    references: generationReferences,
    sourceReferences: references,
    workflow: options.workflow || "",
    userId: options.userId || ""
  };
  const safetyFallbackApiKey = !useSecondaryApiV3 ? String(options.safetyFallbackApiKey || "").trim() : "";
  const requestWithSafetyFallback = async (requestCount = 1, requestIndex = 0) => {
    try {
      const data = hasGenerationReferences
        ? (useSecondaryApiV3 ? await requestSecondaryApiV3ImageEdit(apiKey, requestOptions, 1) : await requestPrimaryImageServiceEdit(apiKey, requestOptions, 1))
        : (useSecondaryApiV3 ? await requestSecondaryApiV3ImageText(apiKey, requestOptions, 1) : await requestPrimaryImageServiceText(apiKey, requestOptions, requestCount));
      if (!collectImageAssets(data).length) {
        throw createHttpError(502, `${compactAiProviderLabel(imageProviderId)}返回成功但没有图片`);
      }
      return {
        data,
        upstreams: [data],
        provider: imageProviderId,
        model,
        attempts: [{ provider: imageProviderId, result: "success", index: requestIndex || undefined }]
      };
    } catch (primaryError) {
      const primaryReason = classifyAiFailureReason(primaryError, imageProviderId);
      const attempts = [{
        provider: imageProviderId,
        result: "failed",
        reasonType: primaryReason.type,
        message: primaryReason.message,
        index: requestIndex || undefined
      }];
      primaryError.aiProviderAttempts = attempts;
      if (useSecondaryApiV3 || primaryReason.type !== "safety") throw primaryError;
      if (!safetyFallbackApiKey) {
        throw attachAiFailureContext(missingAiProviderFallbackError(primaryError, attempts), failureContext);
      }

      onProgress?.({
        status: "running",
        percent: Math.max(12, Math.min(94, requestIndex ? 12 + Math.round(((requestIndex - 1) / count) * 80) : 24)),
        message: "图片服务触发内容安全拦截，正在自动切换备用图片服务",
        totalCount: count
      });

      const nativeResponses = [];
      try {
        const nativeCount = hasGenerationReferences ? 1 : Math.max(1, Number(requestCount || 1));
        for (let nativeIndex = 0; nativeIndex < nativeCount; nativeIndex += 1) {
          const nativeResponse = hasGenerationReferences
            ? await requestSecondaryApiV3ImageEdit(safetyFallbackApiKey, requestOptions, 1)
            : await requestSecondaryApiV3ImageText(safetyFallbackApiKey, requestOptions, 1);
          if (!collectImageAssets(nativeResponse).length) {
            throw createHttpError(502, "原生供应商返回成功但没有图片");
          }
          nativeResponses.push(nativeResponse);
        }
      } catch (nativeError) {
        const nativeReason = classifyAiFailureReason(nativeError, "secondaryimage");
        attempts.push({
          provider: "secondaryimage",
          result: "failed",
          reasonType: nativeReason.type,
          message: nativeReason.message,
          index: requestIndex || undefined
        });
        const wrapped = attachAiProviderFallbackFailure(nativeError, nativeReason, attempts);
        throw attachAiFailureContext(wrapped, {
          ...failureContext,
          provider: "secondaryimage",
          model: defaultSecondaryApiImageModel
        });
      }

      attempts.push({
        provider: "secondaryimage",
        result: "success",
        reasonType: "safety_fallback",
        index: requestIndex || undefined
      });
      return {
        data: nativeResponses.length === 1 ? nativeResponses[0] : combineSecondaryApiImageResponses(nativeResponses),
        upstreams: nativeResponses,
        provider: "secondaryimage",
        model: defaultSecondaryApiImageModel,
        attempts,
        usedSafetyFallback: true
      };
    }
  };
  const splitImageRequests = ((hasGenerationReferences || useSecondaryApiV3) && count > 1) || count > 4;
  if (splitImageRequests) {
    const images = [];
    const errors = [];
    const responses = [];
    const providerAttempts = [];
    const successfulProviders = new Set();
    let lastFailure = null;

    for (let index = 0; index < count; index += 1) {
      if (onProgress) {
        onProgress({
          status: "running",
          percent: Math.min(95, 12 + Math.round((index / count) * 80)),
          message: `图片服务正在生成第 ${index + 1}/${count} 张`,
          totalCount: count,
          completedCount: images.length,
          failedCount: errors.length
        });
      }
      try {
        const requestResult = await requestWithSafetyFallback(1, index + 1);
        providerAttempts.push(...requestResult.attempts);
        successfulProviders.add(requestResult.provider);
        for (const upstream of requestResult.upstreams) {
          await recordAiTokenUsage(options.userId, {
            provider: requestResult.provider === "secondaryimage" ? "secondary-v3" : "imageservice",
            model: requestResult.model,
            source: hasGenerationReferences ? "image-edit" : "image-generation",
            upstream,
            config: options.config,
            user: options.user
          }).catch(() => {});
        }
        const currentImages = collectImageAssets(requestResult.data);
        if (!currentImages.length) throw createHttpError(502, `第 ${index + 1} 张返回成功但没有图片`);
        if (requestResult.provider === "secondaryimage") {
          await recordAiImageUnitCost(options.userId, {
            provider: "secondary-v3",
            model: requestResult.model,
            source: hasGenerationReferences ? "image-edit" : "text-to-image",
            resolution: requestOptions.requestedSize || requestOptions.size,
            count: currentImages.length,
            config: options.config,
            user: options.user
          }).catch(() => {});
        }
        images.push(...currentImages);
        responses.push({
          index: index + 1,
          imageCount: currentImages.length,
          provider: requestResult.provider
        });
      } catch (error) {
        lastFailure = error;
        if (Array.isArray(error?.aiProviderAttempts)) providerAttempts.push(...error.aiProviderAttempts);
        if (!error?.aiFailureContext) attachAiFailureContext(error, failureContext);
        const visible = aiVisibleFailureMessage(error, error?.aiFailureContext?.provider || imageProviderId);
        errors.push(`第 ${index + 1} 张：${visible}`);
      }
      if (onProgress) {
        onProgress({
          status: "running",
          percent: Math.min(98, 12 + Math.round(((index + 1) / count) * 80)),
          message: `图片服务已完成 ${images.length}/${count} 张`,
          totalCount: count,
          completedCount: images.length,
          failedCount: errors.length
        });
      }
    }

    if (!images.length) {
      const aggregate = createHttpError(502, `图片服务多张生成全部失败：${errors.join("；") || "没有图片"}`);
      if (lastFailure?.aiFailureReason) aggregate.aiFailureReason = lastFailure.aiFailureReason;
      aggregate.aiProviderAttempts = providerAttempts;
      throw attachAiFailureContext(aggregate, lastFailure?.aiFailureContext || failureContext);
    }
    const usedNativeFallback = successfulProviders.has("secondaryimage");
    return {
      provider: usedNativeFallback ? "secondaryimage" : imageProviderId,
      mode: hasGenerationReferences ? "image-edit" : "text-to-image",
      model: usedNativeFallback ? defaultSecondaryApiImageModel : model,
      images,
      metadata: {
        requestedCount: count,
        imageCount: images.length,
        successCount: images.length,
        failedCount: errors.length,
        errors,
        referenceCount: references.length,
        generationReferenceCount: generationReferences.length,
        droppedSelectedBaseReferenceCount: generationReferencePlan.droppedSelectedBaseCount,
        selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
        imageModelMode: generationReferencePlan.imageModelMode,
        operationType: planned.operationType || "",
        aspectRatio,
        size,
        quality,
        outputFormat,
        originalPrompt: prompt,
        plannedPrompt: finalPrompt,
        ...designMetadataBase(),
        thinkingMode: planned.mode,
        thinkingProvider: planned.provider,
        thinkingModel: planned.model,
        thinkingNote: planned.note,
        thinkingVisualReferenceCount: Number(planned.visualReferenceCount || 0),
        thinkingSkippedReferenceReasons: Array.isArray(planned.skippedReferenceReasons) ? planned.skippedReferenceReasons : [],
        multiReferenceAbMode: multiReferenceEnhancementMode,
        multiReferenceEnhancementMode,
        multiReferenceEnhancementSource,
        multiReferenceRoleTable: multiReferenceEnhancementMode === "role_table" ? buildPositiveImageReferenceRoleTable(generationReferences) : [],
        multiReferenceSurfaceReferenceCount: surfaceAttributeReferences.length,
        multiReferenceAllActiveImagesSubmitted: generationReferences.length === plannedGenerationReferences.length,
        providerAttempts,
        safetyFallbackUsed: providerAttempts.some((attempt) => attempt.provider === "secondaryimage"),
        splitRequests: true,
        responses
      }
    };
  }

  let requestResult;
  try {
    requestResult = await requestWithSafetyFallback(hasGenerationReferences ? 1 : count);
  } catch (error) {
    if (!error?.aiFailureContext) attachAiFailureContext(error, failureContext);
    throw error;
  }
  for (const upstream of requestResult.upstreams) {
    await recordAiTokenUsage(options.userId, {
      provider: requestResult.provider === "secondaryimage" ? "secondary-v3" : "imageservice",
      model: requestResult.model,
      source: hasGenerationReferences ? "image-edit" : "image-generation",
      upstream,
      config: options.config,
      user: options.user
    }).catch(() => {});
  }

  const images = collectImageAssets(requestResult.data);
  if (!images.length) throw attachAiFailureContext(createHttpError(502, "图片服务 返回成功但没有图片"), failureContext);
  if (requestResult.provider === "secondaryimage") {
    await recordAiImageUnitCost(options.userId, {
      provider: "secondary-v3",
      model: requestResult.model,
      source: hasGenerationReferences ? "image-edit" : "text-to-image",
      resolution: requestOptions.requestedSize || requestOptions.size,
      count: images.length,
      config: options.config,
      user: options.user
    }).catch(() => {});
  }

  return {
    provider: requestResult.provider,
    mode: hasGenerationReferences ? "image-edit" : "text-to-image",
    model: requestResult.model,
    images,
    metadata: {
      requestedCount: count,
      imageCount: images.length,
      successCount: images.length,
      failedCount: Math.max(0, count - images.length),
      referenceCount: references.length,
      generationReferenceCount: generationReferences.length,
      droppedSelectedBaseReferenceCount: generationReferencePlan.droppedSelectedBaseCount,
      selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
      imageModelMode: generationReferencePlan.imageModelMode,
      operationType: planned.operationType || "",
      aspectRatio,
      size,
      quality,
      outputFormat,
      originalPrompt: prompt,
      plannedPrompt: finalPrompt,
      ...designMetadataBase(),
      thinkingMode: planned.mode,
      thinkingProvider: planned.provider,
      thinkingModel: planned.model,
      thinkingNote: planned.note,
      thinkingVisualReferenceCount: Number(planned.visualReferenceCount || 0),
      thinkingSkippedReferenceReasons: Array.isArray(planned.skippedReferenceReasons) ? planned.skippedReferenceReasons : [],
      multiReferenceAbMode: multiReferenceEnhancementMode,
      multiReferenceEnhancementMode,
      multiReferenceEnhancementSource,
      multiReferenceRoleTable: multiReferenceEnhancementMode === "role_table" ? buildPositiveImageReferenceRoleTable(generationReferences) : [],
      multiReferenceSurfaceReferenceCount: surfaceAttributeReferences.length,
      multiReferenceAllActiveImagesSubmitted: generationReferences.length === plannedGenerationReferences.length,
      providerAttempts: requestResult.attempts,
      safetyFallbackUsed: Boolean(requestResult.usedSafetyFallback)
    }
  };
}

async function proxyPrimaryImageImageGeneration(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const config = await loadIntranetConfig();
    const apiKey = resolveConfiguredAiKey("primaryimage", config, account.user);

    if (!apiKey || typeof apiKey !== "string") {
      sendJson(res, 400, { error: "中控未配置图片服务 A API Key。" });
      return;
    }

    const rawReferences = Array.isArray(body.references) ? body.references : [];
    const prompt = sanitizeCanvasFocusPrompt(String(body.prompt || "").trim().slice(0, 3000), rawReferences);
    if (!prompt) {
      sendJson(res, 400, { error: "请先填写生图提示词。" });
      return;
    }
    assertPromptReferenceCount(prompt, rawReferences);

    const count = Math.min(Math.max(Number(body.n || 1), 1), aiImageMaxConcurrency);
    const requestedModel = normalizeClientModelOverride(body.model || body.image_model);
    const workflow = String(body.workflow || "").trim();
    const conversationId = safePathId(body.conversationId || body.conversation_id || "");
    const hasSelectedImage = Boolean(body.has_selected_image || body.use_selected_image || body.has_selected_base || rawReferences.some(isSelectedBaseReference));
    const imageConfig = {
      aspectRatio: normalizePrimaryImageAspectRatio(body.aspect_ratio),
      imageSize: normalizePrimaryImageImageSize(body.image_size)
    };
    await reserveAiImageUsageWithCapacity(account.user, count, { requestedUnits: count, workflow, conversationId });
    const queued = enqueueAiImageJob({
      provider: "primaryimage",
      model: requestedModel || primaryImageImageModel,
      prompt,
      references: rawReferences,
      referenceCount: Math.min(rawReferences.length, 4),
      totalCount: count,
      workflow,
      conversationId,
      account: {
        id: account.user.id,
        username: account.user.username || "",
        displayName: account.user.displayName || account.user.username || ""
      },
      run: async ({ updateProgress } = {}) => {
        try {
          const thinkingMode = normalizeAiThinkingMode(body.thinking_mode);
          if (thinkingMode !== "off" && typeof updateProgress === "function") {
            updateProgress({
              status: "running",
              percent: 8,
              message: thinkingMode === "deep" ? "深度思考中，正在理解需求和图片关系" : "标准思考中，正在整理生图提示词",
              totalCount: count,
              completedCount: 0,
              failedCount: 0
            });
          }
          const planned = await planAiImagePrompt(config, {
            prompt,
            thinkingMode,
            targetProvider: "primaryimage",
            aspectRatio: body.aspect_ratio,
            imageSize: body.image_size,
            count,
            referenceCount: Math.min(rawReferences.length, 4),
            references: rawReferences,
            userId: account.user.id,
            user: account.user,
            webSearch: Boolean(body.web_search || body.enable_web_search),
            hasSelectedBase: Boolean(body.use_selected_image || body.has_selected_base),
            hasSelectedImage
          });
          const generationReferencePlan = referencesForImageModel(rawReferences, planned, prompt, {
            referenceCount: rawReferences.length,
            hasSelectedBase: Boolean(body.use_selected_image || body.has_selected_base),
            hasSelectedImage,
            forceSelectedBase: Boolean(body.force_selected_base),
            workflow: body.workflow
          });
          const imageParts = generationReferencePlan.references
            .slice(0, 4)
            .map((item) => dataUrlToInlineData(item?.image_file || item?.url || item))
            .filter(Boolean);
          const plannedPrompt = buildLightweightImagePrompt(prompt, planned, {
            thinkingMode,
            referenceCount: rawReferences.length,
            generationReferenceCount: imageParts.length,
            references: generationReferencePlan.references,
            hasSelectedBase: Boolean(body.use_selected_image || body.has_selected_base),
            hasSelectedImage,
            selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
            imageModelMode: generationReferencePlan.imageModelMode,
            workflow: body.workflow
          });
          const designAgentMetadata = buildAiDesignMetadata(planned, prompt, plannedPrompt, {
            referenceCount: rawReferences.length,
            generationReferenceCount: imageParts.length,
            selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
            imageModelMode: generationReferencePlan.imageModelMode,
            operationType: planned.operationType || "",
            assetType: planned.assetType || "",
            outputMode: planned.outputMode || "",
            submittedReferenceRoles: summarizeImageReferenceRoles(generationReferencePlan.references),
            plannedReferenceRoles: generationReferencePlan.plannedReferenceRoles || [],
            referenceRoleSource: generationReferencePlan.referenceRoleSource || "",
            droppedSelectedBaseReferenceCount: generationReferencePlan.droppedSelectedBaseCount
          });
          try {
            return await runPrimaryImageImageGeneration(apiKey, plannedPrompt || prompt, imageParts, imageConfig, count, {
              ...planned,
              ...designAgentMetadata,
              userId: account.user.id,
              user: account.user,
              config,
              originalPrompt: prompt,
              originalReferenceCount: rawReferences.length,
              droppedSelectedBaseReferenceCount: generationReferencePlan.droppedSelectedBaseCount,
              selectedImagePolicy: generationReferencePlan.selectedImagePolicy,
              imageModelMode: generationReferencePlan.imageModelMode,
              operationType: planned.operationType || "",
              imageModel: requestedModel
            });
          } catch (error) {
            throw attachAiFailureContext(error, {
              provider: "primaryimage",
              model: requestedModel || primaryImageImageModel,
              originalPrompt: prompt,
              plannedPrompt: plannedPrompt || prompt,
              references: generationReferencePlan.references,
              sourceReferences: rawReferences,
              workflow,
              userId: account.user.id
            });
          }
        } catch (error) {
          await rollbackUsage(account.user.id, "aiImages", count);
          throw error;
        }
      }
    });
    await flushAiImageJobStatusCacheNow();
    sendJson(res, 202, {
      ...publicAiImageJobPayload(queued.jobId, queued),
      statusUrl: `${requestOrigin(req)}/api/ai/image-generation/status/${encodeURIComponent(queued.jobId)}`
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "图片服务 A 生图代理异常" });
  }
}

async function proxyImageServiceGeneration(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const config = await loadIntranetConfig();
    const imageApiProvider = "primary";
    const imageProviderId = "imageservice";
    const apiKey = resolveConfiguredAiKey("imageservice", config, account.user);
    const safetyFallbackApiKey = resolveConfiguredAiKey("secondaryimage", config, account.user);
    if (!apiKey || typeof apiKey !== "string") {
      sendJson(res, 400, { error: "中控未配置图片服务 API Key。" });
      return;
    }

    const safe = mergeIntranetConfig(config);
    const count = Math.min(Math.max(Number(body.n || 1), 1), aiImageMaxActiveJobsPerUser);
    const requestedModel = normalizeClientModelOverride(body.model || body.image_model);
    const workflow = String(body.workflow || "").trim();
    const conversationId = safePathId(body.conversationId || body.conversation_id || "");
    const references = collectImageGenerationReferences(body.references);
    const multiReferenceAbMode = normalizeMultiReferenceAbMode(body.multi_reference_ab_mode, workflow, references.length);
    const prompt = sanitizeCanvasFocusPrompt(normalizeAiPromptText(body.prompt), references);
    assertPromptReferenceCount(prompt, references);
    const hasSelectedImage = Boolean(body.has_selected_image || body.use_selected_image || body.has_selected_base || references.some(isSelectedBaseReference));
    await reserveAiImageUsageWithCapacity(account.user, count, { requestedUnits: count, workflow, conversationId });
    const queued = enqueueAiImageJob({
      provider: imageProviderId,
      model: requestedModel || safe.ai?.imageEditModel || safe.ai?.imageService2Model || safe.ai?.imageTextModel || safe.ai?.imageService1Model || defaultImageServiceEditModel,
      prompt,
      references,
      referenceCount: references.length,
      totalCount: count,
      workflow,
      conversationId,
      account: {
        id: account.user.id,
        username: account.user.username || "",
        displayName: account.user.displayName || account.user.username || ""
      },
      run: async ({ updateProgress, jobId } = {}) => {
        try {
          const data = await runPrimaryImageServiceGeneration(apiKey, {
            prompt,
            count,
            references,
            aspectRatio: body.aspect_ratio,
            size: body.size || body.image_size,
            quality: body.quality,
            outputFormat: body.output_format,
            userId: account.user.id,
            user: account.user,
            config: safe,
            thinkingMode: body.thinking_mode,
            webSearch: Boolean(body.web_search || body.enable_web_search),
            hasSelectedBase: Boolean(body.use_selected_image || body.has_selected_base),
            hasSelectedImage,
            forceSelectedBase: Boolean(body.force_selected_base),
            workflow,
            multiReferenceAbMode,
            apiProvider: imageApiProvider,
            safetyFallbackApiKey,
            jobId,
            textModel: requestedModel || safe.ai?.imageTextModel || safe.ai?.imageService1Model || defaultImageServiceTextModel,
            editModel: requestedModel || safe.ai?.imageEditModel || safe.ai?.imageService2Model || defaultImageServiceEditModel,
            onProgress: updateProgress
          });
          const successCount = Math.min(count, Math.max(0, Number(data?.metadata?.imageCount || 0)));
          if (successCount < count) {
            await rollbackUsage(account.user.id, "aiImages", count - successCount);
          }
          return data;
        } catch (error) {
          await rollbackUsage(account.user.id, "aiImages", count);
          throw error;
        }
      }
    });
    await flushAiImageJobStatusCacheNow();
    sendJson(res, 202, {
      ...publicAiImageJobPayload(queued.jobId, queued),
      statusUrl: `${requestOrigin(req)}/api/ai/image-generation/status/${encodeURIComponent(queued.jobId)}`
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "图片服务生图代理异常" });
  }
}

async function proxyPrimaryResponsesImageGeneration(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const config = await loadIntranetConfig();
    const safe = mergeIntranetConfig(config);
    const endpoints = configuredCompatibleEndpoints(safe);
    const apiKey = resolveConfiguredAiKey("responsesimage", safe, account.user);
    if (!apiKey || typeof apiKey !== "string") {
      sendJson(res, 400, { error: "中控未配置当前图片服务 Key，无法测试 Responses 出图。" });
      return;
    }

    const model = normalizeClientModelOverride(
      body.model ||
      safe.ai?.deepReasoningModel ||
      safe.ai?.standardReasoningModel ||
      defaultImageServicePlannerModel
    );
    const workflow = String(body.workflow || "").trim();
    const prompt = normalizeAiPromptText(body.prompt);
    const references = collectImageGenerationReferences(body.references);
    assertPromptReferenceCount(prompt, references);

    const conversationId = safePathId(body.conversationId || body.conversation_id || "");
    await reserveAiImageUsageWithCapacity(account.user, 1, { requestedUnits: 1, workflow, conversationId });
    const queued = enqueueAiImageJob({
      provider: "responsesimage",
      model,
      prompt,
      references,
      referenceCount: references.length,
      totalCount: 1,
      workflow,
      conversationId,
      account: {
        id: account.user.id,
        username: account.user.username || "",
        displayName: account.user.displayName || account.user.username || ""
      },
      run: async ({ updateProgress } = {}) => {
        try {
          updateProgress?.({ percent: 18, message: "Responses 正在调用 image_generation" });
          let data;
          try {
            data = await requestPrimaryResponsesImageGeneration(apiKey, {
              model,
              prompt,
              references,
              aspectRatio: body.aspect_ratio,
              size: body.size || body.image_size,
              userId: account.user.id,
              user: account.user,
              config: safe,
              responsesEndpoint: endpoints.responses,
              timeoutMs: 0
            });
          } catch (error) {
            throw attachAiFailureContext(error, {
              provider: "responsesimage",
              model,
              originalPrompt: prompt,
              plannedPrompt: prompt,
              references,
              workflow,
              userId: account.user.id
            });
          }
          const successCount = Math.max(0, Number(data?.metadata?.imageCount || 0));
          if (successCount < 1) await rollbackUsage(account.user.id, "aiImages", 1);
          return data;
        } catch (error) {
          await rollbackUsage(account.user.id, "aiImages", 1);
          throw error;
        }
      }
    });
    await flushAiImageJobStatusCacheNow();
    sendJson(res, 202, {
      ...publicAiImageJobPayload(queued.jobId, queued),
      statusUrl: `${requestOrigin(req)}/api/ai/image-generation/status/${encodeURIComponent(queued.jobId)}`
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Responses 出图代理异常" });
  }
}

const textAiProviders = {
  primaryimage: {
    label: "文本服务 A",
    baseUrl: String(process.env.TEXT_SERVICE_A_BASE_URL || "").trim(),
    envKey: "TEXT_SERVICE_A_API_KEY",
    defaultModel: primaryImageImageModel,
    tokenField: "maxOutputTokens",
    protocol: "structured"
  },
  textserviceb: {
    label: "文本服务 B",
    baseUrl: String(process.env.TEXT_SERVICE_B_BASE_URL || "").trim(),
    envKey: "TEXT_SERVICE_B_API_KEY",
    defaultModel: "",
    tokenField: "max_tokens"
  },
  textservicec: {
    label: "文本服务 C",
    baseUrl: String(process.env.TEXT_SERVICE_C_BASE_URL || "").trim(),
    envKey: "TEXT_SERVICE_C_API_KEY",
    defaultModel: "",
    tokenField: "max_tokens"
  }
};

function resolveTextAi(body, config, user = null) {
  const providerId = String(body.provider || "primaryimage").toLowerCase();
  const provider = textAiProviders[providerId];
  if (!provider) {
    throw new Error("所选服务不支持 AI 文案，请切换到已配置的文本服务。");
  }
  const apiKey = resolveConfiguredAiKey(providerId, config, user);
  const model = String(body.model || configuredTextModel(providerId, config, provider.defaultModel) || provider.defaultModel || "").trim();
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error(`中控未配置 ${provider.label} API Key。`);
  }
  if (!model) {
    throw new Error(`请填写 ${provider.label} 的文案模型名。`);
  }
  const configuredBaseUrl = String(body.baseUrl || provider.baseUrl || "").trim();
  if (!configuredBaseUrl) {
    throw new Error(`请填写 ${provider.label} 的接口地址。`);
  }
  return {
    id: providerId,
    ...provider,
    apiKey,
    model,
    baseUrl: provider.protocol === "structured"
      ? `${configuredBaseUrl.replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`
      : configuredBaseUrl
  };
}

async function requestTextAi(ai, messages, maxTokens) {
  if (ai.protocol === "structured") {
    const upstream = await fetchWithTimeout(ai.baseUrl, {
      method: "POST",
      headers: (() => {
        const headers = { "content-type": "application/json" };
        const name = String(process.env.TEXT_SERVICE_A_AUTH_HEADER || "authorization").trim().toLowerCase() || "authorization";
        const prefix = String(process.env.TEXT_SERVICE_A_AUTH_PREFIX ?? "Bearer").trim();
        headers[name] = prefix ? `${prefix} ${ai.apiKey}` : ai.apiKey;
        return headers;
      })(),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: messages.map((message) => ({
              text: `${message.role === "system" ? "系统要求" : "用户需求"}：${message.content}`
            }))
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT"],
          temperature: 0.55,
          topP: 0.9,
          maxOutputTokens: maxTokens
        }
      })
    }, 90000, `${ai.label} 文案`);

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok || data?.error) {
      const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
      throw new Error(`${ai.label} 文案请求失败：${detail}`);
    }

    return {
      content: collectPrimaryImageText(data),
      upstream: data
    };
  }

  const payload = {
    model: ai.model,
    messages,
    temperature: 0.55,
    top_p: 0.9,
    stream: false
  };
  payload[ai.tokenField] = maxTokens;

  const upstream = await fetchWithTimeout(ai.baseUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${ai.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 90000, `${ai.label} 文案`);

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`${ai.label} 文案请求失败：${detail}`);
  }

  return {
    content: data.choices?.[0]?.message?.content || "",
    upstream: data
  };
}

async function proxyAiCopywriting(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const config = await loadIntranetConfig();
    const ai = resolveTextAi(body, config, account.user);
    const product = body.product || {};
    const prompt = [
      "你是资深电商主图文案策划。",
      "根据商品信息生成适合电商主图的 3 条中文卖点，每条不超过 18 个字。",
      "要求：具体、可上图、避免夸大承诺、不要表情符号。",
      "只返回 JSON：{\"features\":[\"卖点1\",\"卖点2\",\"卖点3\"],\"image_prompt\":\"英文生图提示词\"}",
      `产品名：${product.product_name || ""}`,
      `类目：${product.category || ""}`,
      `价格/利益点：${product.offer || ""}`,
      `已有卖点：${product.features || ""}`
    ].join("\n");

    const result = await withReservedUsage(account.user.id, "copywriting", 1, () => requestTextAi(ai, [
      { role: "system", content: "你只输出用户要求的 JSON，不输出解释。" },
      { role: "user", content: prompt }
    ], 420));
    await recordAiTokenUsage(account.user.id, {
      provider: ai.id,
      model: ai.model,
      source: "copywriting",
      upstream: result.upstream,
      config,
      user: account.user
    }).catch(() => {});

    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "AI 文案代理异常" });
  }
}


function parsePromptRewriteResult(content = "", fallbackPrompt = "") {
  const text = String(content || "").trim();
  const parsed = extractJsonObjectsFromText(text)[0] || null;
  if (parsed && typeof parsed === "object") {
    const prompt = String(parsed.prompt || parsed.revised_prompt || parsed.final_prompt || fallbackPrompt || "").trim();
    return {
      prompt: prompt || String(fallbackPrompt || "").trim(),
      reason: String(parsed.reason || parsed.analysis || parsed.cause || "").trim(),
      changes: Array.isArray(parsed.changes)
        ? parsed.changes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : []
    };
  }
  return {
    prompt: text || String(fallbackPrompt || "").trim(),
    reason: "",
    changes: []
  };
}

async function rewriteSafetyBlockedImagePrompt(body, account, config) {
  const safe = mergeIntranetConfig(config);
  const endpoints = configuredCompatibleEndpoints(safe, "primary");
  const apiKey = resolveConfiguredAiKey("imageservice", safe, account.user);
  const model = String(safe.ai?.deepReasoningModel || defaultImageServicePlannerModel).trim();
  if (!apiKey) throw createHttpError(400, "中控未配置图片服务 Key，无法使用思考模型修正提示词。");
  if (!model) throw createHttpError(400, "中控未配置思考模型名。");

  const workflow = String(body.workflow || "").trim();
  const originalPrompt = normalizeAiPromptText(body.prompt);
  const finalPrompt = normalizeAiPromptText(body.final_prompt || body.finalPrompt);
  const failureMessage = String(body.failure_message || body.error || "").trim().slice(0, 1600);
  const aspectRatio = String(body.aspect_ratio || body.aspectRatio || "").trim().slice(0, 40);
  const imageSize = String(body.image_size || body.imageSize || "").trim().slice(0, 40);
  const referenceCount = Math.min(Math.max(Number(body.referenceCount || body.reference_count || 0), 0), maxImageServiceReferences);
  const providerAttempts = normalizeAiProviderAttempts(body.providerAttempts || body.provider_attempts);
  const referenceSummaries = (Array.isArray(body.references) ? body.references : []).slice(0, maxImageServiceReferences).map((item, index) => {
    const name = String(item?.name || `参考图${index + 1}`).trim().slice(0, 120);
    const role = String(item?.role || item?.plannedRole || "").trim().slice(0, 80);
    return `${index + 1}. ${name}${role ? `（${role}）` : ""}`;
  });

  if (!originalPrompt && !finalPrompt) throw createHttpError(400, "缺少原始提示词，无法自动修正。");

  const messages = [
    {
      role: "system",
      content: [
        "你是 AI 生图安全拦截后的提示词修正器。",
        "先判断最可能触发安全策略的原因，再在不改变用户想要的画面效果、主体、产品身份、构图和风格方向的前提下，重写为更安全的生图提示词。",
        "如果风险可能来自参考图或生成结果，而不是文字本身，也要把提示词写得更中性，并在 reason 里提醒用户更换、裁剪或弱化参考图。",
        "优先把血腥、真实伤口、病患痛苦、裸露身体、未成年人、暴力、武器、药物滥用、极端政治、敏感身份信息、过度医疗治疗画面，改为中性商业表达。",
        "医疗器械商品可以保留，但把真实病灶、手术血液、人体器官、治疗承诺改成洁净临床场景、产品展示、专业护理氛围。",
        "不要引入用户没说的新产品、新品牌或新卖点；不要把画面改成完全不同题材。",
        "只输出 JSON：{\"reason\":\"最可能的问题，用一句中文说清楚\",\"prompt\":\"修正后的提示词\",\"changes\":[\"把A改成B\"]}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `失败信息：${failureMessage || "图片服务内容安全拦截，切换备用图片服务后仍失败。"}`,
        providerAttempts.length ? `供应商尝试：${providerAttempts.map((attempt) => `${attempt.provider}:${attempt.result}:${attempt.reasonType}`).join("；")}` : "",
        aspectRatio ? `画幅比例：${aspectRatio}` : "",
        imageSize ? `清晰度：${imageSize}` : "",
        `参考图数量：${referenceCount}`,
        referenceSummaries.length ? `参考图说明：\n${referenceSummaries.join("\n")}` : "",
        originalPrompt ? `用户原始提示词：\n${originalPrompt}` : "",
        finalPrompt && finalPrompt !== originalPrompt ? `系统整理后的生图提示词：\n${finalPrompt}` : ""
      ].filter(Boolean).join("\n\n")
    }
  ];

  const result = await withReservedUsage(account.user.id, "copywriting", 1, () => requestPrimaryResponsesText(apiKey, model, messages, 0, [], {
    endpoint: endpoints.responses,
    maxOutputTokens: 900
  }));
  await recordAiTokenUsage(account.user.id, {
    provider: "primary-responses",
    model,
    source: "prompt-safety-rewrite",
    upstream: result.upstream,
    config: safe,
    user: account.user
  }).catch(() => {});
  const parsed = parsePromptRewriteResult(result.content, originalPrompt || finalPrompt);
  return {
    content: result.content,
    prompt: parsed.prompt,
    reason: parsed.reason,
    changes: parsed.changes,
    model,
    provider: "primary-responses"
  };
}

async function proxyAiImagePrompt(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const account = await requireAccount(req, res);
    if (!account) return;
    const config = await loadIntranetConfig();
    const mode = String(body.mode || body.action || "").trim().toLowerCase();
    if (mode === "safety_rewrite") {
      const result = await rewriteSafetyBlockedImagePrompt(body, account, config);
      sendJson(res, 200, result);
      return;
    }
    const ai = resolveTextAi(body, config, account.user);
    const prompt = String(body.prompt || "").trim().slice(0, 1500);
    if (!prompt) {
      sendJson(res, 400, { error: "请先填写生图需求。" });
      return;
    }
    const referenceCount = Math.min(Math.max(Number(body.referenceCount || 0), 0), 4);
    const promptText = [
      "你是电商图片生成提示词优化师。",
      "请把用户的中文生图需求改写成更清晰、更可执行的 AI 生图提示词。",
      "要求：保留用户原意，不凭空更换主体；如果用户要求保留参考图姿态、服装、商品或构图，要明确写入；适合电商主图、清晰、完整构图。",
      "不要输出解释，不要输出多套方案，只返回 JSON：{\"prompt\":\"优化后的提示词\"}。",
      `参考图数量：${referenceCount}`,
      `用户需求：${prompt}`
    ].filter(Boolean).join("\n");

    const result = await withReservedUsage(account.user.id, "copywriting", 1, () => requestTextAi(ai, [
      { role: "system", content: "你只输出 JSON，不输出解释。" },
      { role: "user", content: promptText }
    ], 700));
    await recordAiTokenUsage(account.user.id, {
      provider: ai.id,
      model: ai.model,
      source: "prompt-optimizer",
      upstream: result.upstream,
      config,
      user: account.user
    }).catch(() => {});

    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "AI 提示词优化异常" });
  }
}


function enqueueLocalPythonTask(label, runner) {
  return new Promise((resolve, reject) => {
    localPythonQueue.push({
      label: String(label || "Python 本地任务"),
      runner,
      resolve,
      reject
    });
    void pumpLocalPythonQueue();
  });
}

async function pumpLocalPythonQueue() {
  if (localPythonRunning) return;
  const item = localPythonQueue.shift();
  if (!item) return;

  localPythonRunning = true;
  try {
    item.resolve(await item.runner());
  } catch (error) {
    item.reject(error);
  } finally {
    localPythonRunning = false;
    void pumpLocalPythonQueue();
  }
}

function localPythonQueueInfo() {
  return {
    running: localPythonRunning,
    queued: localPythonQueue.length
  };
}

async function serviceHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    role: "employee-web-app",
    host: requestOrigin(req),
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    node: process.version,
    localPython: {
      queue: localPythonQueueInfo()
    },
    aiImage: aiImageQueueSnapshot(),
    updatedAt: nowIso()
  });
}


function pythonEnv() {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const currentPath = process.env.PYTHONPATH || "";
  const env = {
    ...process.env,
    U2NET_HOME: process.env.U2NET_HOME || rembgModelsDir,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1"
  };
  if (existsSync(pythonPackagesDir)) {
    env.PYTHONPATH = currentPath ? `${pythonPackagesDir}${delimiter}${currentPath}` : pythonPackagesDir;
  }
  return env;
}


function imageExtFromMime(mime) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  return "jpeg";
}

function imageMimeFromExt(ext) {
  const normalized = String(ext || "").toLowerCase().replace(/^\./, "");
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  return "image/jpeg";
}

function isNoTimeoutValue(value) {
  if (value === 0 || value === false || value === null) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["0", "none", "no-timeout", "no_timeout", "never", "infinite", "infinity"].includes(text);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = appDefaultAiRequestTimeoutMs, label = "AI") {
  if (isNoTimeoutValue(timeoutMs)) {
    try {
      return await fetch(url, options);
    } catch (error) {
      const detail = cleanErrorToken(error?.cause?.code || error?.cause?.message || error?.message || "");
      throw createHttpError(502, `${label}连接失败${detail ? `：${detail}` : ""}。请检查网络、接口地址或代理后重试。`);
    }
  }
  const attempts = 2;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || appDefaultAiRequestTimeoutMs)));
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") {
        throw new Error(`${label} 接口超时，已跳过当前图片。`);
      }
      const transient = /ConnectTimeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(`${error?.cause || ""} ${error?.message || ""}`);
      if (!transient || attempt >= attempts) {
        const detail = cleanErrorToken(error?.cause?.code || error?.cause?.message || error?.message || "");
        throw createHttpError(502, `${label}连接失败${detail ? `：${detail}` : ""}。请检查网络、接口地址或代理后重试。`);
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}


function canvasUserRoot(userId) {
  return {
    projects: join(canvasProjectsDir, safePathId(userId) || "anonymous"),
    assets: join(canvasAssetsDir, safePathId(userId) || "anonymous")
  };
}

function decodeDataUrlAsset(dataUrl, fallbackExt = ".png") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (!match) {
    return { buffer: Buffer.from(raw, "base64"), mime: "application/octet-stream", ext: fallbackExt };
  }
  const mime = match[1].toLowerCase();
  const ext = mime.includes("jpeg") ? ".jpg" : mime.includes("svg") ? ".svg" : mime.includes("webp") ? ".webp" : ".png";
  return { buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"), mime, ext };
}

async function resolveCanvasRemoveBackgroundSource(source, roots) {
  const raw = String(source || "").trim();
  if (!raw) throw createHttpError(400, "图片来源为空。");
  if (raw.startsWith("data:")) {
    const decoded = decodeDataUrlAsset(raw, ".png");
    return decoded;
  }

  const pathname = raw.startsWith("/") ? raw : "";
  if (pathname.startsWith("/api/canvas/assets/")) {
    const fileName = basename(decodeURIComponent(pathname.replace("/api/canvas/assets/", "")));
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(fileName)) {
      throw createHttpError(400, "仅支持 PNG / JPG / WEBP 图片抠图。");
    }
    const filePath = normalize(join(roots.assets, fileName));
    if (!filePath.startsWith(normalize(roots.assets))) throw createHttpError(403, "Forbidden");
    const buffer = await readFile(filePath);
    return {
      buffer,
      mime: imageMimeFromExt(extname(filePath).toLowerCase()),
      ext: extname(filePath).toLowerCase() || ".png"
    };
  }

  throw createHttpError(400, "仅支持已上传到当前账号的素材或 data URL，不读取远程地址。");
}

function normalizeRembgModel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "fine" || raw === "isnet" || raw === "isnet-general-use") return "isnet-general-use";
  return "u2net";
}

function runPythonInline(script, args = [], timeoutMs = 180000, label = "Python 本地任务") {
  return enqueueLocalPythonTask(label, () => runPythonInlineNow(script, args, timeoutMs));
}

function runPythonInlineNow(script, args = [], timeoutMs = 180000) {
  const python = resolvePythonExecutable();
  return new Promise((resolve) => {
    const child = spawn(python, ["-c", script, ...args.map((item) => String(item))], {
      windowsHide: true,
      env: pythonEnv()
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr || "Python 执行超时" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
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

async function runRembg(inputPath, outputPath, timeoutMs = 180000, model = "u2net") {
  const rembgModel = normalizeRembgModel(model);
  if (rembgModel === "isnet-general-use" && !existsSync(isnetGeneralUseModelPath)) {
    throw createHttpError(
      503,
      "开源版不自动下载 isnet-general-use 模型。请先确认该模型的使用权，"
        + "再手动放入 runtime\\rembg-models\\isnet-general-use.onnx。"
    );
  }
  const script = [
    "import sys",
    "import os",
    `sys.path.insert(0, ${JSON.stringify(pythonPackagesDir)})`,
    `os.environ.setdefault('U2NET_HOME', ${JSON.stringify(rembgModelsDir)})`,
    "from PIL import Image",
    "from rembg import remove, new_session",
    "src, dst, model = sys.argv[1], sys.argv[2], sys.argv[3]",
    "fine = model == 'isnet-general-use'",
    "def clean_alpha(img):",
    "    img = img.convert('RGBA')",
    "    pixels = img.load()",
    "    w, h = img.size",
    "    for y in range(h):",
    "        for x in range(w):",
    "            r, g, b, a = pixels[x, y]",
    "            if a <= 8:",
    "                pixels[x, y] = (r, g, b, 0)",
    "            elif a >= 248:",
    "                pixels[x, y] = (r, g, b, 255)",
    "    return img",
    "session = new_session(model)",
    "with Image.open(src) as image:",
    "    image = image.convert('RGBA')",
    "    if fine:",
    "        try:",
    "            result = remove(",
    "                image,",
    "                session=session,",
    "                alpha_matting=True,",
    "                alpha_matting_foreground_threshold=240,",
    "                alpha_matting_background_threshold=10,",
    "                alpha_matting_erode_size=8,",
    "                post_process_mask=True",
    "            )",
    "        except Exception:",
    "            result = remove(image, session=session, post_process_mask=True)",
    "        result = clean_alpha(result)",
    "    else:",
    "        result = remove(image, session=session)",
    "    result.save(dst)"
  ].join("\n");
  const result = await runPythonInline(script, [inputPath, outputPath, rembgModel], timeoutMs, "rembg 抠图");
  if (!result.ok) {
    const detail = (result.stderr || result.stdout || "").trim();
    if (/No module named rembg|ModuleNotFoundError/i.test(detail)) {
      throw createHttpError(500, "rembg 未安装。请先在本机/实操机安装 rembg 后再使用精细抠图。");
    }
    if (/ENOENT|not recognized|找不到|无法将|No such file/i.test(detail)) {
      throw createHttpError(500, "Python/rembg 运行时未安装。请先随程序打包 runtime\\python、runtime\\python-packages 和 runtime\\rembg-models。");
    }
    throw createHttpError(500, detail || "rembg 抠图失败。");
  }
  if (!existsSync(outputPath)) throw createHttpError(500, "rembg 没有输出图片。");
}

async function handleCanvasBeta(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const roots = canvasUserRoot(account.user.id);

  if (req.method === "POST" && parts[2] === "projects" && parts[3] === "save") {
    const body = await readJson(req);
    const id = safePathId(body.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const project = {
      id,
      name: String(body.name || "无限画布项目").slice(0, 80),
      assets: Array.isArray(body.assets) ? body.assets : [],
      activeFrameId: String(body.activeFrameId || ""),
      workspace: body.workspace && typeof body.workspace === "object" ? {
        virtualWidth: Math.max(0, Math.min(200000, Number(body.workspace.virtualWidth || 0))),
        virtualHeight: Math.max(0, Math.min(200000, Number(body.workspace.virtualHeight || 0))),
        workspaceHome: body.workspace.workspaceHome && typeof body.workspace.workspaceHome === "object"
          ? body.workspace.workspaceHome
          : null
      } : null,
      canvas: body.canvas || {},
      updatedAt: new Date().toISOString()
    };
    await mkdir(roots.projects, { recursive: true });
    await writeFile(join(roots.projects, `${id}.json`), JSON.stringify(project, null, 2), "utf8");
    queueCloudSnapshot({
      kind: "project",
      userId: account.user.id,
      id: project.id,
      data: project,
      assetDir: roots.assets,
      assetNames: canvasCloudAssetNames(project)
    });
    sendJson(res, 200, { project: { id: project.id, name: project.name, updatedAt: project.updatedAt } });
    return;
  }

  if (req.method === "POST" && parts[2] === "assets" && parts[3] === "upload") {
    const body = await readJson(req);
    const decoded = decodeDataUrlAsset(body.url || body.dataUrl, ".png");
    if (!decoded.buffer.length || decoded.buffer.length > maxImageUploadBytes) {
      throw createHttpError(400, `素材为空或超过 ${maxImageUploadMb}MB。`);
    }
    await mkdir(roots.assets, { recursive: true });
    const id = safePathId(body.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${id}${decoded.ext}`;
    const filePath = join(roots.assets, fileName);
    await writeFile(filePath, decoded.buffer);
    const asset = {
      id,
      name: basename(String(body.name || fileName)).slice(0, 120),
      url: `/api/canvas/assets/${encodeURIComponent(fileName)}`,
      type: decoded.mime,
      createdAt: new Date().toISOString()
    };
    sendJson(res, 200, { asset });
    return;
  }

  if (req.method === "POST" && parts[2] === "remove-background") {
    const body = await readJson(req);
    const decoded = await resolveCanvasRemoveBackgroundSource(body.url || body.dataUrl, roots);
    if (!decoded.buffer.length || decoded.buffer.length > maxImageUploadBytes) {
      throw createHttpError(400, `图片为空或超过 ${maxImageUploadMb}MB。`);
    }
    if (!/image\/(png|jpeg|jpg|webp)/i.test(decoded.mime || "")) {
      throw createHttpError(400, "仅支持 PNG / JPG / WEBP 图片抠图。");
    }
    await mkdir(roots.assets, { recursive: true });
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workDir = join(canvasBetaDir, "rembg", safePathId(account.user.id) || "anonymous", jobId);
    await mkdir(workDir, { recursive: true });
    const inputPath = join(workDir, `input${decoded.ext || ".png"}`);
    const rembgModel = normalizeRembgModel(body.model || body.mode);
    const outputFileName = `${safePathId(body.id) || jobId}-${rembgModel === "isnet-general-use" ? "rembg-fine" : "rembg"}.png`;
    const outputPath = join(roots.assets, outputFileName);
    await writeFile(inputPath, decoded.buffer);
    try {
      await runRembg(inputPath, outputPath, 180000, rembgModel);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
    const asset = {
      id: outputFileName.replace(/\.png$/i, ""),
      name: `${basename(String(body.name || "抠图素材")).replace(/\.[a-z0-9]+$/i, "").slice(0, 90)}-透明`,
      url: `/api/canvas/assets/${encodeURIComponent(outputFileName)}`,
      type: "image/png",
      hasAlpha: true,
      createdAt: new Date().toISOString()
    };
    sendJson(res, 200, { asset, source: "rembg", model: rembgModel });
    return;
  }

  if (req.method === "GET" && parts[2] === "assets" && parts.length === 4) {
    const fileName = basename(parts[3] || "");
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp|svg)$/i.test(fileName)) throw createHttpError(400, "素材路径无效。");
    const filePath = normalize(join(roots.assets, fileName));
    if (!filePath.startsWith(normalize(roots.assets))) throw createHttpError(403, "Forbidden");
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
    return;
  }

  sendJson(res, 404, { error: "画布 Beta 接口不存在。" });
}


async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const candidate = normalize(join(publicDir, pathname));
  if (!pathInside(publicDir, candidate)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(candidate);
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": mimeTypes[extname(candidate).toLowerCase()] || "application/octet-stream",
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
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (req.method === "OPTIONS") {
    sendOptions(res);
    return;
  }
  if ((req.url || "") === "/api/account/login") {
    route(handleAccountLogin, req, res);
    return;
  }
  if ((req.url || "") === "/api/account/logout") {
    route(handleAccountLogout, req, res);
    return;
  }
  if ((req.url || "") === "/api/account/change-password") {
    route(handleAccountChangePassword, req, res);
    return;
  }
  if ((req.url || "") === "/api/account/me") {
    route(handleAccountMe, req, res);
    return;
  }
  if ((req.url || "") === "/api/client/config") {
    route(getClientConfig, req, res);
    return;
  }
  if ((req.url || "") === "/api/health") {
    route(serviceHealth, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/conversations")) {
    route(handleAiConversations, req, res);
    return;
  }
  if ((req.url || "") === "/api/ai/feedback") {
    route(handleAiFeedback, req, res);
    return;
  }
  if ((req.url || "") === "/api/ai/failure-log") {
    route(handleAiFailureLog, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/copywriting")) {
    route(proxyAiCopywriting, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/design-agent-plan")) {
    route(proxyAiDesignAgentPlan, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/image-prompt")) {
    route(proxyAiImagePrompt, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/image-generation/status/")) {
    route(getAiImageJobStatus, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/ai/gallery/image/")) {
    route(handleAiGalleryImage, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/primary-image/image-generation")) {
    sendJson(res, 410, { error: "图片服务 A 2 Vision 生图接口已下线，请使用 图片服务。" });
    return;
  }
  if ((req.url || "").startsWith("/api/image-service/image-generation")) {
    route(proxyImageServiceGeneration, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/responses-image/image-generation")) {
    route(proxyPrimaryResponsesImageGeneration, req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/canvas/")) {
    route(handleCanvasBeta, req, res);
    return;
  }
  route(serveStatic, req, res);
});

await loadAccountSessions();
await loadRemoteImageBedCleanupQueueUnsafe().catch((error) => {
  console.warn("远程图片存储清理队列读取失败：", error.message || error);
});
await restoreAiImageJobStatusCache().catch((error) => {
  console.warn("AI 生图任务状态缓存读取失败：", error.message || error);
});
await processDataDeletionQueue().catch((error) => {
  console.warn("账户数据删除队列处理失败：", error.message || error);
});
await runDataRetentionCleanup().catch((error) => {
  console.warn("数据保留期自动清理失败：", error.message || error);
});
scheduleRemoteImageBedCleanupRun(nextRemoteImageBedCleanupDelay());
const dataDeletionTimer = setInterval(() => {
  void processDataDeletionQueue().catch((error) => {
    console.warn("账户数据删除队列处理失败：", error.message || error);
  });
}, 60 * 60 * 1000);
if (typeof dataDeletionTimer.unref === "function") dataDeletionTimer.unref();
const dataRetentionTimer = setInterval(() => {
  void runDataRetentionCleanup().catch((error) => {
    console.warn("数据保留期自动清理失败：", error.message || error);
  });
}, 60 * 60 * 1000);
dataRetentionTimer.unref?.();

server.listen(port, host, () => {
  console.log(`AI 创作画布: http://${host}:${port}`);
});
