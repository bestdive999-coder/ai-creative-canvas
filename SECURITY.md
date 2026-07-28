# Security policy

## Supported version

Security fixes are applied to the latest preview branch only. Older exported
archives are not supported after a newer preview is published.

## Reporting a vulnerability

Use a private GitHub Security Advisory for the repository whenever possible.
If that channel is unavailable, open an issue containing no exploit, secret, or
personal data and ask the maintainer for a private contact route. Do not test
against systems or accounts you do not own.

Include the affected version, route/component, reproduction conditions, impact,
and a minimal proof. The maintainer should acknowledge a valid private report
within seven days and publish a fix before disclosing exploit details.

## Deployment baseline

- Employee and administrator services bind to loopback by default.
- First administrator setup must be completed from the host machine.
- Exposing either UI outside a trusted LAN requires HTTPS, access control, and
  `ECOM_COOKIE_SECURE=1`.
- Keep the maintenance agent on loopback only.
- Remote update downloads are disabled by default. Every update ZIP must match a
  separately obtained SHA-256 before extraction.
- Restrict `runtime/` and `runtime/intranet/secret-key.bin` to the service
  account. Back up the key together with encrypted configuration.
- Rotate AI and storage credentials after a suspected host compromise.

## Never publish

Do not commit or distribute:

- `runtime/` 中的账号、会话、配置、维护令牌和使用记录
- `.env`、API Key、访问令牌、对象存储密钥或远程服务令牌
- `templates/imported/` 中的客户模板或业务资料
- `fonts/` 中未经授权再分发的字体
- `output/`、`outputs/`、`tmp/` 中的用户输入和生成结果
- `app.dat`、`boot.cjs`、`start.ps1` 等设备部署文件

After a leak, revoke the affected credentials first, remove them from repository
history and release archives, then issue a replacement. Deleting one working-tree
file is not sufficient.
