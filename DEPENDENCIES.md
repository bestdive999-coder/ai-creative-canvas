# 依赖清单与更新策略

## 仓库内直接分发

| 组件 | 版本 | 文件 | SHA-256 | 来源 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| Fabric.js | 7.4.0 | `public/vendor/fabric.min.js` | `d4e908b3b3654db92c08ff0f31aa6a72ba1ddeeeb43a93bc41c833e51fe37f58` | jsDelivr `fabric@7.4.0` | MIT |
| JSZip | 3.10.1 | `public/vendor/jszip.min.js` | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` | GitHub v3.10.1 | MIT 选项 |
| pako | 1.0.5 | 包含于 JSZip 浏览器包 | 由 JSZip 上游构建 | JSZip v3.10.1 lockfile | MIT |
| lie | 3.3.0 | 包含于 `public/vendor/jszip.min.js` | 由 JSZip 上游构建 | GitHub v3.3.0 | MIT |
| immediate | 3.0.5 | 包含于 `public/vendor/jszip.min.js`（由 lie 使用） | 由 JSZip 上游构建 | GitHub v3.0.5 | MIT |
| setimmediate | 1.0.5 | 包含于 `public/vendor/jszip.min.js` | 由 JSZip 上游构建 | GitHub 1.0.5 | MIT |
| SheetJS CE | 0.20.3 | `public/vendor/xlsx.full.min.js` | `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41` | SheetJS 官方 CDN | Apache-2.0 |

第三方许可证文本位于 `third_party_licenses/`，归属说明见
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## Node.js

应用运行时不依赖 npm 生产包，`package.json` 仅声明启动与测试命令。
要求 Node.js 24 或更高版本。

## 可选 Python 抠图环境

源码发行包不包含 Python、Python 包或模型。`scripts/prepare-rembg-runtime.ps1`
会把可选环境安装到 `runtime/`，该目录不会进入 Git 或源码 ZIP。

直接使用的包及全部传递依赖固定在 `requirements-rembg.lock`，并带有发布文件
SHA-256。安装脚本要求 Windows x64 Python 3.12，并使用
`pip --require-hashes --only-binary :all:`，不会在安装时自动升级到未审核版本。
更新依赖时先修改 `requirements-rembg.in`，重新生成锁文件并执行抠图回归测试。

开源版仅自动准备许可证来源明确的 `u2net` 模型。`isnet-general-use` 不会自动
下载，只有用户自行确认模型权利并手动提供文件后才可使用。

## 更新第三方文件

1. 只从上游版本标签或官方 CDN 下载。
2. 记录版本、来源 URL 和 SHA-256。
3. 保留上游许可证头并更新 `third_party_licenses/`。
4. 更新本文件与 `THIRD_PARTY_NOTICES.md`。
5. 运行 `node --test tests/*.test.mjs`。
6. 对表格库至少执行版本、哈希和 XLSX 往返读取测试。
