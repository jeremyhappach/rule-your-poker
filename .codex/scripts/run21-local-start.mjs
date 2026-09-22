/** Dedicated disposable-local launcher. No linked commands, pushes or deployments. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const args = new Set(process.argv.slice(2));
if ([...args].some(x => !['--enable-local-run21', '--check'].includes(x))) throw Error('Supported options: --enable-local-run21, --check');
if (process.env.VERCEL) throw Error('Run21 local development cannot run in a deployment.');
const workspace = path.join(root, 'qualification.local/local-stack');
const config = fs.readFileSync(path.join(workspace, 'supabase/config.toml'), 'utf8');
if (!config.includes('project_id = "run21-reconciled"') || !config.includes('port = 65321') || !config.includes('port = 65322') ||
    fs.existsSync(path.join(workspace, 'supabase/.temp/project-ref'))) throw Error('Expected the unlinked disposable run21-reconciled local stack.');
const cli = process.env.RUN21_SUPABASE_CLI || path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx/66b4952730d9cac8/node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const docker = path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe');
if (!fs.existsSync(cli) || !fs.existsSync(docker)) throw Error('Existing Supabase CLI or Docker Desktop not found. Set RUN21_SUPABASE_CLI to the installed CLI; this script installs nothing.');
const env = {...process.env, PATH: path.dirname(docker) + path.delimiter + process.env.PATH};
const localCli = more => execFileSync(cli, ['--workdir', workspace, ...more], {env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 240000});
const sql = text => execFileSync(docker, ['exec', '-i', 'supabase_db_run21-reconciled', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], {input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
try {
  if (!args.has('--check')) {
    const running = execFileSync(docker, ['ps', '--format', '{{.Names}}'], {encoding: 'utf8'}).split(/\r?\n/);
    // CLI start alone returns early for a db-only stack. Backup-stop only this project first.
    if (running.includes('supabase_db_run21-reconciled') && !running.includes('supabase_rest_run21-reconciled'))
      localCli(['stop', '--project-id', 'run21-reconciled']);
    localCli(['start', '--exclude', 'storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit']);
  }
  const status = JSON.parse(localCli(['status', '-o', 'json']));
  if (status.API_URL !== 'http://127.0.0.1:65321' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw Error('Dedicated local API is unavailable.');
  const versions = JSON.parse(sql('SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;'));
  const expected = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort().map(f => f.slice(0, 14));
  if (JSON.stringify(versions) !== JSON.stringify(expected)) throw Error('Local migration history differs from this checkpoint. Refusing to repair or replay automatically.');
  if (args.has('--enable-local-run21')) {
    const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
    const loginPath = 'qualification.local/playtest-login.json';
    let login = fs.existsSync(loginPath) ? JSON.parse(fs.readFileSync(loginPath, 'utf8')) : null;
    if (!login || !(await db.auth.admin.getUserById(login.userId)).data.user) {
      const password = randomBytes(18).toString('base64url');
      const {data, error} = await db.auth.admin.createUser({email: 'run21@local.test', password, email_confirm: true, user_metadata: {username: 'Run21 Tester'}});
      if (error) throw Error('Local test-account bootstrap failed; existing accounts were not changed.');
      login = {email: 'run21@local.test', password, userId: data.user.id};
      fs.writeFileSync(loginPath, JSON.stringify(login, null, 2));
    }
    if (!/^[0-9a-f-]{36}$/.test(login.userId)) throw Error('Invalid local fixture identity.');
    sql(`BEGIN;
      INSERT INTO public.user_roles(user_id,role) VALUES('${login.userId}','admin') ON CONFLICT DO NOTHING;
      UPDATE public.profiles SET is_active=true WHERE id='${login.userId}';
      INSERT INTO private.run21_release_allowlist(user_id) VALUES('${login.userId}') ON CONFLICT DO NOTHING;
      UPDATE private.run21_app_test_release SET qualified=true,enabled=true,project_ref='local';
      UPDATE public.game_defaults SET allow_bot_dealers=false WHERE game_type='holm';
      COMMIT;`);
  }
  if (args.has('--check')) {
    console.log(`Local stack: ${versions.length}/${expected.length} migrations. Run21 gate ${sql('SELECT enabled FROM private.run21_app_test_release;') === 't' ? 'enabled for local admins' : 'closed'}.`);
    process.exit(0);
  }
  if (sql("SELECT command FROM cron.job WHERE jobname='advance-due-game-state-1s';") !== 'CALL private.run_game_recovery_batch();') throw Error('Canonical recovery job differs from the qualified local contract.');
  sql("SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname<>'advance-due-game-state-1s'; SELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='advance-due-game-state-1s';");
  sql("ALTER SYSTEM SET cron.launch_active_jobs='on'; SELECT pg_reload_conf();");
  fs.writeFileSync('.env.local', `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nVITE_RUN21_TEST_PROJECT_REF=local\nVITE_RUN21_APP_TEST_ENABLED=true\nRUN21_LOCAL_SERVER=true\nRUN21_LOCAL_SERVICE_KEY=${status.SERVICE_ROLE_KEY}\n`);
  console.log('Run21 local app: http://127.0.0.1:4322/');
  console.log('Local login: qualification.local/playtest-login.json. Keys stay in ignored .env.local.');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4322', '--strictPort'], {cwd: root, env, stdio: 'inherit'});
  child.on('exit', code => {process.exitCode = code ?? 1;});
} catch {
  // Do not surface CLI stdout/stderr or SDK objects that may contain local credentials.
  console.error('Local startup stopped. Check Docker Desktop, the prepared local stack and migration history. No production access or automatic migration repair was attempted.');
  process.exitCode = 1;
}
