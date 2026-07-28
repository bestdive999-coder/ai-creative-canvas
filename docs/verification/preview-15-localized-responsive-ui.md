# Preview 15 localized responsive UI verification

Date: 2026-07-24

Scope: employee workbench in the sanitized open-source preview only. The original
internal project is outside this change.

## Fixed surfaces

- The fixed workbench header reserves independent columns for the three tabs,
  locale selector, and logout action.
- Enhanced native selects remain accessible while their visible menu opens as an
  absolute overlay instead of changing document flow.
- Long model names, descriptions, status labels, and quick-generation labels
  wrap within their containers.
- Narrow layouts remove the artificial full-viewport empty-state stretch.
- The generation configuration summary becomes a two-row layout on narrow
  screens, preserving the full localized summary.
- Right-to-left alignment is retained for Arabic.

## Browser verification

The local employee app was checked at `http://127.0.0.1:6174/`.

| Locale | Viewport | Horizontal overflow | Header in viewport | Empty/composer overlap | Direction |
| --- | --- | ---: | --- | ---: | --- |
| Portuguese (`pt-BR`) | 360 × 1200 | 0 px | yes | 0 px | LTR |
| German (`de`) | 360 × 1200 | 0 px | yes | 0 px | LTR |
| Russian (`ru`) | 360 × 1200 | 0 px | yes | 0 px | LTR |
| Arabic (`ar`) | 360 × 1200 | 0 px | yes | 0 px | RTL |
| Portuguese (`pt-BR`) | 671 × 2048 | 0 px | yes | 0 px | LTR |

At 360 px, the locale menu was also opened and measured as an absolute overlay:
it stayed between x=165 and x=315 inside the 360 px viewport and used z-index
240. At 671 px, the model card was 60 px high, the quick-action region 100 px,
and the compact empty state 154 px; the composer began after the empty state
with no collision.

## Automated verification

Command:

```sh
node --test tests/*.test.mjs
```

Result: 77 passed, 0 failed.

The dedicated responsive regression suite covers the hidden native select,
overlay menu, five-column header, long-label wrapping, compact mobile empty
state, and two-row generation summary.
