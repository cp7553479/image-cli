This module owns Volcengine Seedream mapping.

- Map OpenAI-compatible generation fields to Seedream request fields.
- Keep provider-native sequential generation derived from `n`.
- Reference images (image-to-image / multi-image fusion) are set on the
  `image` body field of `images/generations`: a single data URL string for one
  image, or an array of data URL strings for multiple. The Ark API also
  accepts raw URLs, but the CLI normalizes to data URLs for consistency.
- Test generation mapping, response parsing, and retryable auth/quota failures.

## Official docs
- https://www.volcengine.com/docs/82379  
  Purpose: Ark API/documentation overview.
- https://www.volcengine.com/docs/82379/1541525  
  Purpose: Seedream image generation request schema / response schema.
- https://www.volcengine.com/docs/82379/1399008 and https://www.volcengine.com/docs/82379/1541594  
  Purpose: authentication and common error codes.
