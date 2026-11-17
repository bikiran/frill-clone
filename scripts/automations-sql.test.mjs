// Colvy Automations: the run bookkeeping, against a real Postgres
// (migrations/COLVY_V440_AUTOMATIONS.sql). Starting a run (switched on, the
// same event never twice, cool-down per conversation, daily limit, another
// business's flow), parallel webhooks racing for the same event, handing due
// waits to one worker each, stuck runs, and who may call the functions.
//
//   node scripts/automations-sql.test.mjs
//
// Needs psql and a local server it can reach as the "postgres" user. Makes and
// drops its own database. Skips, and says so, when there's no server. Made-up
// data only.

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION = join(here, '..', 'migrations', 'COLVY_V440_AUTOMATIONS.sql')
const DB = 'colvy_automations_test'
const asRoot = process.getuid?.() === 0 && !process.env.PGUSER
const quote = (a) => `'${a.replace(/'/g, `'\\''`)}'`

function psql(args, input) {
  return asRoot
    ? execFileSync('su', ['postgres', '-c', ['psql', ...args].map(quote).join(' ')], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    : execFileSync('psql', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}
const run = (db, q) => psql(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-At', '-c', q]).trim()
const sql = (q) => run(DB, q)
const sqlFile = (text) => psql(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB], text)
function sqlAsync(q) {
  return new Promise((resolve) => {
    const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-At', '-c', q]
    const p = asRoot ? spawn('su', ['postgres', '-c', ['psql', ...args].map(quote).join(' ')]) : spawn('psql', args)
    let out = '', err = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err += d })
    p.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }))
  })
}

let fails = 0, passes = 0
const ok = (c, m, x) => { if (c) { passes++; console.log('  ok  ', m) } else { fails++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)) } }
const j = q => JSON.parse(sql(q))

try { run('postgres', 'select 1') }
catch (e) { console.log('skipped: no Postgres server to test against (' + String(e.message).split('\n')[0] + ')'); process.exit(0) }

const A = 'a0000000-0000-4000-8000-00000000000a'   // Brightline Plumbing
const B = 'b0000000-0000-4000-8000-00000000000b'   // Harbour Florist
const C1 = 'c1000000-0000-4000-8000-000000000001', C2 = 'c2000000-0000-4000-8000-000000000002'

run('postgres', `DROP DATABASE IF EXISTS ${DB}`)
run('postgres', `CREATE DATABASE ${DB}`)
sqlFile(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE TABLE public.companies (id UUID PRIMARY KEY, name TEXT);
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  INSERT INTO public.companies VALUES ('${A}', 'Brightline Plumbing'), ('${B}', 'Harbour Florist');
`)

console.log('migration')
const migration = readFileSync(MIGRATION, 'utf8')
sqlFile(migration)
sqlFile(migration)
ok(sql(`select count(*) from information_schema.tables where table_name in ('automations','automation_runs')`) === '2', 'V440 creates both tables, and runs twice without error')
ok(sql(`select bool_and(relrowsecurity) from pg_class where relname in ('automations','automation_runs')`) === 't', 'row level security is on for both')
ok(sql(`select count(*) from information_schema.role_table_grants where table_name in ('automations','automation_runs') and grantee in ('anon','authenticated')`) === '0', 'nothing granted to anon or signed-in browsers')
for (const role of ['anon', 'authenticated']) {
  ok(sql(`select has_function_privilege('${role}', 'public.automation_start_run(uuid, uuid, text, uuid, int, int, jsonb)', 'execute')`) === 'f', `${role} can't start runs`)
  ok(sql(`select has_function_privilege('${role}', 'public.automation_claim_due(int)', 'execute')`) === 'f', `${role} can't claim waits`)
}
ok(sql(`select has_function_privilege('service_role', 'public.automation_claim_due(int)', 'execute')`) === 't', 'the server (service_role) can')
let bad = null
try { sql(`insert into public.automations (company_id, name, trigger_type) values ('${A}', 'x', 'order')`) } catch (e) { bad = e }
ok(!!bad, 'an unknown trigger type is refused')
bad = null
try { sql(`insert into public.automations (company_id, name) values ('${A}', '')`) } catch (e) { bad = e }
ok(!!bad, 'an empty name is refused')

console.log('starting a run')
const F = sql(`insert into public.automations (company_id, name, enabled) values ('${A}', 'After hours', false) returning id`)
const start = (ev, conv = C1, cool = 0, cap = 0, co = A, f = F) =>
  j(`select public.automation_start_run('${co}', '${f}', '${ev}', ${conv ? `'${conv}'` : 'null'}, ${cool}, ${cap}, '{"channel":"chat"}'::jsonb)`)
