import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const proofDirectory = fileURLToPath(new URL('../../supabase/tests/', import.meta.url));

describe('shared-setting rollback proofs', () => {
  it('makes every system_settings-mutating proof self-contained', () => {
    const proofs = readdirSync(proofDirectory)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => ({
        file,
        source: readFileSync(resolve(proofDirectory, file), 'utf8'),
      }))
      .filter(({ source }) => /\bUPDATE\s+public\.system_settings\b/i.test(source));

    expect(proofs.length).toBeGreaterThan(0);

    for (const { file, source } of proofs) {
      const mutation = source.search(/\bUPDATE\s+public\.system_settings\b/i);
      const begin = source.search(/^BEGIN;\s*$/m);
      const rollback = source.search(/^ROLLBACK;\s*$/m);

      expect(begin, `${file} must begin a transaction before mutating system_settings`).toBeGreaterThanOrEqual(0);
      expect(begin, `${file} must begin before mutating system_settings`).toBeLessThan(mutation);
      expect(rollback, `${file} must roll back shared-setting mutations`).toBeGreaterThan(mutation);
    }
  });
});
