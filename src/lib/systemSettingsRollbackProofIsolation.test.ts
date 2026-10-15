import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const proofDirectory = fileURLToPath(new URL('../../supabase/tests/', import.meta.url));

describe('shared-setting rollback proofs', () => {
  it('runs every system_settings-mutating proof in one rollback transaction', () => {
    const proofs = readdirSync(proofDirectory)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => ({
        file,
        source: readFileSync(resolve(proofDirectory, file), 'utf8'),
      }))
      .filter(({ source }) => /\bUPDATE\s+public\.system_settings\b/i.test(source));

    expect(proofs.length).toBeGreaterThan(0);

    for (const { file, source: fragment } of proofs) {
      // This extension is executed only through the settlement-proof assembler.
      // Check that actual executable artifact, including the complete extension.
      const source = file === 'holm_chucky_secure_randomness_rollback_proof.sql'
        ? execFileSync(process.execPath, [resolve(proofDirectory, 'build-holm-chucky-proof.mjs'), '--stdout'], {
          cwd: resolve(proofDirectory, '../..'), encoding: 'utf8',
        })
        : fragment;
      expect(source).toContain(fragment);
      const mutation = source.search(/\bUPDATE\s+public\.system_settings\b/i);
      const begin = source.search(/^BEGIN;\s*$/m);
      const rollback = source.search(/^ROLLBACK;\s*$/m);

      expect(begin, `${file} must begin a transaction before mutating system_settings`).toBeGreaterThanOrEqual(0);
      expect(begin, `${file} must begin before mutating system_settings`).toBeLessThan(mutation);
      expect(rollback, `${file} must roll back shared-setting mutations`).toBeGreaterThan(mutation);
      expect(source.match(/^BEGIN;\s*$/gm), `${file} must open exactly one transaction`).toHaveLength(1);
      expect(source.match(/^ROLLBACK;\s*$/gm), `${file} must roll back exactly once`).toHaveLength(1);
      expect(source, `${file} must never commit synthetic mutations`).not.toMatch(/^\s*COMMIT\s*;/im);
    }
  });
});
