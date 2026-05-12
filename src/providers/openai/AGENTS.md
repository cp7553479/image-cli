This module owns OpenAI request/response mapping.

- Map normalized generate fields to the OpenAI Images API only.
- Keep edit capability internal for v1; do not expose a public edit command here.
- Test request building, response parsing, and auth/rate-limit failure classification.

## Official docs
- https://platform.openai.com/docs/overview  
  Purpose: API overview and platform basics.
- https://platform.openai.com/docs/api-reference/images  
  Purpose: image generation request schema / response schema.
- https://platform.openai.com/docs/guides/error-codes and https://platform.openai.com/docs/api-reference/authentication  
  Purpose: error codes and authentication.
