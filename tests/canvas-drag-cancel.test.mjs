import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvasEventsSource = await readFile(new URL("../public/src/canvas-events.js", import.meta.url), "utf8");
const canvasObjectsSource = await readFile(new URL("../public/src/canvas-objects.js", import.meta.url), "utf8");

test("canvas object transforms are cancelled when the page loses pointer continuity", () => {
  assert.match(canvasEventsSource, /window\.addEventListener\("blur", cancelCanvasPointerInteraction\)/);
  assert.match(canvasEventsSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(canvasEventsSource, /document\.addEventListener\("pointercancel", cancelCanvasPointerInteraction, true\)/);
  assert.match(canvasEventsSource, /canvas\._currentTransform = null/);
  assert.match(canvasEventsSource, /document\.dispatchEvent\(new MouseEvent\("mouseup"/);
});

test("canvas AI editor drag cleans up on blur and hidden documents", () => {
  assert.match(canvasObjectsSource, /window\.addEventListener\("blur", endCanvasImageAiDrag\)/);
  assert.match(canvasObjectsSource, /document\.addEventListener\("visibilitychange", cancelHiddenCanvasImageAiDrag\)/);
  assert.match(canvasObjectsSource, /window\.removeEventListener\("blur", endCanvasImageAiDrag\)/);
  assert.match(canvasObjectsSource, /if \(document\.hidden\) endCanvasImageAiDrag\(\)/);
});
