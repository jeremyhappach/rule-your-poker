import fs from 'node:fs';
import path from 'node:path';

type PlayerCredentials = {
  email: string;
  password: string;
};

function loadEnvFile(fileName: string): void {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile('.env.e2e.local');

function readPlayer(prefix: 'PTOWN_E2E_PLAYER1' | 'PTOWN_E2E_PLAYER2'): PlayerCredentials | null {
  const email = process.env[`${prefix}_EMAIL`]?.trim() ?? '';
  const password = process.env[`${prefix}_PASSWORD`] ?? '';
  return email && password ? { email, password } : null;
}

export const e2eEnvironment = {
  player1: readPlayer('PTOWN_E2E_PLAYER1'),
  player2: readPlayer('PTOWN_E2E_PLAYER2'),
  player1CanBlast: process.env.PTOWN_E2E_PLAYER1_CAN_BLAST === '1',
  allowFakeMoneyWrites: process.env.PTOWN_E2E_ALLOW_FAKE_MONEY_WRITES === '1',
};

export function requireTwoPlayerEnvironment(): {
  player1: PlayerCredentials;
  player2: PlayerCredentials;
} {
  const { player1, player2, player1CanBlast, allowFakeMoneyWrites } = e2eEnvironment;
  if (!player1 || !player2) {
    throw new Error(
      'Two-client liveness gauntlet requires PTOWN_E2E_PLAYER1_EMAIL/PASSWORD and '
      + 'PTOWN_E2E_PLAYER2_EMAIL/PASSWORD (environment or ignored .env.e2e.local).',
    );
  }
  if (player1.email.toLowerCase() === player2.email.toLowerCase()) {
    throw new Error('Two-client liveness gauntlet requires two distinct human test identities.');
  }
  if (!allowFakeMoneyWrites) {
    throw new Error(
      'Set PTOWN_E2E_ALLOW_FAKE_MONEY_WRITES=1 to acknowledge that the gauntlet creates '
      + 'fake-money sessions in the configured Supabase project. It never enables Real Money.',
    );
  }
  if (!player1CanBlast) {
    throw new Error(
      'Set PTOWN_E2E_PLAYER1_CAN_BLAST=1 only when player 1 is an existing admin. '
      + 'The gauntlet uses the guarded fake-money Blast action for mandatory cleanup.',
    );
  }
  return { player1, player2 };
}
