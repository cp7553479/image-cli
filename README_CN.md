# `@cp7553479/image-cli`

`image` 是一个本地多厂商生图 CLI。

它统一了：

- 命令入口
- 配置结构
- provider 路由
- 输出保存
- 通过 `--extra` 透传厂商私有参数

内置 provider：

- OpenAI
- OpenRouter
- Gemini
- Seedream
- Qwen
- MiniMax

同时支持安装到 `~/.image/plugins/` 下的自定义 provider 插件。

## 安装

```bash
npm install -g @cp7553479/image-cli
```

验证命令：

```bash
image --help
image generate --help
image config --help
```

## 快速开始

1. 初始化本地配置：

```bash
image config init
```

2. 打开 [`~/.image/config.json`](/Users/vincent/.image/config.json)。

3. 设置顶层 `defaultModel`，格式必须是 `provider/modelid`。

4. 给你要使用的 provider 填写 `api_key`。

5. 诊断配置：

```bash
image config doctor --json
```

6. 开始生成：

```bash
image generate "雪中电影感狐狸海报"
```

如果不传 `--model`，CLI 会使用 `config.defaultModel`。

## 命令说明

### `image`

根命令。

它暴露的子命令有：

- `image generate <prompt>`
- `image config init`
- `image config path`
- `image config show`
- `image config doctor`
- `image config providers`

根帮助只做精简说明。
完整参数解释请看：

- `image generate --help`
- `image config --help`

### `image generate`

用法：

```bash
image generate "<prompt>" [flags]
```

参数：

- `<prompt>`
  必填。
  生图提示词。

Flags：

- `--model <provider/model>`
  可选。
  如果未提供，则回退到 `config.defaultModel`。
  用来显式指定 provider 和 provider 原生 model id。

- `--size <preset|WIDTHxHEIGHT>`
  可选。
  统一尺寸输入。
  支持预设：
  - `2k`
  - `4k`
  也支持显式尺寸，例如：
  - `1536x1024`

- `--aspect <ratio>`
  可选。
  统一宽高比。
  支持：
  - `1:1`
  - `4:3`
  - `3:4`
  - `16:9`
  - `9:16`
  - `3:2`
  - `2:3`
  - `21:9`

- `--n <count>`
  可选。
  请求输出数量。
  真实是否生效取决于 provider。

- `--image <pathOrUrl>`
  可选，可重复。
  参考图输入。
  可以是：
  - 本地文件路径
  - HTTP/HTTPS URL

- `--quality <value>`
  可选。
  厂商原生质量参数。

- `--format <png|jpeg|webp>`
  可选。
  期望输出格式。
  若厂商不支持，则以厂商返回为准。

- `--background <auto|opaque|transparent>`
  可选。
  厂商原生背景模式。

- `--seed <integer>`
  可选。
  provider 支持时可用于稳定复现。

- `--stream`
  可选。
  provider 支持时启用流式返回。

- `--output-dir <path>`
  可选。
  指定输出目录。
  默认：

  ```text
  ./image-output/<timestamp>/
  ```

- `--json`
  可选。
  输出 JSON manifest，而不是纯文本摘要。

- `--extra <json>`
  可选。
  透传给 provider 的私有 JSON 参数。

### `--extra`

用于承载非统一协议参数。

例如：

```bash
--extra '{"watermark":false}'
--extra '{"response_format":"base64"}'
--extra '{"prompt_optimizer":true}'
```

规则：

- 必须是 JSON object
- 不能覆盖统一协议字段，例如 `prompt`、`model`、`size`、`images`、`seed`
- 某个能力不是所有 provider 都支持时，优先放进 `--extra`

## `negative_prompt` 是不是统一参数？

不是。

它不应该被当作统一 CLI 顶层参数，因为官方支持不一致。

根据官方文档：

