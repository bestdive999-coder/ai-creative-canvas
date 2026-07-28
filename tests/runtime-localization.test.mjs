import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const localeIds = ["en", "zh-CN", "ja", "ko", "es", "pt-BR", "fr", "de", "ru", "ar"];

test("employee and admin shells expose a ten-language runtime selector", async () => {
  const [employeeHtml, adminHtml, employeeI18n, adminI18n] = await Promise.all([
    read("public/index.html"),
    read("admin-public/index.html"),
    read("public/src/i18n.js"),
    read("admin-public/i18n.js")
  ]);
  for (const id of localeIds) {
    assert.match(employeeI18n, new RegExp(`\\[\\"${id.replace("-", "\\-")}\\"`));
    assert.match(adminI18n, new RegExp(`\\[\\"${id.replace("-", "\\-")}\\"`));
  }
  assert.match(employeeHtml, /id="appLanguageSelect"/);
  assert.match(employeeHtml, /studio-project-bar[\s\S]*?id="appLanguageSelect"/);
  assert.doesNotMatch(employeeHtml, /studio-panel-top-icons[\s\S]*?id="appLanguageSelect"/);
  assert.match(employeeHtml, /src="\.\/src\/i18n\.js/);
  assert.match(adminHtml, /id="appLanguageSelect"/);
  assert.match(adminHtml, /src="\.\/i18n\.js/);
  assert.match(employeeI18n, /locale === "ar" \? "rtl"/);
  assert.match(adminI18n, /locale === "ar" \? "rtl"/);
});

test("runtime localization keeps a browser-local preference", async () => {
  const [employeeI18n, adminI18n] = await Promise.all([read("public/src/i18n.js"), read("admin-public/i18n.js")]);
  assert.match(employeeI18n, /localStorage\.getItem\("ai_canvas_locale"\)/);
  assert.match(employeeI18n, /localStorage\.setItem\("ai_canvas_locale"/);
  assert.match(adminI18n, /localStorage\.getItem\("ai_canvas_locale"\)/);
  assert.match(adminI18n, /localStorage\.setItem\("ai_canvas_locale"/);
});

test("image counts use the locale-specific singular form", async () => {
  const employeeI18n = await read("public/src/i18n.js");
  let activeLocale = "pt-BR";
  const context = {
    window: {},
    document: {
      documentElement: { lang: "pt-BR", dir: "ltr" },
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    },
    navigator: { language: "pt-BR" },
    localStorage: {
      getItem() { return activeLocale; },
      setItem() {}
    },
    CustomEvent: class CustomEvent {}
  };
  runInNewContext(employeeI18n, context);
  assert.equal(context.window.EcommerceCanvasI18n.formatImageCount(1), "1 imagem");
  assert.equal(context.window.EcommerceCanvasI18n.formatImageCount(2), "2 imagens");
  activeLocale = "en";
  assert.equal(context.window.EcommerceCanvasI18n.formatImageCount(1), "1 image");
  assert.equal(context.window.EcommerceCanvasI18n.formatImageCount(2), "2 images");
});

test("admin localization never overwrites dynamic session or dashboard content", async () => {
  const adminHtml = await read("admin-public/index.html");

  assert.doesNotMatch(adminHtml, /id="adminStatus"[^>]*data-i18n=/);
  assert.doesNotMatch(adminHtml, /id="summaryLine"[^>]*data-i18n=/);
  assert.doesNotMatch(adminHtml, /id="overview"[^>]*data-i18n=/);
  assert.match(adminHtml, /id="adminStatus"/);
  assert.match(adminHtml, /id="summaryLine"/);
  assert.match(adminHtml, /id="overview"/);
});

test("admin module chrome is localized in every supported locale", async () => {
  const [adminI18n, adminApp] = await Promise.all([read("admin-public/i18n.js"), read("admin-public/app.js")]);
  const context = {
    window: {},
    document: {
      documentElement: { lang: "en", dir: "ltr" },
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    },
    navigator: { language: "en" },
    localStorage: {
      getItem() { return "en"; },
      setItem() {}
    },
    CustomEvent: class CustomEvent {}
  };
  runInNewContext(adminI18n, context);
  const dictionaries = context.window.EcommerceCanvasI18n.dictionaries;
  const keys = [
    "operations", "authorization", "statistics", "issues", "status", "intranet",
    "adminLoginKicker", "adminSetupKicker", "localAdministrator",
    "moduleOverviewTitle", "moduleOverviewKicker", "moduleOverviewDescription",
    "moduleAccountsTitle", "moduleAccountsKicker", "moduleAccountsDescription",
    "moduleUsageTitle", "moduleUsageKicker", "moduleUsageDescription",
    "moduleFeedbackTitle", "moduleFeedbackKicker", "moduleFeedbackDescription",
    "moduleAiTitle", "moduleAiKicker", "moduleAiDescription",
    "moduleDiagnosticsTitle", "moduleDiagnosticsKicker", "moduleDiagnosticsDescription",
    "moduleSystemTitle", "moduleSystemKicker", "moduleSystemDescription",
    "versionSummary", "notSpecified", "maintenance", "quickAccess"
  ];
  for (const locale of localeIds) {
    for (const key of keys) {
      assert.equal(typeof dictionaries[locale][key], "string", `${locale}.${key}`);
      assert.ok(dictionaries[locale][key].trim(), `${locale}.${key}`);
    }
  }
  assert.match(adminApp, /titleKey:\s*"moduleOverviewTitle"/);
  assert.match(adminApp, /ai-canvas-locale-change[\s\S]*?renderOverview\(\)/);
  assert.match(adminApp, /localizedVersionSummary\(/);
  assert.doesNotMatch(adminApp, /<span>当前 \$\{escapeHtml\(updates\.currentVersion/);
});

test("employee and admin dynamic interface text use a bundled ten-language catalog", async () => {
  const [employeeHtml, employeeI18n, employeeText, adminHtml, adminI18n, adminText] = await Promise.all([
    read("public/index.html"),
    read("public/src/i18n.js"),
    read("public/src/text-translations.js"),
    read("admin-public/index.html"),
    read("admin-public/i18n.js"),
    read("admin-public/text-translations.js")
  ]);
  const employeeTextIndex = employeeHtml.indexOf("./src/text-translations.js");
  const employeeI18nIndex = employeeHtml.indexOf("./src/i18n.js");
  const textIndex = adminHtml.indexOf("./text-translations.js");
  const i18nIndex = adminHtml.indexOf("./i18n.js");
  assert.ok(employeeTextIndex >= 0 && employeeI18nIndex > employeeTextIndex, "employee dynamic catalog must load before i18n");
  assert.ok(textIndex >= 0 && i18nIndex > textIndex, "dynamic catalog must load before admin i18n");
  assert.match(employeeI18n, /EcommerceCanvasText\?\.apply\(root,\s*locale\)/);
  assert.match(adminI18n, /EcommerceCanvasAdminText\?\.apply\(root,\s*locale\)/);
  assert.match(adminText, /new MutationObserver/);
  assert.match(adminText, /window\.EcommerceCanvasText\s*=\s*\{\s*catalogs,/);
  assert.match(adminText, /window\.EcommerceCanvasAdminText\s*=\s*window\.EcommerceCanvasText/);
  assert.doesNotMatch(adminText, /fetch\(|translate\.google|lingva|mymemory/i);
  assert.equal(employeeText, adminText, "both surfaces must use the same offline catalog");

  const match = adminText.match(/const catalogs = (\{.*\});\n  const manualOverrides/s);
  assert.ok(match, "bundled catalogs must be statically readable");
  const catalogs = JSON.parse(match[1]);
  for (const locale of localeIds.filter((id) => id !== "zh-CN")) {
    const entries = Object.entries(catalogs[locale] || {});
    assert.ok(entries.length >= 900, `${locale} catalog coverage`);
    const changed = entries.filter(([source, localized]) => source !== localized && String(localized).trim()).length;
    assert.ok(changed / entries.length >= 0.85, `${locale} translated coverage`);
  }
  assert.match(adminText, /const textSources = new WeakMap\(\)/);
  assert.match(adminText, /const attributeSources = new WeakMap\(\)/);
  assert.match(adminText, /locale === "zh-CN" \? text : translate\(text, locale\)/);
  assert.match(adminText, /locale === "zh-CN" \? record\.source : translate\(record\.source, locale\)/);
  assert.match(adminText, /"__V0__：已打开工具菜单。":\s*"__V0__: tool menu opened\."/);
  assert.match(adminText, /"__V0__ 已加入画布。":\s*"__V0__ was added to the canvas\."/);
  assert.match(adminText, /"文字已加入画布，双击即可编辑。":\s*"Text was added to the canvas\. Double-click to edit\."/);
});

test("employee persistent UI and dynamic panels are wired to runtime localization", async () => {
  const [employeeHtml, employeeI18n, appShell, aiControls, conversations, assets, chatRenderer] = await Promise.all([
    read("public/index.html"),
    read("public/src/i18n.js"),
    read("public/src/app-shell.js"),
    read("public/src/ai-controls.js"),
    read("public/src/conversations.js"),
    read("public/src/canvas-assets.js"),
    read("public/src/ai-chat-renderer.js")
  ]);

  assert.match(employeeHtml, /id="canvasProjectName"[^>]*data-i18n-value="unsavedProject"/);
  assert.match(employeeHtml, /data-studio-panel="ai"[^>]*data-i18n="create"/);
  assert.match(employeeHtml, /data-i18n="imageGenerationModel"/);
  assert.match(employeeHtml, /data-i18n="waitingGeneration"/);
  assert.match(employeeHtml, /data-i18n-count="4"/);
  assert.match(employeeHtml, /data-i18n-aria-label="modelType"/);
  assert.match(employeeI18n, /function format\(key, values/);
  assert.match(employeeI18n, /data-i18n-tooltip/);
  assert.match(employeeI18n, /data-i18n-value/);
  assert.match(appShell, /ai-canvas-locale-change/);
  assert.match(appShell, /renderAiSkillSelector\(\)/);
  assert.match(appShell, /renderUserImageModelControls\(\)/);
  assert.match(appShell, /renderAccountState\(\)/);
  assert.match(aiControls, /localizedSkill/);
  assert.match(aiControls, /userModelCurrentStatus/);
  assert.match(conversations, /noGenerationTasks/);
  assert.match(assets, /importAssetsHint/);
  assert.match(chatRenderer, /waitingGeneration/);
});

test("all non-Chinese employee locales provide localized persistent-panel labels", async () => {
  const employeeI18n = await read("public/src/i18n.js");
  const context = {
    window: {},
    document: {
      documentElement: { lang: "en", dir: "ltr" },
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    },
    navigator: { language: "en" },
    localStorage: {
      getItem() { return "en"; },
      setItem() {}
    },
    CustomEvent: class CustomEvent {}
  };
  runInNewContext(employeeI18n, context);
  const dictionaries = context.window.EcommerceCanvasI18n.dictionaries;
  const persistentKeys = [
    "create",
    "modelStatus",
    "imageGenerationModel",
    "quickGenerate",
    "waitingGeneration",
    "resultsAppear",
    "output",
    "model",
    "imageService",
    "autoRoute",
    "uploadAttachment",
    "webSearch",
    "modelPreferences",
    "promptDescription",
    "userModels",
    "performance",
    "infiniteCanvas",
    "drag",
    "noAssets"
  ];
  for (const locale of localeIds.filter((id) => !["en", "zh-CN"].includes(id))) {
    for (const key of persistentKeys) {
      assert.equal(typeof dictionaries[locale][key], "string", `${locale}.${key}`);
      assert.notEqual(dictionaries[locale][key], dictionaries["zh-CN"][key], `${locale}.${key}`);
    }
  }
});

test("all employee locales localize the project bar, generation drawer, model choice, and task states", async () => {
  const employeeI18n = await read("public/src/i18n.js");
  const context = {
    window: {},
    document: {
      documentElement: { lang: "en", dir: "ltr" },
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    },
    navigator: { language: "en" },
    localStorage: {
      getItem() { return "en"; },
      setItem() {}
    },
    CustomEvent: class CustomEvent {}
  };
  runInNewContext(employeeI18n, context);
  const dictionaries = context.window.EcommerceCanvasI18n.dictionaries;
  const keys = [
    "unsavedProject", "autoSaved", "assets", "generationKicker", "agent", "image", "video",
    "generationMode", "automaticModel", "standardThinking", "noThinking", "deepThinking",
    "closeConfiguration", "configCategories", "modelType", "modelListPlaceholder",
    "userModelDefaultStatus", "imageCountFormat", "taskFilters", "running", "attention",
    "completed", "failed", "noTasksInFilter", "skillCategoryVideo", "skillCategorySocial",
    "skillCategoryEcommerce", "skillCategoryBrand", "skillTypeAgent", "skillRebuildName",
    "skillMainImageName", "skillDetailName", "skillCampaignName", "skillEcommerceName",
    "canvasToolMenuOpened", "canvasObjectAdded", "canvasTextAdded", "shapeText"
  ];
  const localizedAgainstEnglish = new Set(keys.filter((key) => ![
    "assets", "agent", "image", "video", "standard", "imageCountFormat",
    "skillCategoryVideo", "skillCategorySocial", "skillCategoryEcommerce"
  ].includes(key)));
  for (const locale of localeIds.filter((id) => !["en", "zh-CN"].includes(id))) {
    for (const key of keys) {
      assert.equal(typeof dictionaries[locale][key], "string", `${locale}.${key}`);
      if (localizedAgainstEnglish.has(key)) {
        assert.notEqual(dictionaries[locale][key], dictionaries.en[key], `${locale}.${key}`);
      }
    }
  }
});
