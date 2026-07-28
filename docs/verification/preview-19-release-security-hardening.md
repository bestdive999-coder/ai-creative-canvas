# Preview 19 verification: release security and provenance hardening

Date: 2026-07-28  
Version: `0.1.0-preview.19`  
Scope: `ecommerce-ai-worker-canvas-open-source-preview` only

## Release risks addressed

- Runtime service credentials, storage credentials, and per-user AI keys are
  encrypted with AES-256-GCM before being written to disk.
- The automatically generated local encryption key and account/config files are
  restricted to the owning OS account where the platform supports POSIX modes.
- Employee and administrator services bind to loopback by default. Appliance
  scripts explicitly opt into LAN listening; first-administrator setup remains
  loopback-only.
- Session cookies support `Secure`, state-changing requests reject cross-site
  origins, static file paths are contained below their public roots, and both
  services return baseline browser security headers.
- Remote update downloads are disabled unless explicitly enabled, require HTTPS,
  and require a separately checked SHA-256 digest. Local update uploads also
  calculate and retain a digest.
- Account deletion removes local user sessions and usage records, deletes the
  known local content paths, and queues configured remote-object cleanup with a
  durable result record.
- The optional Python runtime is pinned for Python 3.12 Windows x64 with hashes
  and binary-only installation. A model with unclear redistribution terms is no
  longer downloaded automatically.
- Fabric.js was updated from 5.3.0 to 7.4.0. The distributed file, version test,
  SHA-256, source, MIT notice, and real canvas interaction were all checked.
- First-party templates and examples use generic product, detail-page, campaign,
  content-cover, model, and storage language. The source/file-name scan found no
  identified private brand or marketplace names.
- Added public privacy, acceptable-use, and ownership/provenance records. Human
  ownership, trademark, advertising, and jurisdiction-specific legal review
  remain explicit release sign-off items.

## Real-browser verification

The application was started from an isolated temporary runtime on loopback ports
`6273` and `6288`. Test accounts and runtime data were not written into the
repository.

Employee workspace:

- logged in through the real interface;
- added a rectangle to the canvas using the bundled Fabric.js 7.4.0 runtime;
- saved two browser-local model names, observed the first becoming active, then
  selected the second and confirmed the generation summary changed with it;
- checked Portuguese, German, Russian, and Arabic at `1280 × 720` and
  `700 × 900`;
- no document overflow or target-control overflow was found; Arabic used RTL.

Administrator workspace:

- logged in through the real interface;
- confirmed the update form exposes the required SHA-256 input;
- checked Portuguese, German, Russian, and Arabic at `1280 × 720` and
  `700 × 900`;
- no document overflow was found; Arabic used RTL.

The temporary test runtime was stopped and moved out of the working repository
after verification.

## Automated verification

Commands:

```text
node --check server.js
node --check admin-server.js
node --check account-store.js
node --check secret-store.js
node --check maintenance-agent.js
node --check public/src/canvas-assets.js
node --check admin-public/app.js
node --test tests/*.test.mjs
```

Result:

- JavaScript syntax checks passed.
- `89/89` automated tests passed.
- Encryption tests verified that plaintext configuration and user API keys are
  absent from persisted files and decrypt correctly.
- Account-store tests verified deletion of user sessions and per-user usage.
- Vendored-library tests verified Fabric.js 7.4.0 and SheetJS CE 0.20.3 hashes.
- `git diff --check` passed.
- sensitive-token, private-key, private-brand, marketplace-name, removed
  workflow, and matching file-name scans returned no release-blocking match.

## Limits and manual sign-off

- No real external storage credentials were used. Remote deletion is covered by
  the queue implementation and regression checks, but each supported storage
  service must be integration-tested by the operator before production use.
- Automated scans cannot prove authorship or trademark clearance. The unchecked
  human sign-off items in `OWNERSHIP_PROVENANCE.md` and
  `OPEN_SOURCE_RELEASE_CHECKLIST.md` still block a final public release claim.
- This work does not publish, push, tag, or create a GitHub release.

## Isolation evidence

- Open-source preview base commit: `c6e8d780f3c4215b33864b8b4b1bb428ff14e1c9`
- Original private checkout remained at:
  `389b6d19c667e3b8c1fd345aaa15ab8940050588`
- The original checkout already contained unrelated local work; none of those
  files were edited as part of this verification.
