# AI Creative Canvas

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Português](./README.pt-BR.md) · Français · [Deutsch](./README.de.md) · [Русский](./README.ru.md) · [العربية](./README.ar.md)

AI Creative Canvas est un espace de travail open source et local-first pour la génération d’images par IA, la gestion d’actifs produit, la composition de pages produit et l’édition sur canevas infini.

## Fonctionnalités

- Génération par prompt, images de référence, continuation d’image, copie des prompts et historique des tâches.
- Canevas infini avec cadres, texte, formes, calques, zoom, déplacement et sauvegarde de projets.
- Planification de pages détaillées avec feuilles de calcul et composition multi-écrans.
- Comptes, sessions, consommation, retours et limites de tâches par utilisateur en local.
- Liste de modèles locale par utilisateur ; les endpoints et les clés restent administrés côté serveur.
- Conversations, projets et actifs enregistrés par défaut dans `runtime/`.
- Sauvegarde cloud facultative vers un stockage compatible S3.

## Démarrage rapide

Node.js 24 ou version ultérieure est requis.

```bash
npm install
npm start
```

Espace de travail : <http://127.0.0.1:5173>

Pour démarrer l’administration :

```bash
npm run admin
```

Administration : <http://127.0.0.1:5188>. Le mot de passe administrateur est créé au premier démarrage ; aucun mot de passe par défaut n’est fourni.

## Paramètres principaux

| Variable | Valeur | Usage |
| --- | ---: | --- |
| `PORT` | `5173` | Port de l’espace de travail |
| `ADMIN_PORT` | `5188` | Port d’administration |
| `MAX_IMAGE_UPLOAD_MB` | `64` | Limite d’import d’image |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | Concurrence des tâches image |

Voir la [référence de configuration](../CONFIGURATION.md) et les [cas d’usage](../CASES.md).

## Limites

Cette préversion technique vise un déploiement local ou sur réseau privé ; ce n’est pas un SaaS multi-tenant. Le stockage local reste la source principale et le cloud est une sauvegarde optionnelle. La restauration cloud et la résolution de conflits ne sont pas encore disponibles côté employé.

## Licence

[Apache License 2.0](../../LICENSE). Les notices des composants tiers sont dans [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
