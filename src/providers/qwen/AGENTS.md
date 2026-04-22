This module owns Qwen sync and async image generation flows.

- Support both sync and async generate paths behind one plugin contract.
- Polling logic must stay testable and deterministic.
- Test sync mapping, async task flow, and provider-specific extras.

