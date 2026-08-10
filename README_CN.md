# Image CLI

`image` 是一个面向 Agent 的本地图片生成 CLI。它把统一的
OpenAI-compatible 图片生成请求路由到不同 provider，保存输出文件，并打印紧凑的结果。

发布版 runtime 不依赖第三方运行时库；运行时使用 Node 内置库和 `curl` 作为 HTTP 边界。

内置 provider：

- OpenAI
- OpenRouter
- Gemini
- Seedream
- Qwen
- MiniMax

也支持安装在 `~/.image/plugins/` 下的自定义 provider。

## 安装

```bash
npm install -g @cp7553479/image-cli
```

验证：

```bash
image --help
image generate --help
image config --help
image provider --help
```

## 快速开始

```bash
image config init
image config doctor --json
image provider list
image provider openai model list
image generate "A cinematic fox poster in snowfall" --model openai/gpt-image-1.5
```

如果省略 `--model`，CLI 会使用 `config.defaultModel`。

## 生成图片

```bash
image generate "<prompt>" [flags]
```

支持的 flags：

- `--model <provider/model>`
- `--size <auto|WIDTHxHEIGHT>`
- `--n <count>`
- `--quality <value>`
- `--background <auto|opaque|transparent>`
- `--output-format <png|jpeg|webp>`
- `--output-compression <0-100>`
- `--moderation <auto|low>`
- `--response-format <url|b64_json>`
- `--stream`
- `--partial-images <count>`
- `--style <vivid|natural>`
- `--user <id>`
- `--reference-image <path|url>`（可重复；启用图生图 / 编辑）
- `--mask <path|url>`（透明区域为可编辑区域）
- `--input-fidelity <low|high>`（gpt-image 对参考图的保真度）
- `--extra <json object>`
- `--output-dir <path>`
- `--json`

`--reference-image` 启用图生图。可多次传入融合多张参考图。各 provider 会
把参考图适配为自家原生 API；具体是否支持仍以远端返回为准。下载的参考图
缓存到 `~/.image/.temp/`。

`--extra` 用于传递 OpenAI-compatible 字段之外的 provider 私有参数。它必须是
JSON object，且不能覆盖 `model`、`prompt`、`size`、`n`、`output_format`
等标准字段。

CLI 只校验公共请求形状。具体 provider 是否支持某个参数，以远端 provider
返回为准。

示例：

```bash
image generate "Editorial portrait with dramatic rim light" \
  --model openai/gpt-image-1.5 \
  --size 1536x1024 \
  --n 1 \
  --quality high \
  --output-format png \
  --response-format b64_json
```

图生图示例：

```bash
image generate "add a knitted hat" \
  --model openai/gpt-image-1.5 \
  --reference-image ./portrait.png \
  --mask ./mask.png \
  --input-fidelity high
```

`--model` 使用 `provider/modelid`。`provider` 用于本地路由，`modelid` 原样传给 provider。

## 输出

默认成功输出保持简短：

```text
/absolute/path/to/image-1.png
manifest: /absolute/path/to/manifest.json
warning: optional warning text
```

使用 `--json` 可打印完整 manifest。provider 返回 usage 时，manifest 会规范化为
OpenAI 风格字段：`input_tokens`、`output_tokens`、`total_tokens`、
`input_tokens_details`、`output_tokens_details`。

## 配置

```bash
image config init
image config path
image config show --json
image config doctor --json
image config providers --json
```

`~/.image/config.json` 包含：

- 顶层 `defaultModel`
- provider 开关
- provider base URL
- 超时时间
- 有序 `api_key`

不要把密钥写入 tracked 文件。

## Provider Discovery

```bash
image provider list
image provider list --json
image provider openai model list
image provider openai model list --json --limit 20
```

如果内置集成支持 provider API，model list 会优先访问 API。否则会打印英文 warning，
说明内置 model id 可能不完整或不是最新。

## 公共行为来源

`SPEC.md` 是公共行为契约。任何生产行为变更都需要同步 source、tests、docs、help 和
内置 `image-cli` skill。
