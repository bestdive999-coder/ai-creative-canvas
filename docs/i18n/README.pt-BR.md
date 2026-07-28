# AI Creative Canvas

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · Português · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Русский](./README.ru.md) · [العربية](./README.ar.md)

AI Creative Canvas é um espaço de trabalho open source e local-first para geração de imagens com IA, gestão de ativos de produto, composição de páginas de detalhe e edição em canvas infinito.

## Principais recursos

- Geração por prompt, imagens de referência, continuação de imagens, cópia de prompts e histórico de tarefas.
- Canvas infinito com quadros, texto, formas, camadas, zoom, panorâmica e salvamento de projetos.
- Planejamento de páginas de detalhe por planilha e composição de várias telas.
- Contas, sessões, uso, feedback e limites de tarefas por usuário armazenados localmente.
- Cada usuário pode manter uma lista local de modelos; endpoints e chaves continuam sob controle do administrador.
- Conversas, projetos e ativos são salvos por padrão em `runtime/`.
- Backup opcional em armazenamento compatível com S3.

## Início rápido

Requer Node.js 24 ou superior.

```bash
npm install
npm start
```

Área de trabalho: <http://127.0.0.1:5173>

Painel de administração:

```bash
npm run admin
```

Painel: <http://127.0.0.1:5188>. A senha de administrador é criada no primeiro início; não existe senha padrão.

## Parâmetros principais

| Variável | Padrão | Uso |
| --- | ---: | --- |
| `PORT` | `5173` | Porta do espaço de trabalho |
| `ADMIN_PORT` | `5188` | Porta do painel administrativo |
| `MAX_IMAGE_UPLOAD_MB` | `64` | Limite de upload de imagem |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | Concorrência de tarefas de imagem |

Veja a [referência de configuração](../CONFIGURATION.md) e os [casos de uso](../CASES.md).

## Limites

Esta é uma prévia técnica para implantação local ou em rede privada, não um SaaS multi-tenant. O armazenamento local é a fonte principal e a nuvem é apenas um backup opcional. A restauração pela nuvem e a resolução de conflitos ainda não estão disponíveis no espaço do funcionário.

## Licença

[Apache License 2.0](../../LICENSE). As atribuições de terceiros estão em [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
