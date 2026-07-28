# Preview 16 panel-container verification

Date: 2026-07-24

Preview 16 extends the localized responsive workbench fix so the generation
configuration summary responds to the width of the employee panel itself, not
only to the browser viewport.

This covers the desktop layout where the viewport is wide while the fixed
right-hand workbench remains 360 px wide. At that width, the configuration
label and localized value now use two rows and no longer depend on a
single-line ellipsis.

The same container rule covers the full-width 360 px and 671 px mobile
verification sizes recorded for preview 15.
