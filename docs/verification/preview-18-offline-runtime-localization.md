# Preview 18 verification: offline runtime localization and responsive UI

Date: 2026-07-28
Version: `0.1.0-preview.18`
Scope: open-source preview copy only

## Changes verified

- Added one shared bundled translation catalog for employee and administrator
  dynamic interface text. Language switching makes no external translation
  request.
- Kept keyed translations for stable interface labels and added runtime
  translation for dynamic status, toast, module, and server-rendered text.
- Preserved user-entered names, prompts, model IDs, and configuration-field
  values instead of translating user data.
- Made the employee project bar, tabs, model card, quick actions, generation
  drawer, and model controls resilient to long localized labels.
- Made the administrator top bar, locale controls, module rail, cards, tables,
  maintenance note, and update/uninstall sections resilient to long localized
  labels.
- Restored the original Chinese source before applying another locale, so
  repeated locale changes do not translate an already translated string.

## Real-browser employee verification

The isolated employee service at `http://127.0.0.1:6174/` was exercised through
the real browser UI.

All ten locales were checked at `1788`, `1005`, `671`, and `360` CSS pixels:

- English
- 简体中文
- 日本語
- 한국어
- Español
- Português
- Français
- Deutsch
- Русский
- العربية

Result for all 40 locale/width combinations:

- document horizontal overflow: `0 px`
- clipped controls: `0`
- overlapping project-bar controls: `0`
- model card, quick actions, and configuration summary remained inside the panel
- Arabic enabled RTL; the other nine locales remained LTR

At `360 px`, the open model drawer measured `332 px` from `14 px` to `346 px`
in every locale, with `0 px` document overflow.

Dynamic-catalog interaction:

- While English was active, creating a new project changed the hard-coded
  runtime toast to `A new infinite canvas project has been created.`
- The project field also displayed `Unsaved project`.

## Model-choice interaction verification

1. Saved `community-image-standard` and `community-image-pro`.
2. Confirmed the first model became selected and appeared in the generation
   summary.
3. Selected `community-image-pro` and confirmed the status, summary, and
   automatic-mode toggle updated together.
4. Restored the administrator default and confirmed:
   - the current model selection became empty;
   - automatic mode became enabled;
   - both browser-local model names remained available;
   - the generation summary removed the user-model override.
5. Repeated save and reset while German was active:
   - save toast: `2 Modelle gespeichert.`
   - reset toast: `Admin-Standardmodell wiederhergestellt.`

## Real-browser administrator verification

The isolated administrator service at `http://127.0.0.1:6288/` was exercised
through the real browser UI with an isolated temporary account.

Top bar and system-screen matrix:

- all ten locales at `1440`, `1005`, `760`, and `360` CSS pixels
- 40/40 combinations had `0 px` document overflow, no clipped controls, and no
  control overlap
- French, German, Russian, and Arabic long-label cases passed at `360 px`

Full module matrix at `360 px`:

- 10 locales × 7 modules = 70 combinations
- modules: overview, accounts, usage, feedback, AI, diagnostics, and system
- `0` document overflow
- `0` uncontained clipped elements
- `0` Han-script residue in non-Chinese/non-Japanese interface text

The accounts and feedback data tables intentionally retain horizontal scrolling
inside their bounded table cards; they do not widen the document.

## Automated regression

Syntax checks passed for both locale runtimes, both bundled catalogs, and the
administrator application.

Command:

```text
node --test tests/*.test.mjs
```

Result: `83/83` tests passed.

## Isolation and release state

- Only `ecommerce-ai-worker-canvas-open-source-preview` was modified.
- The original `ecommerce-ai-worker-canvas-beta` checkout remained at
  `389b6d19c667e3b8c1fd345aaa15ab8940050588`.
- This verification does not publish or push the preview.
