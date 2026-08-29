import fs from 'node:fs';
import path from 'node:path';

import { resolveTestRunIsolation } from './runIsolation';

export type PlayerCredentials = {
  email: string;
  password: string;
};

export type E2eMobileViewport = {
  width: number;
  height: number;
};

const DEFAULT_MOBILE_VIEWPORT: E2eMobileViewport = { width: 390, height: 844 };

export function resolveE2eMobileViewport(
  environment: NodeJS.ProcessEnv = process.env,
): E2eMobileViewport {
  const raw = environment.PTOWN_E2E_MOBILE_VIEWPORT?.trim();
  if (!raw) return DEFAULT_MOBILE_VIEWPORT;
  const match = /^(\d{2,4})x(\d{2,4})$/i.exec(raw);
  if (!match) {
    throw new Error('PTOWN_E2E_MOBILE_VIEWPORT must use WIDTHxHEIGHT, for example 393x662.');
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 240 || width > 1200 || height < 320 || height > 1600) {
    throw new Error('PTOWN_E2E_MOBILE_VIEWPORT is outside the supported mobile bounds.');
  }
  return { width, height };
}

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

function readPlayer(
  prefix: 'PTOWN_E2E_PLAYER1' | 'PTOWN_E2E_PLAYER2',
  environment: NodeJS.ProcessEnv,
  identitySlot: string | null,
): PlayerCredentials | null {
  const scopedPrefix = identitySlot
    ? `PTOWN_E2E_${identitySlot.toUpperCase()}_${prefix.slice('PTOWN_E2E_'.length)}`
    : prefix;
  const email = environment[`${scopedPrefix}_EMAIL`]?.trim() ?? '';
  const password = environment[`${scopedPrefix}_PASSWORD`] ?? '';
  return email && password ? { email, password } : null;
}

export function resolveE2eEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const isolation = resolveTestRunIsolation(environment);
  const scopedPrefix = (name: string) => isolation.identitySlot
    ? `PTOWN_E2E_${isolation.identitySlot.toUpperCase()}_${name.slice('PTOWN_E2E_'.length)}`
    : name;
  return {
    player1: readPlayer('PTOWN_E2E_PLAYER1', environment, isolation.identitySlot),
    player2: readPlayer('PTOWN_E2E_PLAYER2', environment, isolation.identitySlot),
    player1CanBlast: environment[scopedPrefix('PTOWN_E2E_PLAYER1_CAN_BLAST')] === '1',
    allowFakeMoneyWrites: environment.PTOWN_E2E_ALLOW_FAKE_MONEY_WRITES === '1',
    mobileViewport: resolveE2eMobileViewport(environment),
    isolation,
  };
}

export const e2eEnvironment = resolveE2eEnvironment();

export function requireTwoPlayerEnvironment(): {
  player1: PlayerCredentials;
  player2: PlayerCredentials;
} {
  const { player1, player2, player1CanBlast, allowFakeMoneyWrites } = e2eEnvironment;
  if (!player1 || !player2) {
    throw new Error(
      'Two-client liveness gauntlet requires a configured PLAYER1/PLAYER2 credential pair. '
      + 'When PTOWN_E2E_IDENTITY_SLOT is set, use PTOWN_E2E_<SLOT>_PLAYER1_EMAIL/PASSWORD and PLAYER2 equivalents.',
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
