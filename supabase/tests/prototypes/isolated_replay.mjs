// Build a disposable-database replay; never edit production migration history.
// Callers must independently verify the approved branch project reference.
export function splitSql(sql) {
  const parts=[]; let start=0,quote=null,dollar=null,depth=0,line=false,escape=false;
  for(let i=0;i<sql.length;i++) {
    const c=sql[i],n=sql[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(depth){if(c==='/'&&n==='*'){depth++;i++;}else if(c==='*'&&n==='/'){depth--;i++;}continue;}
    if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
    if(quote){if(escape&&c==='\\'){i++;continue;}if(c===quote){if(n===quote)i++;else quote=null;}continue;}
    if(c==='-'&&n==='-'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){depth=1;i++;continue;}
    if(c==="'"||c==='"'){quote=c;escape=c==="'"&&/[eE]/.test(sql[i-1]||'')&&!/[\w$]/.test(sql[i-2]||'');continue;}
    if(c==='$'){const m=sql.slice(i).match(/^\$(?:[A-Za-z_][\w]*)?\$/);if(m){dollar=m[0];i+=dollar.length-1;continue;}}
    if(c===';'){parts.push(sql.slice(start,i+1));start=i+1;}
  }
  if(quote||dollar||depth)throw new Error('Unclosed SQL quote or comment');
  if(sql.slice(start).trim())parts.push(sql.slice(start));
  return parts;
}
export function commandText(statement){return statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'').trim();}
export function buildReplay(migrations) {
  const adaptations=[];const statements=[];
  for(const migration of migrations) {
    let sql=migration.statements.join('\n');
    if(migration.version==='20260706213441') {
      for(const [id,name] of [[7,'enforce-all-deadlines-every-30s'],[9,'finalize-voice-operations-5s']]) {
        const from=`SELECT cron.alter_job(job_id := ${id}, active := false);`;
        if(sql.split(from).length!==2)throw new Error(`Unexpected legacy cron source ${id}`);
        sql=sql.replace(from,`SELECT cron.alter_job(job_id := jobid, active := false) FROM cron.job WHERE jobname = '${name}';`);
        adaptations.push({version:migration.version,kind:'cron-id-to-name',id,name});
      }
    }
    let rollbackFixture=false,rollbackObserved=false;
    for(const part of splitSql(sql)) {
      const command=commandText(part);
      if(!command)continue;
      if(migration.version==='20260818141237'&&/^SAVEPOINT codex_rollback_proof;$/i.test(command)) {
        rollbackFixture=true;adaptations.push({version:migration.version,kind:'omit-already-rolled-back-migration-fixture'});continue;
      }
      if(rollbackFixture) {
        if(/^ROLLBACK TO SAVEPOINT codex_rollback_proof;$/i.test(command))rollbackObserved=true;
        if(/^RELEASE SAVEPOINT codex_rollback_proof;$/i.test(command)){
          if(!rollbackObserved)throw new Error('Historical fixture was not rolled back');
          rollbackFixture=false;
        }
        continue;
      }
      if(migration.version==='20260812022452'&&/^DO \$repair\$/i.test(command)) {
        if(!command.includes('holm_live_restore:unexpected_game_state')||!command.includes('9d038912-c8b9-4512-977d-c2a7a4c5360c'))throw new Error('Unexpected historical Holm repair');
        adaptations.push({version:migration.version,kind:'omit-production-session-data-repair'});continue;
      }
      if(/^(BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;?$/i.test(command)) {
        adaptations.push({version:migration.version,kind:'outer-transaction',command});continue;
      }
      if(/^(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|VACUUM|CREATE\s+DATABASE|ALTER\s+SYSTEM)\b/i.test(command))throw new Error(`Unsafe transactional replay statement: ${migration.version}`);
      statements.push({version:migration.version,sql:part,command:command.slice(0,120)});
    }
    if(rollbackFixture)throw new Error('Unclosed historical rollback fixture');
  }
  return {statements,adaptations};
}
