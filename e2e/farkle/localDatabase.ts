import { execFileSync } from 'node:child_process';

/** Test-host-only cleanup through the existing scoped authority claim. Never an RPC. */
export function cleanLocalFarkleGame(gameId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error('Invalid local fixture identity');
  execFileSync('docker', ['exec', '-i', 'supabase_db_farkle-wave2-local',
    'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: `BEGIN; SELECT private.farkle_claim_v1('${gameId}',NULL,NULL,'cleanup');
      DELETE FROM public.games WHERE id='${gameId}'; COMMIT;`, encoding: 'utf8',
  });
}
