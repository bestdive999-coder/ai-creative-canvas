# AI 创作画布

[English](../../README.md) · 简体中文 · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Português](./README.pt-BR.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Русский](./README.ru.md) · [العربية](./README.ar.md)

AI 创作画布是一个本地优先的开源工作区，用于 AI 生图、商品素材管理、详情页编排和无限画布迭代。

## 主要能力

- AI 生图、参考图、图片续改、提示词复制和任务历史。
- 无限画布、画板、文字、形状、图层、缩放和项目保存。
- 电子商品详情页的表格规划、多屏生成和长图编排。
- 本地账户、会话、用量、反馈和用户任务限制。
- 用户可维护浏览器本地图片模型列表；服务地址和密钥仍由管理员控制。
- 对话、项目和素材默认保存在本机 `runtime/`。
- 可选 S3 兼容云端副本；云端失败不阻断本机保存。

## 快速开始

需要 Node.js 24 或更高版本：

```bash
npm install
npm start
```

员工端：<http://127.0.0.1:5173>

另开终端启动管理端：

```bash
npm run admin
```

管理端：<http://127.0.0.1:5188>。首次启动需要自行设置管理员密码，项目不提供默认口令。

## 运行参数

| 参数 | 默认值 | 用途 |
| --- | ---: | --- |
| `PORT` | `5173` | 员工端端口 |
| `ADMIN_PORT` | `5188` | 管理端端口 |
| `MAX_IMAGE_UPLOAD_MB` | `64` | 单张图片上传上限 |
| `MAX_JSON_BODY_MB` | `128` | JSON 请求体上限 |
| `AI_IMAGE_MAX_CONCURRENCY` | `8` | 图片任务并发数 |
| `AI_IMAGE_MAX_ACTIVE_JOBS` | `50` | 全局活动任务上限 |

完整配置见 [配置参考](../CONFIGURATION.md)。

## 使用案例

- [商品主图](../CASES.md#case-1-product-main-image)
- [详情长图](../CASES.md#case-2-long-detail-page)
- [画布迭代与云端副本](../CASES.md#case-3-canvas-iteration-and-backup)

## 边界

这是面向本机或内网部署的技术预览，不是托管式多租户 SaaS。员工端继续从本机读取；云端只做可选备份，暂不提供员工端云端恢复和冲突合并。商业发布前必须人工检查文案、商品信息、商标和素材权利。

## 许可证

本项目采用 [Apache License 2.0](../../LICENSE)。第三方组件及其许可证见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。
