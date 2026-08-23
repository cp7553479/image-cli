/**
 * Help text for each public CLI command.
 *
 * Every command group documents its subcommands with enough detail that both
 * humans and agents can pick the right command and predict its output without
 * reading source code. Help output is English.
 */
export const CLI_HELP = {
  root: `Usage: image [options] [command]

Unified image generation CLI with provider plugins.

Options:
  -h, --help       display help for command

Commands:
  generate <prompt>  Generate images from a prompt, optionally with reference
                     images, and save output files plus manifest.json.
  config             Manage the ~/.image config file and installed skill docs.
  provider           Inspect configured providers and their model ids.
  help [command]     display help for command

Operations:
  image generate <prompt> [options]
  image config init [--force]
  image config path
  image config show [--json]
  image config doctor [--json]
  image config providers [--json]
  image provider list [--json]
  image provider models [--json] [--limit <count>]
  image provider <provider-id> model list [--json] [--limit <count>]
`,
  generate: `Usage: image generate <prompt>

Generate images.

The prompt is required positional text; quote multi-line prompts. --model
takes provider/model (e.g. openai/gpt-image-1.5) and defaults to
config.defaultModel when omitted. Adding --reference-image turns the request
into an image-to-image edit request. Outputs are saved to --output-dir
(default ./image-output/<timestamp>/) as image-1.png ... plus manifest.json;
stdout prints the saved file paths, the manifest path, and any warnings.

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
  --input-fidelity <low|high>        fidelity to reference image (gpt-image)
  --extra <json>                     provider-specific JSON object, e.g. '{"seed":123}'; explicit flags take precedence
  --output-dir <path>                directory for saved outputs; default is ./image-output/<timestamp>/
  --json                             print JSON manifest
  -h, --help                         display help for command
`,
  config: `Usage: image config [command]

Manage image CLI configuration.

Commands:
  init       create missing config and skill files under ~/.image and every
             supported skill directory; existing files are kept unless --force
             is passed
  path       print the ~/.image config directory, config.json, the example and
             readme files, and every installed skill location
  show       print the sanitized active config: the default model plus one
             line per configured provider with enablement, credential count,
             and base URL; secrets are never printed
  doctor     check config files, curl availability, and per-provider
             credentials; prints ok/missing lines for quick diagnosis
  providers  list all known provider ids and aliases, including installed
             plugin providers; unlike 'image provider list' this works
             without configuring the provider first
  help       display help for command
`,
  configInit: `Usage: image config init [--force]

Create missing config and skill files.

Creates ~/.image/config.json (provider entries with placeholder credentials
to fill in; interactive prompts choose the Volcengine endpoint and Bailian
workspace), config.example.json, README.md, and the image-cli skill files in
every supported skill directory. Existing files are skipped; --force
overwrites all managed files.

Options:
  --force     overwrite all managed ~/.image and skill files
  -h, --help  display help for command
`,
  configPath: `Usage: image config path

Print config and skill paths.

Prints the ~/.image config directory, config.json, config.example.jsonc,
README.md, and each directory the image-cli skill is installed to.
`,
  configShow: `Usage: image config show [--json]

Print sanitized config.

Default output is the default model plus one line per configured provider
with enablement, credential count, and base URL. API keys and other secrets
are redacted. The default model is the defaultModel key in the config file
(path via 'image config path'); edit that file to change it. --json prints
the sanitized config as a JSON document.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  configDoctor: `Usage: image config doctor [--json]

Check config files, curl, and credentials.

Prints ok/missing status for the config files and curl, the resolved default
model, and one line per configured provider with its credential count.
--json prints the full machine-readable report.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  configProviders: `Usage: image config providers [--json]

List provider ids and aliases.

Lists every known provider definition with its aliases: built-in providers
and providers installed as plugins under ~/.image/plugins. This command shows
what can be configured; 'image provider list' shows what is configured.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  provider: `Usage: image provider [command]

Inspect configured providers and model ids.

Commands:
  list              list providers configured in ~/.image/config.json, one
                    line each with aliases, disabled state, and the default
                    model when set
  models            list model ids for every configured provider, grouped by
                    'provider-id:' headers with '- provider/model' entries
  <provider-id>     print one provider's summary (type, aliases, enabled,
                    credentials, baseUrl, default model); provider ids and
                    aliases both work here
  <provider-id> model list
                    list one provider's model ids as '- provider/model'
                    entries, from the provider API when supported, otherwise
                    a built-in fallback list with a warning
  help              display help for command
`,
  providerList: `Usage: image provider list [--json]

List configured providers.

One line per provider from ~/.image/config.json: provider id, aliases,
'disabled' when the provider is disabled, and the default model when this
provider provides it. --json adds the base URL, credential count, and
built-in/plugin flags.

Options:
  --json      print JSON output
  -h, --help  display help for command
`,
  providerModels: `Usage: image provider models [--json] [--limit <count>]

List model ids for all configured providers, grouped by provider.

Each provider prints a 'provider-id:' header, its warnings, then
'- provider/model' entries ready to pass to --model, in config order. Model
ids come from provider APIs when the built-in integration supports discovery
(known image model families listed first); otherwise a built-in fallback
list is printed with an English warning. --limit caps the entries printed
per provider; when it truncates, a '(showing N of M models)' line follows.

Options:
  --json           print JSON output
  --limit <count>  limit printed model ids per provider
  -h, --help       display help for command
`,
  providerTarget: `Usage: image provider <provider-id> [options] [command]

Print one provider's summary, or run its subcommands.

Bare invocation prints key=value lines: provider id, type (built-in or
plugin), description, aliases, configured/enabled state, credential count,
base URL, and the default model when this provider provides it. Use
'image config show' for all providers at once, and 'model list' below for
model ids. <provider-id> accepts provider ids and aliases configured in
~/.image/config.json, for example openai, chatgpt-image, or a plugin
provider like oracle.

Options:
  --json      print JSON output
  -h, --help  display help for command

Commands:
  model list
            list model ids for this provider
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

Prints warnings first, then '- provider/model' entries ready to pass to
--model. Model ids come from the provider API when the built-in integration
supports discovery (known image model families listed first); otherwise a
built-in fallback list is printed with an English warning. When --limit
truncates, a '(showing N of M models)' line follows.

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
