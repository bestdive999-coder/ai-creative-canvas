# Preview 17 verification: global locale UI and model choice

Date: 2026-07-24  
Version: `0.1.0-preview.17`  
Scope: open-source preview copy only

## Changes verified

- Moved the employee language selector from the AI-panel tabs to the project bar.
- Re-rendered dynamic model controls, Agent labels, task states, asset labels, count text, and model summaries after every locale change.
- Separated the model source from the generation mode:
  - Automatic enabled: use the administrator default model.
  - Automatic disabled: use the selected browser-local user model.
  - Generation-mode cards continue to control quality and thinking behavior only.
- Saving a model list selects the first valid user model when no valid selection exists.
- Restoring the administrator default keeps the saved user-model list.
- Added locale-specific singular image counts.
- Prevented narrow-layout hidden-container scrolling and RTL off-canvas horizontal overflow.

## Browser verification

The live local service at `http://127.0.0.1:6174/` was exercised through the real browser UI.

The following areas were opened and checked in every supported locale:

- Project bar and language selector
- Create, Tasks, and Assets panels
- Agent, Output, and Model configuration tabs
- Model source toggle and browser-local model selector
- Generation summary and image count

| Locale | Project text | Agent text | Singular count | Dynamic fallback scan | Horizontal overflow |
| --- | --- | --- | --- | --- | --- |
| English | Pass | Pass | Pass | Pass | 0 px |
| 简体中文 | Pass | Pass | Pass | Pass | 0 px |
| 日本語 | Pass | Pass | Pass | Pass | 0 px |
| 한국어 | Pass | Pass | Pass | Pass | 0 px |
| Español | Pass | Pass | Pass | Pass | 0 px |
| Português | Pass | Pass | Pass | Pass | 0 px |
| Français | Pass | Pass | Pass | Pass | 0 px |
| Deutsch | Pass | Pass | Pass | Pass | 0 px |
| Русский | Pass | Pass | Pass | Pass | 0 px |
| العربية | Pass | Pass | Pass | Pass | 0 px; RTL enabled |

Responsive checks:

- `1005 px`: all ten locales and all six UI areas passed.
- `671 px`: German Model panel stayed within the viewport; document and panel overflow were `0 px`.
- `360 px`: the project bar, language selector, German Model panel, and Arabic RTL Model panel stayed within the viewport; document and panel overflow were `0 px`.

## Model-choice interaction verification

1. Added `open-image-pro` and `open-image-fast`.
2. Saved the list and confirmed `open-image-pro` became the current model.
3. Confirmed the automatic-model toggle became unchecked.
4. Restored the administrator default and confirmed:
   - automatic mode became checked;
   - both user models remained available.
5. Disabled automatic mode and confirmed `open-image-pro` was selected again.

## Automated regression

Command:

```text
node --test tests/*.test.mjs
```

Result: `80/80` tests passed.

This record does not publish or push the preview.
