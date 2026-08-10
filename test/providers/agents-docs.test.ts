import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROVIDERS_DIR = join(process.cwd(), 'src/providers');

describe('provider AGENTS docs integrity', () => {
  it('contains Official docs section with official links for each provider AGENTS.md', () => {
    const providers = readdirSync(PROVIDERS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((provider) =>
        existsSync(join(PROVIDERS_DIR, provider, 'AGENTS.md'))
      );

    for (const provider of providers) {
      const agentsPath = join(PROVIDERS_DIR, provider, 'AGENTS.md');
      const content = readFileSync(agentsPath, 'utf8');
      expect(content).toMatch(/^##\s+Official docs\s*$/m);

      const officialSection = content.split(/^##\s+Official docs\s*$/m)[1] ?? '';
      const linkMatches = officialSection.match(/https?:\/\/\S+/g) ?? [];
      expect(linkMatches.length).toBeGreaterThan(0);
    }
  });
});
