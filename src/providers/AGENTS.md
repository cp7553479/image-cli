This module owns provider registry and shared provider abstractions.

- Shared provider code must stay provider-neutral.
- Provider-specific logic belongs in `src/providers/<provider>`.
- Add contract tests whenever shared provider interfaces change.

## Image-to-image / reference image adaptation

Each provider adapts the protocol-level `reference_images` / `mask` /
`input_fidelity` fields into its own native request shape. The shared helper
`src/providers/image-input.ts` resolves an `ImageInput` (URL or local file)
to base64 / data URL / multipart file path. Provider modules call it inside
`buildGenerateOperation`; they never re-parse CLI options.

Reference image field mapping by provider:

- `openai`: routes to `POST /images/edits` with multipart/form-data. Reference
  images become `image` (or `image[]` for multiple), `mask` becomes `mask`,
  and scalar fields become form text fields.
- `gemini`: appends `{inlineData:{mimeType,data}}` parts to
  `contents[0].parts` alongside the text part.
- `seedream`: sets the `image` body field on `images/generations` (string for
  one image, string array for multi-image fusion).
- `qwen`: appends `{image: dataURL}` entries to the sync multimodal
  `input.messages[0].content` array.
- `minimax`: maps to `subject_reference: [{type:"character", image_file: dataURL}]`.
- `openrouter`: switches `messages[0].content` to a multimodal array
  `[{type:"text",...},{type:"image_url",image_url:{url}}]`.

`extra` is still merged verbatim into each provider request for
provider-specific options beyond the OpenAI-compatible fields; it is not
locally validated.

## Documentation maintenance convention
- When adding a new provider, create `src/providers/<provider>/AGENTS.md` with an `## Official docs` section.
- The `## Official docs` section must include 1-3 first-party official links that cover API overview, generation interface, and auth/error docs.
- Keep link format consistent as markdown list items with one-line purpose notes.
- Document the provider's reference-image / edit field mapping in its `AGENTS.md`.
