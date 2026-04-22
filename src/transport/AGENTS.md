This module owns `curl` execution and response capture.

- Build argv arrays only; do not shell-compose request commands.
- Support JSON, multipart, streaming, timeout, and header capture.
- Add tests with local mock servers for request shape and failure handling.

