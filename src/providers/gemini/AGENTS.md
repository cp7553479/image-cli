This module owns Gemini and Nano Banana aliases.

- Use native Gemini HTTP semantics, not OpenAI compatibility mode, unless explicitly needed by shared transport.
- Treat Nano Banana names as provider/model aliases only.
- Reference images (image-to-image) are appended to `contents[0].parts` as
  `{inlineData:{mimeType, data}}` objects alongside the text part. Gemini has
  no native mask concept; a supplied `mask` is forwarded as another inlineData
  part, and provider-specific support is decided by the response.
- Test native image generation mapping, inline image handling, and failure classification.

## Official docs
- https://ai.google.dev/gemini-api/docs  
  Purpose: API overview and core concepts.
- https://ai.google.dev/gemini-api/docs/image-generation  
  Purpose: image generation request schema / response schema.
- https://ai.google.dev/gemini-api/docs/api-key and https://ai.google.dev/gemini-api/docs/troubleshooting  
  Purpose: authentication and error troubleshooting.
