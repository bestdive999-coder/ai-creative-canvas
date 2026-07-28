# Contributing

感谢你关注 AI Creative Canvas。这个仓库目前是本机/内网开源预览，欢迎提交小而明确的改进。

## 提交前

- 使用 Node.js 24 或更高版本。
- 运行 `npm test`，确保全部测试通过。
- 运行 `npm run check:fonts`，确认没有字体文件进入发布源代码。
- 不要提交 `runtime/`、`.env`、API Key、对象存储密钥、会话、客户资料或生成结果。
- 如果改变用户可见行为，请同步更新 `README.md`、相关 `docs/` 和受影响的翻译 README。

## Pull Request 建议

1. 一个 PR 只解决一个主题。
2. 描述问题、改动范围、验证命令和已知限制。
3. 新增安全边界、存储路径或配置字段时，同时补充测试。
4. 不要在 PR 中上传真实账号、密钥、私人模板或未授权字体/图片。

## 文档与翻译

英文 `README.md` 是规范版本。十种语言的入口和同步规则见 [Localization guide](./docs/LOCALIZATION.md)。翻译应保留命令、环境变量、JSON 键、路径和许可证名称不变。

## 行为准则

请保持专业、尊重和可复现的讨论。安全问题请按 [SECURITY.md](./SECURITY.md) 的方式私下报告，不要在公开 Issue 中粘贴凭据或敏感数据。
