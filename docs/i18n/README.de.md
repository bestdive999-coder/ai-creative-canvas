# AI Creative Canvas

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Português](./README.pt-BR.md) · [Français](./README.fr.md) · Deutsch · [Русский](./README.ru.md) · [العربية](./README.ar.md)

AI Creative Canvas ist ein Open-Source-Arbeitsbereich mit lokalem Schwerpunkt für KI-Bildgenerierung, Produkt-Assets, Detailseiten und Arbeiten auf einer unendlichen Zeichenfläche.

## Funktionen

- Prompt-basierte Generierung, Referenzbilder, Bildfortsetzung, Prompt-Kopie und Aufgabenverlauf.
- Unendliche Zeichenfläche mit Frames, Text, Formen, Ebenen, Zoom, Verschieben und Projektspeicherung.
- Tabellenbasierte Planung von Detailseiten und Komposition mehrerer Screens.
- Lokale Konten, Sitzungen, Nutzung, Feedback und Benutzerlimits.
- Benutzer können eine lokale Modellliste führen; Endpunkte und Schlüssel bleiben unter Administratorkontrolle.
- Gespräche, Projekte und Assets werden standardmäßig in `runtime/` gespeichert.
- Optionales Backup in S3-kompatiblen Objektspeicher.

## Schnellstart

Node.js 24 oder neuer wird benötigt.

```bash
npm install
npm start
```

Arbeitsbereich: <http://127.0.0.1:5173>

Administrationsbereich:

```bash
npm run admin
```

Administration: <http://127.0.0.1:5188>. Beim ersten Start wird ein Administratorkennwort festgelegt; es gibt kein Standardkennwort.

## Wichtige Parameter

| Variable | Standard | Zweck |
| --- | ---: | --- |
| `PORT` | `5173` | Port des Arbeitsbereichs |
| `ADMIN_PORT` | `5188` | Port der Administration |
| `MAX_IMAGE_UPLOAD_MB` | `64` | Maximale Bildgröße |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | Parallelität der Bildaufgaben |

Siehe [Konfigurationsreferenz](../CONFIGURATION.md) und [Anwendungsfälle](../CASES.md).

## Grenzen

Dies ist eine technische Vorschau für lokale oder private Netzwerke, kein Multi-Tenant-SaaS. Lokaler Speicher bleibt die Primärquelle; die Cloud ist nur ein optionales Backup. Cloud-Wiederherstellung und Konfliktauflösung sind im Mitarbeiterbereich noch nicht verfügbar.

## Lizenz

[Apache License 2.0](../../LICENSE). Hinweise zu Drittanbieter-Komponenten stehen in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
