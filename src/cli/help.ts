/**
 * Help text for each public CLI command.
 */
export const CLI_HELP = {
  root: `Usage: image [options] [command]

Unified image generation CLI with provider plugins.

Options:
  -h, --help       display help for command

Commands:
  generate <prompt>  Generate images from a prompt.
  config             Manage local config.
  provider           Inspect providers.
  help [command]     display help for command

Operations:
  image generate <prompt> [options]
  image config init [--force]
  image config path
  image config show [--json]
  image config doctor [--json]
  image config providers [--json]
  image provider list [--json]
  image provider <provider-id> model list [--json] [--limit <count>]
`,
  generate: `Usage: image generate <prompt>

Generate images.

Options:
  --model <provider/model>           defaults to config.defaultModel when omitted
  --size <value>                     output size (e.g. auto, 1024x1024, 2K); passed through as-is
  --n <count>                        output count
  --quality <value>                  image quality
  --background <value>               background mode
  --output-format <value>            preferred output format (e.g. png, jpeg, webp)
  --output-compression <value>       compression level for jpeg or webp outputs
  --moderation <value>               moderation strictness
  --response-format <value>          response format (e.g. url, b64_json)
  --stream                           stream when supported
  --partial-images <count>           partial streamed image count
  --style <value>                    image style
  --user <id>                        end-user identifier
  --reference-image <path|url>       reference image; repeat to pass multiple (image-to-image)
  --mask <path|url>                  edit mask (PNG, transparent areas are editable)
  --input-fidelity <value>           fidelity to reference image (gpt-image)
  --extra <json>                     provider-specific JSON options; explicit flags take precedence
  --output-dir <path>                directory for saved outputs; default is ./image-output/<timestamp>/
  --json                             print JSON manifest
  -h, --help                         display help for command
`,
  config: `Usage: image config [command]

Manage image CLI configuration.

Commands:
  init       create missing config and skill files
  path       print the config and skill paths used by the CLI
  show       print sanitized config
  doctor     check config files, curl, and credentials
  providers  list provider ids and aliases
  help       display help for command
`,
  configInit: `Usage: image config init [--force]

Create missing config and skill files.

Options:
  --force     overwrite all managed ~/.image and skill files
  -h, --help  display help for command
`,
  configPath: `Usage: image config path

Print config and skill paths.
`,
  configShow: `Usage: image config show [--json]

Print sanitized config.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  configDoctor: `Usage: image config doctor [--json]

Check config files, curl, and credentials.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  configProviders: `Usage: image config providers [--json]

List provider ids and aliases.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  provider: `Usage: image provider [command]

Inspect configured providers and model ids.

Commands:
  list              list configured providers
  <provider-id>     inspect one provider
  <provider-id> model list
                    list model ids
  help              display help for command
`,
  providerList: `Usage: image provider list [--json]

List configured providers.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  providerTarget: `Usage: image provider <provider-id> [command]

Inspect one provider.

Commands:
  model list
            list model ids
  help      display help for command
`,
  providerTargetModel: `Usage: image provider <provider-id> model [command]

Inspect model ids.

Commands:
  list      list model ids for this provider
  help      display help for command
`,
  providerTargetModelList: `Usage: image provider <provider-id> model list

List model ids for a configured provider.

Options:
  --json           print JSON output
  --limit <count>  limit printed model ids
  -h, --help       display help for command
`
} as const;

/**
 * Option definitions consumed by the built-in parser.
 */
export const CLI_OPTIONS = {
  generate: {
    model: { type: "string" },
    size: { type: "string" },
    n: { type: "string" },
    quality: { type: "string" },
    background: { type: "string" },
    "output-format": { type: "string" },
    "output-compression": { type: "string" },
    moderation: { type: "string" },
    "response-format": { type: "string" },
    stream: { type: "boolean" },
    "partial-images": { type: "string" },
    style: { type: "string" },
    user: { type: "string" },
    "reference-image": { type: "string", multiple: true },
    mask: { type: "string" },
    "input-fidelity": { type: "string" },
    extra: { type: "string" },
    "output-dir": { type: "string" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  },
  json: {
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  },
  force: {
    force: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  },
  help: {
    help: { type: "boolean", short: "h" }
  },
  modelList: {
    json: { type: "boolean" },
    limit: { type: "string" },
    help: { type: "boolean", short: "h" }
  }
} as const;
