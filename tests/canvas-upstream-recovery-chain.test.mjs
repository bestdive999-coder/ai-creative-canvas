import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../public/src/canvas-image-ai.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin-server.js", import.meta.url), "utf8");

const imageEditSource = serverSource.slice(
  serverSource.indexOf("async function requestPrimaryImageServiceEdit"),
  serverSource.indexOf("async function requestPrimaryImageServiceText")
);

test("图片服务编辑 retries transient disconnects with a fresh multipart body", async () => {
  assert.match(imageEditSource, /const buildForm = \(\) => \{/);
  assert.match(imageEditSource, /networkRetryAttempts \|\| 3/);
  assert.match(imageEditSource, /body: buildForm\(\)/);
  assert.match(imageEditSource, /isTransientAiNetworkError\(error\)/);
  assert.match(imageEditSource, /图片服务连接中断，正在自动重试/);

  class FakeFormData {
    constructor() {
      this.entries = [];
    }
    append(...args) {
      this.entries.push(args);
    }
  }
  const requestBodies = [];
  const progress = [];
  let fetchCount = 0;
  let referenceReadCount = 0;
  const createRequest = new Function(
    "FormData",
    "imageReferenceToBlob",
    "createHttpError",
    "fetchWithTimeout",
    "fetchPrimaryImageServiceJson",
    "isTransientAiNetworkError",
    "setTimeout",
    `${imageEditSource}; return requestPrimaryImageServiceEdit;`
  );
  const request = createRequest(
    FakeFormData,
    async () => {
      referenceReadCount += 1;
      return { blob: {}, fileName: "reference.png" };
    },
    (statusCode, message) => Object.assign(new Error(message), { statusCode }),
    async (_url, options) => {
      fetchCount += 1;
      requestBodies.push(options.body);
      if (fetchCount < 3) {
        const error = new Error("fetch failed: ECONNRESET");
        error.cause = { code: "ECONNRESET" };
        throw error;
      }
      return { ok: true };
    },
    async () => ({ data: [{ url: "ok" }] }),
    (error) => /ECONNRESET/.test(`${error?.cause?.code || ""} ${error?.message || ""}`),
    (callback) => {
      callback();
      return 1;
    }
  );
  const result = await request("key", {
    imageEditEndpoint: "https://example.invalid/images/edits",
    model: "image-model",
    prompt: "修改文字",
    size: "1024x1024",
    quality: "high",
    outputFormat: "png",
    references: [{ image_file: "data:image/png;base64,AA==" }],
    userId: "user",
    workflow: "canvas_image_edit",
    timeoutMs: 0,
    networkRetryAttempts: 3,
    onProgress: (value) => progress.push(value)
  }, 1);
  assert.deepEqual(result, { data: [{ url: "ok" }] });
  assert.equal(fetchCount, 3);
  assert.equal(referenceReadCount, 1);
  assert.equal(new Set(requestBodies).size, 3);
  assert.equal(progress.length, 2);
});

test("canvas does not submit a second failure row for a queued server job", () => {
  assert.match(canvasSource, /if \(!String\(error\?\.aiData\?\.jobId \|\| ""\)\.trim\(\)\)/);
});

test("admin feedback collapses only paired automatic rows", () => {
  assert.match(adminSource, /function collapseAutomaticFailureDuplicates/);
  assert.match(adminSource, /const exactlyOneHasJobId = Boolean\(item\.jobId\) !== Boolean\(candidate\.jobId\)/);
  assert.match(adminSource, /Math\.abs\(itemTime - candidateTime\) <= 10000/);

  const collapseSource = adminSource.slice(
    adminSource.indexOf("function collapseAutomaticFailureDuplicates"),
    adminSource.indexOf("async function buildAiFeedbackReport")
  );
  const collapse = new Function(`${collapseSource}; return collapseAutomaticFailureDuplicates;`)();
  const base = {
    rating: "down",
    issue: "图片服务图片模型连接失败",
    userId: "user-1",
    workflow: "canvas_image_edit",
    conversationId: "conversation-1",
    originalPrompt: "改字",
    plannedPrompt: "",
    prompt: "改字",
    references: [],
    createdAt: "2026-07-16T03:04:15.327Z",
    updatedAt: "2026-07-16T03:04:15.327Z"
  };
  const detailed = {
    ...base,
    id: "server-row",
    jobId: "job-1",
    provider: "imageservice",
    references: [{ name: "9000.png" }]
  };
  const generic = {
    ...base,
    id: "client-row",
    jobId: "",
    createdAt: "2026-07-16T03:04:15.406Z",
    updatedAt: "2026-07-16T03:04:15.406Z"
  };
  const secondRealTask = {
    ...detailed,
    id: "server-row-2",
    jobId: "job-2",
    createdAt: "2026-07-16T03:04:16.327Z",
    updatedAt: "2026-07-16T03:04:16.327Z"
  };
  const collapsedPair = collapse([detailed, generic]);
  assert.equal(collapsedPair.length, 1);
  assert.equal(collapsedPair[0].jobId, "job-1");
  assert.deepEqual(collapsedPair[0].references, [{ name: "9000.png" }]);
  assert.equal(collapse([detailed, secondRealTask]).length, 2);
});
