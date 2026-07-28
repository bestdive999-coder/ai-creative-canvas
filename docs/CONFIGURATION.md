# Configuration reference

## Local service

Start the employee service with `npm start` and the administrator service with `npm run admin`.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5173` | Employee service port |
| `ADMIN_PORT` | `5188` | Administrator service port |
| `ECOM_EMPLOYEE_HOST` | `127.0.0.1` | Employee bind address |
| `ECOM_ADMIN_HOST` | `127.0.0.1` | Admin bind address |
| `ECOM_CONFIG_SECRET_KEY` | local key file | Optional 32-byte Base64/hex encryption key |
| `ECOM_COOKIE_SECURE` | `0` | Add `Secure` to cookies when served through HTTPS |
| `ECOM_TRUST_PROXY` | `0` | Trust `X-Forwarded-Proto`; enable only behind a controlled proxy |
| `ECOM_ALLOW_REMOTE_UPDATE` | `0` | Permit HTTPS update URL input; SHA-256 remains mandatory |
| `ECOM_ALLOW_REMOTE_RUNTIME_DOWNLOAD` | `0` | Permit verified HTTPS Python runtime download |
| `ECOMMERCE_CANVAS_APP_ROOT` | application directory | Override the application root when packaging |
| `MAX_IMAGE_UPLOAD_MB` | `64` | 1–128 MB |
| `MAX_JSON_BODY_MB` | `128` | 2–512 MB |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | 1–12 concurrent image jobs |
| `AI_IMAGE_MAX_ACTIVE_JOBS` | `50` | 8–500 active jobs |
| `AI_IMAGE_MAX_ACTIVE_JOBS_PER_USER` | `8` | Per-user active-job cap |

## AI endpoints

Configure these through the administrator workspace or a protected runtime environment:

- `PRIMARY_IMAGE_API_BASE_URL`
- `PRIMARY_IMAGE_MODEL`
- `PRIMARY_IMAGE_EDIT_MODEL`
- `PRIMARY_REASONING_MODEL`
- `PRIMARY_DEEP_REASONING_MODEL`
- `SECONDARY_IMAGE_API_BASE_URL`
- `SECONDARY_IMAGE_MODEL`

The employee browser may choose a model name for a request, but it never receives the configured API keys. The server bounds the model override and sends it only to the selected compatible endpoint.

## Object storage and cloud backup

The administrator config contains two separate switches:

- `ai.objectStorage` — enables the generic S3-compatible image/object storage path.
- `ai.cloudSync` — enables optional local-data backup using the same bucket and credentials.

Example shape:

```json
{
  "ai": {
    "objectStorage": {
      "enabled": true,
      "endpoint": "https://storage.example.invalid",
      "region": "auto",
      "bucket": "private-assets",
      "accessKeyId": "replace-me",
      "secretAccessKey": "replace-me",
      "pathPrefix": "images",
      "expiresSeconds": 3600,
      "forcePathStyle": true
    },
    "cloudSync": {
      "enabled": true,
      "includeProjects": true,
      "includeConversations": true,
      "includeAssets": true,
      "pathPrefix": "backups",
      "timeoutSeconds": 45
    }
  }
}
```

Use a bucket policy that grants only the required application prefix. Never commit this JSON with real credentials.

## Secret storage

API keys, remote-storage tokens, object-storage secret keys, and per-user AI keys
are encrypted at rest with AES-256-GCM. Without `ECOM_CONFIG_SECRET_KEY`, the
application creates `runtime/intranet/secret-key.bin`. Treat this key as a
credential: restrict file access, include it in encrypted backups, and never
publish it. Losing the key makes encrypted configuration unrecoverable.

## Listener and TLS guidance

Source-mode starts bind to loopback by default. The Windows appliance launcher
explicitly binds both workspaces to the LAN. Complete the first administrator
setup from the appliance itself, then place any non-loopback deployment behind
network access controls. For access outside a trusted LAN, use an HTTPS reverse
proxy, set `ECOM_COOKIE_SECURE=1`, and do not expose the maintenance agent.

## Verified updates

Local and remote update packages require a 64-character SHA-256. Obtain that
digest separately from a trusted signed release page. URL-based updates accept
HTTPS only and are disabled unless `ECOM_ALLOW_REMOTE_UPDATE=1`; uploading a
local ZIP is the safer default.
