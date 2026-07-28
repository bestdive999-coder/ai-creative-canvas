import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

const encryptedPrefix = "enc:v1:";
const environmentKeyName = "ECOM_CONFIG_SECRET_KEY";

function keyFromEnvironment() {
  const raw = String(process.env[environmentKeyName] || "").trim();
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}
  return createHash("sha256").update(raw, "utf8").digest();
}

function ensureLocalKey(keyPath) {
  const fromEnvironment = keyFromEnvironment();
  if (fromEnvironment) return fromEnvironment;
  if (!keyPath) {
    throw new Error(`${environmentKeyName} is required when no local secret-key path is configured.`);
  }
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath);
    if (existing.length === 32) return existing;
    const text = existing.toString("utf8").trim();
    if (/^[a-f0-9]{64}$/i.test(text)) return Buffer.from(text, "hex");
    throw new Error(`Invalid local configuration key: ${keyPath}`);
  }
  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" });
  try { chmodSync(keyPath, 0o600); } catch {}
  return key;
}

function encryptedValue(value) {
  return typeof value === "string" && value.startsWith(encryptedPrefix);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createSecretStore(keyPath) {
  let cachedKey = null;
  const key = () => {
    if (!cachedKey) cachedKey = ensureLocalKey(keyPath);
    return cachedKey;
  };

  function encrypt(value) {
    const text = String(value || "");
    if (!text || encryptedValue(text)) return text;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${encryptedPrefix}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
  }

  function decrypt(value) {
    const text = String(value || "");
    if (!encryptedValue(text)) return text;
    const payload = Buffer.from(text.slice(encryptedPrefix.length), "base64");
    if (payload.length < 29) throw new Error("Encrypted configuration value is invalid.");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  function transformObject(source, transform) {
    const value = clone(source || {});
    const ai = value.ai && typeof value.ai === "object" ? value.ai : null;
    if (!ai) return value;
    for (const field of [
      "primaryImageApiKey",
      "secondaryImageApiKey",
      "textServiceBApiKey",
      "textServiceCApiKey"
    ]) {
      if (Object.prototype.hasOwnProperty.call(ai, field)) ai[field] = transform(ai[field]);
    }
    if (Array.isArray(ai.groupKeys)) {
      ai.groupKeys = ai.groupKeys.map((group) => {
        const next = { ...(group || {}) };
        for (const field of [
          "primaryImageApiKey",
          "secondaryImageApiKey",
          "textServiceBApiKey",
          "textServiceCApiKey"
        ]) {
          if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = transform(next[field]);
        }
        return next;
      });
    }
    if (ai.remoteImageBed && typeof ai.remoteImageBed === "object") {
      ai.remoteImageBed.token = transform(ai.remoteImageBed.token);
    }
    if (ai.objectStorage && typeof ai.objectStorage === "object") {
      ai.objectStorage.secretAccessKey = transform(ai.objectStorage.secretAccessKey);
    }
    return value;
  }

  function transformUser(source, transform) {
    const user = clone(source || {});
    const keys = user.aiKeys && typeof user.aiKeys === "object" ? { ...user.aiKeys } : null;
    if (!keys) return user;
    for (const field of [
      "primaryImageApiKey",
      "secondaryImageApiKey",
      "textServiceBApiKey",
      "textServiceCApiKey"
    ]) {
      if (Object.prototype.hasOwnProperty.call(keys, field)) keys[field] = transform(keys[field]);
    }
    user.aiKeys = keys;
    return user;
  }

  function configNeedsEncryption(source) {
    const ai = source?.ai && typeof source.ai === "object" ? source.ai : {};
    const values = [
      ai.primaryImageApiKey,
      ai.secondaryImageApiKey,
      ai.textServiceBApiKey,
      ai.textServiceCApiKey,
      ai.remoteImageBed?.token,
      ai.objectStorage?.secretAccessKey,
      ...(Array.isArray(ai.groupKeys)
        ? ai.groupKeys.flatMap((group) => [
          group?.primaryImageApiKey,
          group?.secondaryImageApiKey,
          group?.textServiceBApiKey,
          group?.textServiceCApiKey
        ])
        : [])
    ];
    return values.some((value) => value && !encryptedValue(value));
  }

  return {
    encrypt,
    decrypt,
    encryptConfig: (value) => transformObject(value, encrypt),
    decryptConfig: (value) => transformObject(value, decrypt),
    encryptUser: (value) => transformUser(value, encrypt),
    decryptUser: (value) => transformUser(value, decrypt),
    configNeedsEncryption,
    isEncrypted: encryptedValue,
    environmentKeyName
  };
}