let r = start('msg:1')
ok(r.ok === false && r.reason === 'off', 'a switched-off flow doesn’t start', r)
sql(`update public.automations set enabled = true where id = '${F}'`)
r = start('msg:1')
ok(r.ok === true && /^[0-9a-f-]{36}$/.test(r.run_id), 'switched on: it starts', r)
ok(sql(`select status || ' ' || (context->>'channel') from public.automation_runs where id = '${r.run_id}'`) === 'running chat', 'the run is saved as running, with its context')
ok(sql(`select run_count from public.automations where id = '${F}'`) === '1' && sql(`select last_run_at is not null from public.automations where id = '${F}'`) === 't', 'the flow counts the run')
r = start('msg:1')
ok(r.ok === false && r.reason === 'duplicate', 'the same message never starts it twice', r)
r = start('msg:2', C1, 60)
ok(r.ok === false && r.reason === 'cooldown', 'a second message in the same conversation within the cool-down: not started', r)
r = start('msg:3', C2, 60)
ok(r.ok === true, 'another conversation isn’t held back by it', r)
r = start('msg:4', C1, 0)
ok(r.ok === true, 'no cool-down: every new message starts it', r)
sql(`update public.automation_runs set status = 'skipped' where automation_id = '${F}'`)
r = start('msg:5', C1, 60)
ok(r.ok === true, 'skipped runs don’t count toward the cool-down', r)
sql(`update public.automation_runs set created_at = now() - interval '2 hours' where automation_id = '${F}'`)
r = start('msg:6', C1, 60)
ok(r.ok === true, 'after the cool-down it runs again', r)
r = start('call:1', null, 60)
ok(r.ok === true, 'an event with no conversation (a missed call without one) can still start', r)
r = j(`select public.automation_start_run('${B}', '${F}', 'msg:99', '${C1}', 0, 0, '{}'::jsonb)`)
ok(r.ok === false && r.reason === 'off', 'another business can’t start this business’s flow', r)
r = j(`select public.automation_start_run('${A}', '${F}', '', '${C1}', 0, 0, '{}'::jsonb)`)
ok(r.ok === false && r.reason === 'no_event', 'an empty event key is refused', r)

console.log('daily limit')
const G = sql(`insert into public.automations (company_id, name, enabled) values ('${A}', 'Busy', true) returning id`)
for (let i = 0; i < 3; i++) ok(start(`m${i}`, `c3000000-0000-4000-8000-00000000000${i}`, 0, 3, A, G).ok === true, `run ${i + 1} of 3 allowed`)
r = start('m9', 'c3000000-0000-4000-8000-000000000009', 0, 3, A, G)
ok(r.ok === false && r.reason === 'cap', 'the 4th in 24 hours is held back', r)

console.log('races')
const H = sql(`insert into public.automations (company_id, name, enabled) values ('${A}', 'Race', true) returning id`)
let res = await Promise.all(Array.from({ length: 10 }, () => sqlAsync(`select public.automation_start_run('${A}', '${H}', 'msg:same', '${C1}', 0, 0, '{}'::jsonb)`)))
let st = res.map(x => x.code === 0 ? JSON.parse(x.out) : { err: x.err })
ok(st.filter(x => x.ok).length === 1 && st.filter(x => x.reason === 'duplicate').length === 9, '10 parallel webhooks for the same message: exactly one run', st.filter(x => x.err))
res = await Promise.all(Array.from({ length: 10 }, (_, i) => sqlAsync(`select public.automation_start_run('${A}', '${H}', 'msg:burst${i}', '${C2}', 30, 0, '{}'::jsonb)`)))
st = res.map(x => x.code === 0 ? JSON.parse(x.out) : { err: x.err })
ok(st.filter(x => x.ok).length === 1 && st.filter(x => x.reason === 'cooldown').length === 9, '10 parallel different messages, same conversation, with a cool-down: one run', st.filter(x => x.err))
ok(sql(`select run_count from public.automations where id = '${H}'`) === '2', 'the count matches the runs started')

console.log('waits')
const W = sql(`insert into public.automations (company_id, name, enabled) values ('${A}', 'Waits', true) returning id`)
const ids = []
for (let i = 0; i < 6; i++) ids.push(start(`w${i}`, `c4000000-0000-4000-8000-00000000000${i}`, 0, 0, A, W).run_id)
sql(`update public.automation_runs set status = 'waiting', resume_node = 'n2', resume_at = now() - interval '1 minute' where id in ('${ids.slice(0, 4).join("','")}')`)
sql(`update public.automation_runs set status = 'waiting', resume_node = 'n2', resume_at = now() + interval '1 hour' where id = '${ids[4]}'`)
const claimed = await Promise.all(Array.from({ length: 6 }, () => sqlAsync(`select coalesce(json_agg(id), '[]') from public.automation_claim_due(2)`)))
const got = claimed.flatMap(x => x.code === 0 ? JSON.parse(x.out) : [])
ok(got.length === 4 && new Set(got).size === 4, '6 workers at once share the 4 due waits, none twice', claimed.filter(x => x.code))
ok(!got.includes(ids[4]), 'a wait that isn’t due stays waiting')
ok(sql(`select count(*) from public.automation_runs where id in ('${ids.slice(0, 4).join("','")}') and status = 'running'`) === '4', 'claimed waits are running')
ok(sql(`select count(*) from public.automation_claim_due(50)`) === '0', 'nothing left to claim')
sql(`update public.automation_runs set updated_at = now() - interval '20 minutes' where id = '${ids[5]}'`)
sql(`select count(*) from public.automation_claim_due(50)`)
ok(sql(`select status || ' / ' || error from public.automation_runs where id = '${ids[5]}'`) === 'failed / Stopped part-way through (timed out).', 'a run stuck as running for 15 minutes is marked failed')
ok(sql(`select status from public.automation_runs where id = '${ids[0]}'`) === 'running', 'a run claimed just now isn’t')

console.log('clean-up')
sql(`delete from public.automations where id = '${W}'`)
ok(sql(`select count(*) from public.automation_runs where automation_id = '${W}'`) === '0', 'deleting a flow deletes its runs')
sql(`delete from public.companies where id = '${A}'`)
ok(sql(`select count(*) from public.automations`) === '0' && sql(`select count(*) from public.automation_runs`) === '0', 'deleting a business deletes its flows and runs')

run('postgres', `DROP DATABASE IF EXISTS ${DB}`)
console.log(fails ? `\n${fails} failed, ${passes} passed` : `\nall ${passes} passed`)
process.exit(fails ? 1 : 0)
