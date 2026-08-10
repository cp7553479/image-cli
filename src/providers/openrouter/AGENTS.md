This module owns OpenRouter image-generation mapping.

- Use OpenRouter's official image-generation flow through `/api/v1/chat/completions`.
- Reference images (image-to-image) switch `messages[0].content` from a plain
  string to a multimodal array `[{type:"text",text}, {type:"image_url",
  image_url:{url: dataURL}}, ...]`. Without reference images the content stays
  a plain string for compatibility.
- Keep provider-specific request details here, including `modalities` and `image_config`.
- Test request building, multimodal input mapping, response parsing, and failure classification.

## Official docs
- https://openrouter.ai/docs/quickstart  
  Purpose: API overview and base request lifecycle.
- https://openrouter.ai/docs/features/multimodal/images  
  Purpose: image generation and multimodal schema details.
- https://openrouter.ai/docs/api-reference/authentication and https://openrouter.ai/docs/api-reference/errors  
  Purpose: authentication and error handling.
