# Docker deployment

## Start

```bash
docker compose up --build
```

Open the employee workspace at <http://127.0.0.1:5173> and the administrator workspace at <http://127.0.0.1:5188>. The image starts both Node.js services in one container so the administrator health checks can reach the employee service on loopback.

## Persistence

The Compose file mounts the named volume `canvas-runtime` at `/app/runtime`. Back up that volume before upgrades. It contains accounts, projects, conversations, local assets, encrypted service settings, and the local encryption key.

To use an encrypted key supplied by your deployment platform, set `ECOM_CONFIG_SECRET_KEY` through a protected secret mechanism. Do not put it directly in `docker-compose.yml` or commit it to Git.

## Network exposure

The container listens on all container interfaces so the host can publish ports 5173 and 5188. Restrict those published ports with host firewall rules or a trusted private network. For access outside that boundary:

1. Place both workspaces behind an HTTPS reverse proxy.
2. Set `ECOM_COOKIE_SECURE=1`.
3. Keep the administrator workspace on a more restricted route.
4. Do not expose the maintenance agent.
5. Review upload limits, quotas, backups, logs, and retention before inviting users.

## Upgrade

```bash
docker compose down
docker compose build --pull
docker compose up -d
```

Back up the runtime volume first and read the release notes for migration or compatibility changes.
