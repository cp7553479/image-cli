This module owns Bailian (阿里云百炼 / DashScope MaaS) sync and async image generation flows.

- Base URL is workspace-specific: `https://{workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`.
  `image config init` prompts for the workspaceId. A shared
  `https://dashscope.aliyuncs.com/api/v1` is kept only as a code-level fallback
  when config omits `apiBaseUrl`.
- Support both sync and async generate paths behind one plugin contract.
- Polling logic must stay testable and deterministic.
- Reference images (image-to-image) are appended to the sync multimodal
  `input.messages[0].content` array as `{image: dataURL}` entries after the
  text entry. The async `image-synthesis` path has no native reference-image
  field; requests are still sent and support is decided by the response.
- Test sync mapping, async task flow, and provider-specific extras.

## Official docs
- https://help.aliyun.com/zh/model-studio/qwen-image-api  
  Purpose: API overview and image generation capabilities.
- https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference  
  Purpose: image generation request schema / response schema / auth.
- https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference  
  Purpose: workspace-specific domain (MaaS) endpoint notes.
