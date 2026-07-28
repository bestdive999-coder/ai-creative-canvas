# Preview 21 verification: font distribution hardening

Date: 2026-07-28  
Version: `0.1.0-preview.21`  
Scope: `ecommerce-ai-worker-canvas-open-source-preview` only

## Changes verified

- Employee and administrator interfaces now use a portable system-font stack
  instead of preferring an unbundled named typeface.
- New Fabric canvas text and generation-status text use the same portable
  system-font stack instead of hard-coding a Microsoft font.
- No font binary is bundled or downloaded by the application.
- The source-release policy rejects common font extensions and recognized
  TrueType, OpenType, TrueType Collection, WOFF and WOFF2 file signatures.
- The source packager excludes Git history, dependencies, runtime data,
  outputs, temporary files, local `.env` files and nested source ZIP files.

## Automated verification

Commands:

```text
node scripts/check-font-distribution.mjs
node --test tests/*.test.mjs
node scripts/package-source.mjs
unzip -tq ../ecommerce-ai-worker-canvas-open-source-preview-0.1.0-preview.21-source.zip
git diff --check
```

Result:

- repository font binaries: `0`;
- source-archive font binaries: `0`;
- local or remote `@font-face` sources: `0`;
- `94/94` automated tests passed;
- the font-policy fixture detected both a `.ttf` file and an OpenType file
  disguised with a different extension;
- the source archive passed ZIP integrity checks;
- two independent package runs produced the same SHA-256 digest.

## Real-browser verification

The employee and administrator services were started from an isolated temporary
runtime on loopback ports `6473` and `6488`.

Employee workspace:

- authenticated through the real interface;
- confirmed the computed interface font uses the portable system stack;
- checked Portuguese, German, Russian and Arabic at `390 × 844`;
- the panel, tabs, model card, quick items and composer stayed within the
  viewport with no horizontal document overflow;
- Arabic used RTL.

Administrator workspace:

- authenticated through the real interface;
- confirmed the computed interface font uses the portable system stack;
- checked Portuguese, German, Russian and Arabic at `700 × 900`;
- no horizontal document overflow was found;
- Arabic used RTL.

## Release artifact

- archive:
  `ecommerce-ai-worker-canvas-open-source-preview-0.1.0-preview.21-source.zip`
- SHA-256 is written beside the archive in the generated `.sha256` file.

The archive contains source code and license records only. It does not publish,
push, tag, commit, or create a GitHub release.

## Isolation evidence

- Open-source preview base commit:
  `c6e8d780f3c4215b33864b8b4b1bb428ff14e1c9`
- Original private checkout remained at:
  `389b6d19c667e3b8c1fd345aaa15ab8940050588`
- The original checkout already contained unrelated local work; none of those
  files were edited as part of this verification.
