// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentSource = readFileSync(
  join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
  'utf8',
);
const migrationSource = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260816190000_gin_rummy_authority_cutover.sql'),
  'utf8',
);

describe('Gin bot and recovery authority', () => {
  it('has no browser-authored bot action loop', () => {
    expect(componentSource).not.toContain('const runBotAction');
    expect(componentSource).not.toContain('botActionInProgress');
    expect(componentSource).not.toContain("@/lib/ginRummyBotLogic");
  });

  it('routes bot progression through the complete scheduled recovery owner', () => {
    expect(migrationSource).toContain('private.gin_apply_bot_action');
    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION private.advance_due_gin_rummy_state()');
    expect(migrationSource).toContain('SELECT private.advance_due_gin_rummy_state();');
  });
});
