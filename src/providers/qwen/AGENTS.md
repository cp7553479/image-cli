This module owns Qwen sync and async image generation flows.

- Support both sync and async generate paths behind one plugin contract.
- Polling logic must stay testable and deterministic.
- Test sync mapping, async task flow, and provider-specific extras.

## Official docs
- https://www.alibabacloud.com/help/en/model-studio/developer-reference/qwen-image-api  
  Purpose: API overview and image generation capabilities.
- https://www.alibabacloud.com/help/en/model-studio/developer-reference/synchronous-image-generation  
  Purpose: synchronous image generation request schema / response schema.
- https://www.alibabacloud.com/help/en/model-studio/developer-reference/asynchronous-image-generation and https://www.alibabacloud.com/help/en/model-studio/developer-reference/obtain-an-api-key  
  Purpose: asynchronous task interface and authentication.
