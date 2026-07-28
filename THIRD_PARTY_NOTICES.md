# 第三方组件与归属说明

本项目采用 Apache License 2.0。第三方组件仍分别适用其原始许可证；
项目许可证不会替代或修改这些第三方条款。

## 随源码直接分发

### Fabric.js 7.4.0

- 用途：浏览器画布与对象交互
- 文件：`public/vendor/fabric.min.js`
- 分发来源：https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js
- 许可证来源：https://github.com/fabricjs/fabric.js/tree/v7.4.0
- 许可证：MIT
- 完整文本：`third_party_licenses/Fabric.js-7.4.0-LICENSE.txt`

### JSZip 3.10.1

- 用途：浏览器内 ZIP 读取
- 文件：`public/vendor/jszip.min.js`
- 上游：https://github.com/Stuk/jszip/tree/v3.10.1
- 许可证：本项目选择 MIT 选项使用
- 完整上游双许可证文本：`third_party_licenses/JSZip-3.10.1-LICENSE.md`

JSZip 的浏览器包包含 pako 1.0.5，pako 采用 MIT 许可证。完整文本见
`third_party_licenses/pako-1.0.5-LICENSE.txt`。原始 JSZip/pako 许可证头保留在分发文件中。

该浏览器包还嵌入 JSZip 的传递依赖：

- `lie` 3.3.0（MIT），完整文本见 `third_party_licenses/lie-3.3.0-LICENSE.txt`；
- `immediate` 3.0.5（MIT，由 `lie` 使用），完整文本见
  `third_party_licenses/immediate-3.0.5-LICENSE.txt`；
- `setimmediate` 1.0.5（MIT），完整文本见
  `third_party_licenses/setimmediate-1.0.5-LICENSE.txt`。

这些归属文本与 JSZip 浏览器包一并分发；上游来源分别为
https://github.com/calvinmetcalf/lie/tree/v3.3.0、
https://github.com/calvinmetcalf/immediate/tree/v3.0.5 和
https://github.com/YuzuJS/setImmediate/tree/1.0.5。

### SheetJS Community Edition 0.20.3

- 用途：读取 XLSX、XLS 和 CSV
- 文件：`public/vendor/xlsx.full.min.js`
- 官方分发源：https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- 许可证：Apache License 2.0
- 完整文本：`third_party_licenses/SheetJS-CE-0.20.3-LICENSE.txt`

SheetJS 官方要求的归属说明：

> SheetJS Community Edition -- https://sheetjs.com/  
> Copyright (C) 2012-present SheetJS LLC  
> Licensed under the Apache License, Version 2.0.

## 可选本地抠图运行时

以下组件不包含在源码 ZIP 中。只有用户执行 `scripts/prepare-rembg-runtime.ps1`
时才会安装到已被 Git 忽略的 `runtime/`：

- rembg：MIT，https://github.com/danielgatis/rembg
- ONNX Runtime：MIT，https://github.com/microsoft/onnxruntime
- Pillow：MIT-CMU，https://github.com/python-pillow/Pillow
- NumPy：BSD-3-Clause，https://github.com/numpy/numpy

`u2net` 模型不包含在源码 ZIP 中；可选安装脚本会从 rembg 配置的上游地址下载。
U-2-Net 上游代码采用 Apache License 2.0：
https://github.com/xuebinqin/U-2-Net

`isnet-general-use` 模型不包含在仓库中，也不会由开源版脚本自动下载。
其上游仓库未提供清晰的许可证文件；使用者必须自行确认模型权利并手动放入
`runtime/rembg-models/isnet-general-use.onnx` 后，才能启用“精细抠图”。

可选环境的直接依赖和传递依赖版本记录在 `requirements-rembg.lock`。发布带运行时
的安装包时，还应从实际环境导出并随包保留全部许可证文本。

## 外部服务

本项目只提供通用的文本服务、图片服务和远程图片存储配置，不预置或绑定任何供应商。
使用者应自行填写服务地址、模型名和密钥，并遵守所选服务的条款和数据处理规则。

## 文件来源与哈希

仓库内直接分发文件的版本、下载来源和 SHA-256 记录在
[`DEPENDENCIES.md`](DEPENDENCIES.md)。更新第三方文件时必须同步更新哈希、许可证
文本和回归测试。
