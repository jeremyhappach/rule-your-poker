// Uses the already installed client. Credentials stay in the child environment,
// never command arguments or stdout. This helper is for a disposable DB only.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const config = JSON.parse(readFileSync('artifacts/replay-baseline/connection.private.json', 'utf8'));
if (config.host !== 'db.zvjgtqtpsyqhjfpppkmm.supabase.co') throw new Error('Refusing unexpected benchmark database');
const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', ...(process.argv[2] ? ['-f', process.argv[2]] : ['-c', 'SELECT current_user,version();'])];
const child = spawn('C:/Program Files/PostgreSQL/12/bin/psql.exe', args, {
  windowsHide: true,
  env: { ...process.env, PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user,
    PGDATABASE: config.database, PGPASSWORD: config.password, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
