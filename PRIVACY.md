# Privacy and data deletion

AI Creative Canvas is self-hosted software. The person or organization operating
an installation is the data controller and must provide the notices, legal basis,
retention periods, and user-request process required in its jurisdiction.

## Data processed

- Account identifiers, display name, role, group, password hash, sessions, quota,
  and usage totals.
- User prompts, conversations, canvas projects, uploaded/reference assets,
  generated images, feedback, and failure diagnostics.
- Administrator-supplied AI and storage configuration.
- Browser-local language preference and user-entered model-name list.

Local server data is stored below `runtime/`. AI requests and optional cloud
copies are sent only to endpoints configured by the operator. Review those
services' privacy and retention terms before enabling them.

## Security and retention

Service credentials and per-user AI keys are encrypted at rest. Passwords are
stored as salted scrypt hashes. Runtime access, backups, log retention, and host
encryption remain operator responsibilities. Keep only the data needed for the
declared purpose and document a retention schedule before inviting users.

## Account deletion

Deleting an account in the administrator workspace removes:

- account sessions and user-specific usage records;
- local conversations, canvas projects, canvas assets, and background-removal work;
- user feedback and associated reference files;
- generated-image gallery records and local gallery files.

The operation writes a record in `runtime/data-deletion/`. If optional cloud sync
or remote image storage is configured, the employee service then deletes that
user's configured cloud prefix and known remote image objects. Failed remote
cleanup remains pending with an error for operator follow-up. Do not remove cloud
credentials before pending deletion records are complete.

Backups and external AI providers are outside this automated path. Operators must
apply their documented expiry/deletion process to those copies separately.

## User requests

Users should contact the operator of their installation—not the upstream
maintainer—for access, correction, export, restriction, objection, or deletion.
Do not place personal data or credentials in a public GitHub issue.
