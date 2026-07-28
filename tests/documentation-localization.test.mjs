import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const locales = [
  ["English", "README.md"],
  ["简体中文", "docs/i18n/README.zh-CN.md"],
  ["日本語", "docs/i18n/README.ja.md"],
  ["한국어", "docs/i18n/README.ko.md"],
  ["Español", "docs/i18n/README.es.md"],
  ["Português", "docs/i18n/README.pt-BR.md"],
  ["Français", "docs/i18n/README.fr.md"],
  ["Deutsch", "docs/i18n/README.de.md"],
  ["Русский", "docs/i18n/README.ru.md"],
  ["العربية", "docs/i18n/README.ar.md"]
];

test("repository homepage exposes ten language entries", async () => {
  const readme = await read("README.md");
  assert.match(readme, /## What it is/);
  assert.match(readme, /## Runtime parameters/);
  assert.match(readme, /## Product tour and cases/);
  assert.match(readme, /## Architecture/);
  assert.match(readme, /mermaid/);
  for (const [label, file] of locales) {
    assert.match(readme, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await access(new URL(`./${file}`, root));
  }
});

test("translated introductions preserve the project boundaries", async () => {
  for (const [, file] of locales.slice(1)) {
    const content = await read(file);
    assert.match(content, /Apache License 2\.0/);
    assert.match(content, /runtime/);
    assert.match(content, /CASES\.md/);
    assert.match(content, /CONFIGURATION\.md/);
  }
});

test("supporting documentation covers configuration, architecture, cases, and localization", async () => {
  const [configuration, architecture, cases, localization] = await Promise.all([
    read("docs/CONFIGURATION.md"),
    read("docs/ARCHITECTURE.md"),
    read("docs/CASES.md"),
    read("docs/LOCALIZATION.md")
  ]);
  assert.match(configuration, /cloudSync/);
  assert.match(configuration, /objectStorage/);
  assert.match(architecture, /Local runtime/);
  assert.match(architecture, /S3/);
  assert.match(cases, /Case 1: Product main image/);
  assert.match(cases, /Case 2: Long detail page/);
  assert.match(cases, /Case 3: Canvas iteration and backup/);
  assert.match(localization, /ten languages/);
});
