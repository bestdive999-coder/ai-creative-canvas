# AI Creative Canvas

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · Español · [Português](./README.pt-BR.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Русский](./README.ru.md) · [العربية](./README.ar.md)

AI Creative Canvas es un espacio de trabajo open source y local-first para generar imágenes con IA, gestionar recursos de producto, componer páginas de detalle y trabajar sobre un lienzo infinito.

## Funciones principales

- Generación con prompts, imágenes de referencia, continuación de imágenes, copia de prompts e historial de tareas.
- Lienzo infinito con marcos, texto, formas, capas, zoom, desplazamiento y guardado de proyectos.
- Planificación de páginas de detalle mediante hojas de cálculo y composición de varias pantallas.
- Cuentas, sesiones, consumo, comentarios y límites de tareas por usuario en local.
- Cada usuario puede mantener una lista local de modelos; el administrador controla endpoints y claves.
- Conversaciones, proyectos y recursos se guardan por defecto en `runtime/`.
- Copia de seguridad opcional en almacenamiento compatible con S3.

## Inicio rápido

Requiere Node.js 24 o posterior.

```bash
npm install
npm start
```

Espacio de trabajo: <http://127.0.0.1:5173>

Para iniciar el panel de administración:

```bash
npm run admin
```

Panel: <http://127.0.0.1:5188>. La contraseña de administrador se crea en el primer inicio; no existe una contraseña predeterminada.

## Parámetros principales

| Variable | Valor | Uso |
| --- | ---: | --- |
| `PORT` | `5173` | Puerto del espacio de trabajo |
| `ADMIN_PORT` | `5188` | Puerto de administración |
| `MAX_IMAGE_UPLOAD_MB` | `64` | Límite de subida de imágenes |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | Concurrencia de tareas de imagen |

Consulta la [referencia de configuración](../CONFIGURATION.md) y los [casos de uso](../CASES.md).

## Límites del producto

Es una vista previa técnica para despliegues locales o de red privada, no un SaaS multiinquilino. El almacenamiento local es la fuente principal; la nube solo es una copia opcional. Todavía no hay restauración desde la nube ni resolución de conflictos en la interfaz de empleado.

## Licencia

[Apache License 2.0](../../LICENSE). Las atribuciones de terceros están en [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