- OpenAI Images API：没有官方 `negative_prompt`
  - [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- Gemini 原生图片生成：没有官方 `negative_prompt`
  - [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- Seedream / Ark：没有统一的官方 `negative_prompt`
  - [Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
- MiniMax：没有官方 `negative_prompt`
  - [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
- Qwen Image：官方明确支持 `negative_prompt`
  - [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  - [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- OpenRouter：统一聊天路由下不保证 `negative_prompt` 是稳定顶层字段
  - [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

所以现在的策略是：

- 不作为统一 CLI 顶层参数暴露
- 如果某个厂商官方支持，就通过 `--extra` 传

Qwen 示例：

```bash
image generate "干净的饮品海报" \
  --model qwen/qwen-image-2.0-pro \
  --extra '{"negative_prompt":"low quality, blurry, distorted text"}'
```

## `image config`

### `image config init`

初始化 `~/.image/`。

行为：

- `config.json` 不存在时创建
- `config.example.jsonc` 不存在时创建
- 每次都会刷新 `README.md`
- 默认不会覆盖已有 `config.json`
- 默认不会覆盖已有 `config.example.jsonc`

Flags：

- `--force`
  强制覆盖 `~/.image/config.json` 和 `~/.image/config.example.jsonc`

### `image config path`

打印 CLI 使用的配置路径。

无参数。

### `image config show`

打印脱敏后的解析结果。

Flags：

- `--json`
  JSON 输出

你能看到：

- 顶层 `defaultModel`
- provider 是否启用
- base URL
- timeout / retry 配置
- `api_key` 是否存在

你看不到：

- 原始 secret

### `image config doctor`

做配置体检。

Flags：

- `--json`
  JSON 输出

检查内容包括：

- 配置文件是否存在
- README 是否存在
- `curl` 是否可用
- 每个 provider 的 credential 数量

### `image config providers`

列出内置 provider 和已安装插件 provider。

Flags：

- `--json`
  JSON 输出

## 配置结构

CLI 使用：

- [`~/.image/config.json`](/Users/vincent/.image/config.json)
- [`~/.image/config.example.jsonc`](/Users/vincent/.image/config.example.jsonc)
- [`~/.image/README.md`](/Users/vincent/.image/README.md)
- `~/.image/plugins/<plugin-name>/plugin.json`

## `config.json`

顶层结构：

```json
{
  "version": 1,
  "defaultModel": "openai/gpt-image-1.5",
  "providers": {
    "openai": {
      "enabled": true,
      "apiBaseUrl": "https://api.openai.com/v1",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_OPENAI_API_KEY"]
    }
  }
}
```

### 顶层字段

- `version`
  配置版本号。

- `defaultModel`
  默认路由目标，格式为 `provider/modelid`。
  当 `--model` 省略时使用。

- `providers`
  provider 配置表。
  支持内置 provider 和插件 provider。

### 每个 provider 的字段

- `enabled`
- `apiBaseUrl`
- `timeoutMs`
- `retryPolicy.maxAttempts`
- `api_key`

### `api_key`

支持单字符串：

```json
"api_key": "your-api-key"
```

也支持有序数组：

```json
"api_key": ["your-api-key-1", "your-api-key-2"]
```

如果是数组，CLI 会按顺序做同 provider failover。

## 内置 Provider 默认值

模板默认：

- `defaultModel`: `openai/gpt-image-1.5`
- `openai`: `https://api.openai.com/v1`
- `openrouter`: `https://openrouter.ai/api/v1`
- `gemini`: `https://generativelanguage.googleapis.com/v1beta`
- `seedream`: `https://ark.cn-beijing.volces.com/api/v3`
- `qwen`: `https://dashscope.aliyuncs.com/api/v1`
- `minimax`: `https://api.minimax.io/v1`

Seedream 特别说明：

- 你的 Ark 账号/模型可用性不同，可能需要使用带版本号的 model id，例如 `doubao-seedream-4-5-251128`

## Provider 文档与 API 申请入口

### OpenAI

- Provider id: `openai`
- Alias: `chatgpt-image`
- 文档: [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- 模型文档: [GPT Image 1.5](https://platform.openai.com/docs/models/gpt-image-1.5)
- API Keys: [OpenAI API Keys](https://platform.openai.com/api-keys)
- 注册: [OpenAI Platform Signup](https://platform.openai.com/signup)

### OpenRouter

- Provider id: `openrouter`
- Alias: `openrouter-image`
- 文档: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- API 参考: [OpenRouter API Reference](https://openrouter.ai/docs/api-reference/overview)
- API Keys: [OpenRouter Keys](https://openrouter.ai/settings/keys)
- 登录/注册: [OpenRouter Sign In](https://openrouter.ai/sign-in)

### Gemini

- Provider id: `gemini`
- Alias: `nano-banana`
- 文档: [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- API Key 文档: [Gemini API Key Guide](https://ai.google.dev/gemini-api/docs/api-key)
- API Keys: [Google AI Studio API Keys](https://aistudio.google.com/apikey)
- API 参考: [Gemini API Reference](https://ai.google.dev/api)

### Seedream

- Provider id: `seedream`
- Alias: `doubao-seedream`
- 文档:
  - [Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
  - [Ark Quick Start](https://www.volcengine.com/docs/82379/1399008?lang=zh)
- 控制台: [Volcengine Ark Console](https://console.volcengine.com/ark)
- API Key 指引: [Volcengine Ark API Key Guide](https://www.volcengine.com/docs/6559/2310296)

### Qwen

- Provider id: `qwen`
- Alias: `qwen-image`
- 文档:
  - [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  - [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- 模型列表: [Alibaba Model Studio Models](https://help.aliyun.com/zh/model-studio/model)
- 控制台: [Alibaba Model Studio](https://bailian.console.aliyun.com/)

### MiniMax

- Provider id: `minimax`
- Alias: `minimax-image`
- 文档:
  - [MiniMax Image Generation Overview](https://platform.minimax.io/docs/api-reference/image-generation-intro)
  - [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
  - [MiniMax Image Generation Guide](https://platform.minimax.io/docs/guides/image-generation)
- 控制台: [MiniMax Platform](https://platform.minimax.io/)

## 自定义 Provider 插件

自定义 provider 安装目录：

```text
~/.image/plugins/<plugin-name>/
```

插件注册表：

```text
~/.image/plugins/<plugin-name>/plugin.json
```

插件 provider 的路由方式和内置 provider 一样：

- `config.defaultModel`
- `image generate --model <provider/model>`
- `config.providers.<providerId>`

完整插件接口、脚本入参与出参规范、manifest 字段说明、开发指南请看：

- [plugins/PLUGINS_README.md](plugins/PLUGINS_README.md)

## 开发

```bash
npm install
npm run check
npm test
npm run build
```
