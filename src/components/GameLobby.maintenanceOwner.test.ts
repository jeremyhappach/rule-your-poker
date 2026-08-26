import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/GameLobby.tsx'), 'utf8');

describe('GameLobby maintenance ownership', () => {
  it('receives maintenance state from its parent instead of opening a second realtime channel', () => {
    expect(source).toContain('isMaintenanceMode: boolean;');
    expect(source).toContain('({ userId, isMaintenanceMode }: GameLobbyProps)');
    expect(source).not.toContain('useMaintenanceMode');
  });
});
