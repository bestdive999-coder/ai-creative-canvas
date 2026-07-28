# Preview 20 verification: data governance hardening

Date: 2026-07-28  
Version: `0.1.0-preview.20`  
Scope: `ecommerce-ai-worker-canvas-open-source-preview` only

## Changes verified

- Account deletion now creates a durable request before changing or removing the
  account. Local cleanup and account removal are recorded as separate stages.
  Failures leave the account disabled and the request available for automatic
  retry.
- Employee sessions show a localized data and AI notice. It discloses automatic
  failure logging, local/cloud storage behavior, configured retention periods,
  and the operator contact.
- Administrators can configure the operator contact, automatic cleanup switch,
  retention days for failures, feedback, conversations, canvas projects,
  unused assets and generated images, plus the cleanup interval.
- The employee service runs retention cleanup at startup and on the configured
  interval. Cleanup covers the associated local assets and queues configured
  cloud-object deletion.

## Real-browser verification

The employee and administrator services were started with an isolated temporary
runtime on loopback ports `6273` and `6288`. Test accounts, settings and content
were not written into the repository.

Employee workspace:

- logged in through the real employee interface;
- confirmed the one-time notice and the persistent reopen button;
- confirmed the notice displayed the configured operator contact and every
  configured retention period;
- tested Portuguese, German, Russian and Arabic at `390 × 844`;
- found no CJK fallback text, horizontal document overflow, notice overflow, or
  overlap between the notice button and the composer purpose text;
- confirmed Arabic used RTL and every notice remained inside the viewport.

Administrator workspace:

- logged in through the real administrator interface;
- opened system settings and confirmed every retention field was present;
- changed the operator contact and automatic-failure retention period, saved
  them, and read both values back from the authenticated configuration API;
- tested Portuguese, German, Russian and Arabic at `700 × 900`;
- found no CJK fallback text, horizontal document overflow, or control outside
  the viewport; Arabic used RTL.

## Account deletion acceptance

A temporary employee account saved a real conversation through the employee
API. An administrator then requested account deletion through the administrator
API.

Observed result:

- the API returned `accountDeleted: true`;
- the durable deletion request reached `pending-cloud-cleanup`;
- local conversation cleanup was recorded as successful;
- the conversation file was absent after deletion;
- the employee was absent from the administrator account list;
- the old employee session returned HTTP `401`;
- the durable request retained the account identifier, local cleanup result,
  account-removal timestamp and an empty last-error field.

The pending cloud stage is intentional: it keeps remote cleanup retryable when
cloud storage is configured. This isolated test did not contain real cloud
credentials.

## Automated verification

Commands:

```text
node --check data-governance.js
node --check server.js
node --check admin-server.js
node --check admin-public/app.js
node --check admin-public/i18n.js
node --check public/app.js
node --check public/src/app-state.js
node --check public/src/auth.js
node --check public/src/i18n.js
node --test tests/*.test.mjs
git diff --check
```

Result:

- JavaScript syntax checks passed.
- `91/91` automated tests passed.
- Regression checks cover durable deletion-request creation, atomic updates,
  privacy configuration normalization, retention bounds and release wiring.
- `git diff --check` passed.

## Limits and release status

- No real external storage credentials were used. Each configured storage
  service still requires operator integration testing before production use.
- Human ownership, trademark, advertising and jurisdiction-specific legal
  review remain the unchecked release sign-off item.
- This work does not publish, push, tag, commit, or create a GitHub release.

## Isolation evidence

- Open-source preview base commit:
  `c6e8d780f3c4215b33864b8b4b1bb428ff14e1c9`
- Original private checkout remained at:
  `389b6d19c667e3b8c1fd345aaa15ab8940050588`
- The original checkout already contained unrelated local work; none of those
  files were edited as part of this verification.
