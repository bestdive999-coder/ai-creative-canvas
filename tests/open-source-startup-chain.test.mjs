import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../public/src/app-shell.js", import.meta.url), "utf8");
const generationSource = await readFile(new URL("../public/src/ai-generation.js", import.meta.url), "utf8");
const controlsSource = await readFile(new URL("../public/src/ai-controls.js", import.meta.url), "utf8");
const stateSource = await readFile(new URL("../public/src/app-state.js", import.meta.url), "utf8");
const projectsSource = await readFile(new URL("../public/src/canvas-projects.js", import.meta.url), "utf8");
const contextSource = await readFile(new URL("../public/src/canvas-context.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("employee startup keeps generic config and summary helpers after workflow removal", () => {
  assert.match(appSource, /async function loadClientConfig\(\)/);
  assert.match(appSource, /function updateSummary\(\)/);
});

test("employee startup does not reference helpers owned by removed workflows", () => {
  assert.doesNotMatch(appSource, /^\s*wrapText,\s*$/m);
  assert.doesNotMatch(appSource, /^\s*exportAiZip,\s*$/m);
  assert.doesNotMatch(shellSource, /\bexportAiZip\b/);
  assert.doesNotMatch(generationSource, /^\s*wrapText,\s*$/m);
});

test("employee UI does not retain removed workflow styling or duplicate layout choices", () => {
  assert.doesNotMatch(stylesSource, /data-tool-popup="ps"|\bpsWorkflow\b/);
  assert.doesNotMatch(controlsSource, /data-inline-detail-brand/);
  assert.match(indexSource, /id="workspaceModelStatus" class="is-unconfigured"[^>]*data-i18n="unconfigured"[^>]*>未配置</);
  assert.match(controlsSource, /workspaceModelStatus\.textContent = configured \? tr\("online"/);
});

test("layer panel controls have only the app-shell event binding", () => {
  assert.doesNotMatch(appSource, /closest\?\.\("#canvasLayerPanel(?:Toggle|Close)Btn"\)/);
  assert.match(shellSource, /on\(els\.canvasLayerPanelCloseBtn, "click"/);
  assert.match(shellSource, /on\(els\.canvasLayerPanelToggleBtn, "click"/);
  assert.match(stylesSource, /body\.workspace-mode \.studio-bottom-status \{\s*top: 568px;\s*left: 12px;\s*bottom: auto;/);
});

test("removed optional canvas workflows leave no UI or callable code", () => {
  const combined = [appSource, shellSource, stateSource, projectsSource, contextSource, indexSource, stylesSource].join("\n");
  assert.doesNotMatch(combined, /canvasExportPng|canvasProjectSelect|canvasLoadProjectBtn|canvasCustomFrame|canvasLayerTopBtn|canvasPropX|data-canvas-role|data-tool-mode="mark"/);
  assert.doesNotMatch(combined, /data-studio-panel(?:-view)?="(?:layers|props|project)"/);
  assert.doesNotMatch(combined, /bring-forward|send-backward|bring-to-front|send-to-back/);
  assert.doesNotMatch(serverSource, /req\.method === "GET" && parts\[2\] === "projects"/);
});
