# Localization guide

The repository homepage is available in ten languages:

| Locale | File |
| --- | --- |
| English | `README.md` |
| 简体中文 | `docs/i18n/README.zh-CN.md` |
| 日本語 | `docs/i18n/README.ja.md` |
| 한국어 | `docs/i18n/README.ko.md` |
| Español | `docs/i18n/README.es.md` |
| Português (Brasil) | `docs/i18n/README.pt-BR.md` |
| Français | `docs/i18n/README.fr.md` |
| Deutsch | `docs/i18n/README.de.md` |
| Русский | `docs/i18n/README.ru.md` |
| العربية | `docs/i18n/README.ar.md` |

The translated introductions keep the same product boundaries and link to the canonical configuration, architecture, and cases documents. When behavior changes, update the English README first, then update all translations in the same pull request.

The employee workspace and administrator workspace also expose the same ten
runtime locales. Persistent labels use keyed dictionaries, while dynamic status,
toast, and administrator-module text use the bundled offline catalogs in
`public/src/text-translations.js` and
`admin-public/text-translations.js`. Runtime language switching does not call an
external translation service.

## Translation rules

- Keep endpoint names, environment variables, JSON keys, commands, and file paths unchanged.
- Do not translate license names, model IDs, MIME types, or HTTP status codes.
- Preserve user-entered names, prompts, configuration values, and textarea content exactly as entered.
- Do not add provider names, customer names, performance numbers, or commercial claims that are absent from the canonical documentation.
- Preserve the local-first boundary: local storage is primary; cloud storage is optional backup.
