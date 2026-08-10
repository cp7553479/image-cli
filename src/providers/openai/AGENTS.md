This module owns OpenAI request/response mapping.

- Map normalized generate fields to the OpenAI Images API.
- Text-to-image (no `reference_images`) routes to `POST /images/generations` with a JSON body.
- Image-to-image (one or more `reference_images`) routes to `POST /images/edits`
  with multipart/form-data: `image` (or `image[]` for multiple) carries the
  reference images as file uploads, `mask` carries the edit mask, and scalar
  fields (`model`, `prompt`, `size`, `n`, `input_fidelity`, ...) become form
  text fields.
- Test request building, response parsing, and auth/rate-limit failure classification.

## Official docs
- https://platform.openai.com/docs/overview  
  Purpose: API overview and platform basics.
- https://platform.openai.com/docs/api-reference/images  
  Purpose: image generation request schema / response schema.
- https://platform.openai.com/docs/guides/error-codes and https://platform.openai.com/docs/api-reference/authentication  
  Purpose: error codes and authentication.
