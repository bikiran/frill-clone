// Colvy Powers: the money side, against a real Postgres (migrations/COLVY_V438_COLVY_POWERS.sql).
// Wallet balances, duplicate rewards, daily caps, cooldowns and limits, gifts,
// reversals, streaks, tenant isolation, who may call the functions, and
// concurrency (parallel sessions racing the same wallet).
//
//   node scripts/powers-sql.test.mjs
//
// Needs psql and a local server it can reach as the "postgres" user (PGHOST,
// PGPORT, PGUSER work as usual). Makes and drops its own database. Skips, and
// says so, when there's no server. Made-up data only.

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION = join(here, '..', 'migrations', 'COLVY_V438_COLVY_POWERS.sql')
const MIGRATION2 = join(here, '..', 'migrations', 'COLVY_V439_POWERS_MORE_WAYS.sql')
const DB = 'colvy_powers_test'
const asRoot = process.getuid?.() === 0 && !process.env.PGUSER
const quote = (a) => `'${a.replace(/'/g, `'\\''`)}'`

// psql, as the postgres user when this runs as root (a fresh container).
function psql(args, input) {
  return asRoot
    ? execFileSync('su', ['postgres', '-c', ['psql', ...args].map(quote).join(' ')], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    : execFileSync('psql', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}
const run = (db, q) => psql(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-At', '-c', q]).trim()
const sql = (q) => run(DB, q)
const sqlFile = (text) => psql(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB], text)
// One statement in its own session, in the background (for races).
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

const A = 'a0000000-0000-4000-8000-00000000000a'   // company A
const B = 'b0000000-0000-4000-8000-00000000000b'   // company B
const U1 = '10000000-0000-4000-8000-000000000001', U2 = '20000000-0000-4000-8000-000000000002', U3 = '30000000-0000-4000-8000-000000000003'
const D1 = '2026-11-16'

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
ok(sql(`select count(*) from information_schema.tables where table_name like 'powers_%'`) === '7', 'V438 creates the 7 tables, and runs twice without error')
const migration2 = readFileSync(MIGRATION2, 'utf8')
sqlFile(migration2)
sqlFile(migration2)
ok(sql(`select count(*) from information_schema.tables where table_name like 'powers_%'`) === '8', 'V439 adds the activity table, and runs twice without error')

const award = (co, u, c, x, idem, o = {}) => j(`select public.powers_award('${co}','${u}',${c},${x},'${o.kind || 'reward'}','${o.rule || 'resolve'}','conversation','${o.ref || 'c1'}',${idem ? `'${idem}'` : 'null'},'${o.day || D1}',${o.capC ?? 'null'},${o.capX ?? 'null'},null,${o.reason ? `'${o.reason}'` : 'null'})`)
const wallet = (co, u) => j(`select coalesce((select row_to_json(w)::text from public.powers_wallets w where company_id='${co}' and user_id='${u}'), '{}')`)

console.log('rewards')
let r = award(A, U1, 10, 12, 'resolve:c1:m1')
ok(r.status === 'ok' && r.coins === 10 && r.xp === 12 && r.balance === 10 && r.total_xp === 12, 'a reward pays coins and XP', r)
r = award(A, U1, 10, 12, 'resolve:c1:m1')
ok(r.status === 'duplicate' && wallet(A, U1).coins === 10, 'the same work twice pays once', r)
r = award(A, U2, 10, 12, 'resolve:c1:m1')
ok(r.status === 'duplicate' && !wallet(A, U2).coins, '…even when someone else claims it', r)
ok(sql(`select count(*) from public.powers_ledger where company_id='${A}'`) === '1', 'one ledger row')

console.log('daily caps')
award(A, U3, 10, 10, 'cap1', { capC: 25, capX: 100 })
award(A, U3, 10, 10, 'cap2', { capC: 25, capX: 100 })
r = award(A, U3, 10, 10, 'cap3', { capC: 25, capX: 100 })
ok(r.status === 'ok' && r.coins === 5 && r.xp === 10, 'the reward that crosses the coin cap pays what is left, XP still counts', r)
r = award(A, U3, 10, 0, 'cap4', { capC: 25, capX: 100 })
ok(r.status === 'capped' && wallet(A, U3).coins === 25, 'after the cap: nothing, and no row', r)
r = award(A, U3, 10, 10, 'cap5', { capC: 25, capX: 100, day: '2026-11-17' })
ok(r.status === 'ok' && r.coins === 10, 'a new day starts a new cap', r)

console.log('admin grant and revoke')
r = award(A, U2, 40, 99, null, { kind: 'grant', rule: 'grant', reason: 'Great week' })
ok(r.status === 'ok' && r.coins === 40 && r.xp === 0 && wallet(A, U2).coins === 40 && wallet(A, U2).earned_coins === 0, 'a grant adds coins, never XP, and does not count as earned', r)
r = award(A, U2, 100, 0, null, { kind: 'revoke', rule: 'revoke', reason: 'Correction' })
ok(r.status === 'ok' && r.coins === -40 && wallet(A, U2).coins === 0, 'a revoke never takes a balance below zero', r)

console.log('buying a power')
award(A, U1, 90, 0, null, { kind: 'grant', rule: 'grant' }) // U1 now 100
const buy = (u, power, price, o = {}) => j(`select public.powers_buy('${A}','${u}','${power}',${price},${o.target ? `'${o.target}'` : 'null'},${o.ref ? `'${o.ref}'` : 'null'},'{}'::jsonb,${o.minutes ?? 30},${o.cooldown ?? 0},${o.daily ?? 0},now() - interval '1 hour',${o.hourly ?? 0},${o.idem ? `'${o.idem}'` : 'null'},'${D1}',${o.savers ?? 0})`)
r = buy(U2, 'nudge', 50, { target: U1 })
ok(r.status === 'short' && wallet(A, U2).coins === 0, 'not enough coins: nothing happens', r)
r = buy(U1, 'priority_pin', 30, { target: U2, ref: 'conv-9', idem: 'click-1', minutes: 30 })
ok(r.status === 'ok' && r.balance === 70 && r.activation.target_user_id === U2 && r.activation.ends_at, 'buying takes the coins and starts the power with an end time', r)
r = buy(U1, 'priority_pin', 30, { target: U2, ref: 'conv-9', idem: 'click-1' })
ok(r.status === 'duplicate' && wallet(A, U1).coins === 70, 'a double click buys once', r)
r = buy(U1, 'nudge', 5, { target: U2, cooldown: 10, idem: 'n1' })
ok(r.status === 'ok', 'nudge', r)
r = buy(U1, 'nudge', 5, { target: U2, cooldown: 10, idem: 'n2' })
ok(r.status === 'cooldown' && r.until && wallet(A, U1).coins === 65, 'a cooldown stops the next one, coins untouched', r)
r = buy(U1, 'confetti', 5, { daily: 1, idem: 'cf1', minutes: 0 })
ok(r.status === 'ok' && r.activation.ends_at === null, 'an instant power has no end time', r)
r = buy(U1, 'confetti', 5, { daily: 1, idem: 'cf2', minutes: 0 })
ok(r.status === 'daily_limit', 'the daily limit holds', r)
// U2 was picked twice this hour (the pin and the nudge).
r = buy(U1, 'vip_crown', 5, { target: U2, hourly: 2, idem: 'vc1' })
ok(r.status === 'target_busy' && wallet(A, U1).coins === 60, 'a teammate already picked twice this hour can’t be picked again (rate limit on targeted powers)', r)
r = buy(U1, 'streak_saver', 10, { idem: 'ss1', minutes: 0, savers: 1 })
ok(r.status === 'ok' && r.savers === 1, 'a Streak Saver goes into the wallet', r)

console.log('gifts')
const gift = (from, to, amt, idem, max = 0) => j(`select public.powers_gift('${A}','${from}','${to}',${amt},'Thanks for covering','${idem}','${D1}',${max})`)
r = gift(U1, U1, 5, 'g0'); ok(r.status === 'self', 'no gifts to yourself', r)
r = gift(U2, U1, 5, 'g1'); ok(r.status === 'short', 'can’t gift coins you don’t have', r)
const before = wallet(A, U1).coins
r = gift(U1, U2, 20, 'g2', 30); ok(r.status === 'ok' && wallet(A, U1).coins === before - 20 && wallet(A, U2).coins === 20, 'a gift moves coins', r)
r = gift(U1, U2, 20, 'g2', 30); ok(r.status === 'duplicate' && wallet(A, U2).coins === 20, 'the same gift twice moves coins once', r)
r = gift(U1, U2, 15, 'g3', 30); ok(r.status === 'daily_limit' && r.left === 10, 'the daily gift limit holds', r)
ok(wallet(A, U2).xp === 0, 'gifts never move XP')

console.log('reversals')
award(A, U3, 15, 15, 'task:t1', { rule: 'task', ref: 't1', day: '2026-11-18' })
const w3 = wallet(A, U3)
r = j(`select public.powers_reverse('${A}','task:t1','Task reopened','2026-11-18')`)
ok(r.status === 'ok' && r.coins === -15 && r.xp === -15 && wallet(A, U3).coins === w3.coins - 15, 'reversing takes the reward back', r)
r = j(`select public.powers_reverse('${A}','task:t1','again','2026-11-18')`)
ok(r.status === 'none', 'reversing twice does nothing the second time', r)
r = award(A, U3, 15, 15, 'task:t1', { rule: 'task', ref: 't1', day: '2026-11-18' })
ok(r.status === 'ok', 'redone work (task ticked again) can pay again', r)
// Spent coins: the reversal takes what's there.
sql(`update public.powers_wallets set coins = 4 where company_id='${A}' and user_id='${U3}'`)
r = j(`select public.powers_reverse('${A}','task:t1','Task deleted','2026-11-18')`)
ok(r.status === 'ok' && r.coins === -4 && wallet(A, U3).coins === 0, 'a reversal after the coins were spent takes only what’s left', r)

console.log('streaks')
const S = '40000000-0000-4000-8000-000000000004'
const day = (d, k) => award(A, S, 1, 1, 'st' + k, { day: d })
day('2026-11-01', 1); day('2026-11-01', 2); r = day('2026-11-02', 3)
ok(r.streak === 2, 'two days in a row: streak 2', r)
sql(`update public.powers_wallets set savers = 1 where company_id='${A}' and user_id='${S}'`)
r = day('2026-11-04', 4)
ok(r.streak === 3 && r.saver_used === true && wallet(A, S).savers === 0, 'one missed day uses a Streak Saver', r)
r = day('2026-11-07', 5)
ok(r.streak === 1 && wallet(A, S).best_streak === 3, 'a longer gap starts again, best streak kept', r)

console.log('tenant isolation')
r = award(B, U1, 10, 10, 'resolve:c1:m1')
ok(r.status === 'ok' && r.balance === 10, 'the same person and key in another business is separate', r)
ok(wallet(A, U1).coins !== wallet(B, U1).coins, 'separate wallets per business')
r = j(`select public.powers_reverse('${B}','resolve:c1:m1','test','${D1}')`)
ok(r.status === 'ok' && sql(`select count(*) from public.powers_ledger where company_id='${A}' and idem_key='resolve:c1:m1' and reversed_at is null`) === '1', 'reversing in one business leaves the other alone', r)
r = j(`select public.powers_gift('${B}','${U1}','${U2}',5,'x','gx','${D1}',0)`)
ok(r.status === 'short' || r.status === 'ok', 'a gift only sees the wallet in its own business', r)
ok(wallet(A, U2).coins === 20, '…and company A’s wallet is untouched')

console.log('who may call')
for (const role of ['anon', 'authenticated']) {
  let denied = 0
  for (const q of [
    `select public.powers_award('${A}','${U1}',999,0,'grant','x',null,null,null,'${D1}')`,
    `select public.powers_gift('${A}','${U2}','${U1}',1,'x','z','${D1}',0)`,
    `select count(*) from public.powers_wallets`,
    `update public.powers_wallets set coins = 99999`,
  ]) {
    try { sqlFile(`set role ${role}; ${q};`) } catch { denied++ }
  }
  ok(denied === 4, `${role} can’t call the functions or touch the tables`, denied)
}
ok(sql(`select has_function_privilege('service_role', 'public.powers_award(uuid, uuid, int, int, text, text, text, text, text, date, int, int, uuid, text, jsonb)', 'execute')`) === 't', 'the server (service role) can')

console.log('concurrency')
const C = 'c0000000-0000-4000-8000-00000000000c'
sql(`insert into public.companies values ('${C}', 'Race Co')`)
let res = await Promise.all(Array.from({ length: 20 }, () => sqlAsync(`select public.powers_award('${C}','${U1}',10,10,'reward','resolve','conversation','r1','resolve:race','${D1}')`)))
let st = res.map(x => x.code === 0 ? JSON.parse(x.out).status : 'error:' + x.err)
ok(st.filter(s => s === 'ok').length === 1 && st.filter(s => s === 'duplicate').length === 19, '20 parallel claims of the same work: one pays', st)
ok(wallet(C, U1).coins === 10, '…balance 10')
sql(`select public.powers_award('${C}','${U2}',90,0,'grant','grant',null,null,null,'${D1}')`) // U2: 90
res = await Promise.all(Array.from({ length: 20 }, (_, i) => sqlAsync(`select public.powers_buy('${C}','${U2}','spotlight',30,null,null,'{}'::jsonb,60,0,0,now(),0,'race-${i}','${D1}',0)`)))
st = res.map(x => x.code === 0 ? JSON.parse(x.out).status : 'error:' + x.err)
ok(st.filter(s => s === 'ok').length === 3 && st.filter(s => s === 'short').length === 17 && wallet(C, U2).coins === 0, '20 parallel 30-coin buys on 90 coins: exactly 3, balance 0', st)
sql(`select public.powers_award('${C}','${U1}',100,0,'grant','grant',null,null,null,'${D1}')`)
sql(`select public.powers_award('${C}','${U2}',100,0,'grant','grant',null,null,null,'${D1}')`)
res = await Promise.all(Array.from({ length: 30 }, (_, i) => sqlAsync(i % 2
  ? `select public.powers_gift('${C}','${U1}','${U2}',3,'x','ga-${i}','${D1}',0)`
  : `select public.powers_gift('${C}','${U2}','${U1}',2,'x','gb-${i}','${D1}',0)`)))
const errs = res.filter(x => x.code !== 0)
ok(errs.length === 0, '30 parallel gifts both ways: no deadlocks or errors', errs.map(e => e.err).slice(0, 2))
ok(wallet(C, U1).coins + wallet(C, U2).coins === 210, '…and not a coin made or lost', [wallet(C, U1).coins, wallet(C, U2).coins])
// (Company A's wallets were edited by hand above, to test spent coins and savers.)
const sumCheck = sql(`select bool_and(w.coins = l.c and w.xp = l.x) from public.powers_wallets w join (select company_id, user_id, sum(coins) c, sum(xp) x from public.powers_ledger group by 1,2) l using (company_id, user_id) where company_id in ('${B}','${C}')`)
ok(sumCheck === 't', 'every wallet equals the sum of its ledger (coins and XP)')

console.log('leaderboard')
let lb = JSON.parse(sql(`select coalesce(json_agg(t order by xp desc), '[]') from public.powers_leaderboard('${A}', '2026-11-16', '2026-11-17') t`))
const u1 = lb.find(x => x.user_id === U1)
ok(u1 && u1.xp === 12 && u1.resolve === 1 && !lb.some(x => x.user_id === U2), 'totals per person for the day: rewards only (grants and gifts don’t count)', lb)
lb = JSON.parse(sql(`select coalesce(json_agg(t), '[]') from public.powers_leaderboard('${A}', '2026-11-18', null) t`))
ok(lb.every(x => x.task === 0 || x.user_id === U3) && (lb.find(x => x.user_id === U3)?.task ?? 0) === 0, 'reversed rewards drop out of the totals', lb)
// Company B's only reward was reversed above; A's many rewards must not show up there.
ok(JSON.parse(sql(`select coalesce(json_agg(t), '[]') from public.powers_leaderboard('${B}', '2000-01-01', null) t`)).length === 0, 'another business’s totals never include this one’s')

console.log('time in the app')
const beat = (u, day = D1, gap = 50) => j(`select public.powers_beat('${A}','${u}','${day}',${gap})`)
let b1 = beat(U3)
ok(b1.minutes === 1 && b1.counted, 'the first minute of the day counts', b1)
let b2 = beat(U3)
ok(b2.minutes === 1 && !b2.counted, 'a second beat within the minute doesn’t (another tab, an eager page)', b2)
sql(`update public.powers_activity set last_beat_at = now() - interval '61 seconds' where user_id = '${U3}'`)
b2 = beat(U3)
ok(b2.minutes === 2 && b2.counted, 'a minute later it counts again', b2)
res = await Promise.all(Array.from({ length: 15 }, () => sqlAsync(`select public.powers_beat('${A}','${U2}','${D1}',50)`)))
st = res.map(x => x.code === 0 ? JSON.parse(x.out) : { err: x.err })
ok(st.filter(x => x.counted).length === 1 && Math.max(...st.map(x => x.minutes)) === 1, '15 tabs beating at once: one minute', st.filter(x => x.err || x.counted))
ok(beat(U3, '2026-11-17').minutes === 1, 'a new day starts from one')
ok(beat(U3, D1).minutes === 2, 'yesterday’s count stays with yesterday')
let other = j(`select public.powers_beat('${B}','${U3}','${D1}',50)`)
ok(other.minutes === 1, 'minutes are kept per business', other)

console.log('new rewards in the totals')
sql(`insert into public.powers_ledger (company_id,user_id,coins,xp,kind,rule,day) values ('${A}','${U2}',2,2,'reward','reply','2026-11-20'),('${A}','${U2}',2,2,'reward','reply','2026-11-20'),('${A}','${U2}',5,5,'reward','call','2026-11-20'),('${A}','${U2}',5,5,'reward','order','2026-11-20')`)
const nt = JSON.parse(sql(`select row_to_json(t) from public.powers_leaderboard('${A}','2026-11-20','2026-11-21','${U2}') t`))
ok(nt.reply === 2 && nt.call === 1 && nt.order === 1 && nt.xp === 14, 'replies, calls and orders are totalled', nt)
const CH2 = sql(`insert into public.powers_challenges (company_id, title, scope, metric, target) values ('${A}', 'Answer 10 calls', 'daily', 'call', 10) returning id`)
ok(/^[0-9a-f-]{36}$/.test(CH2), 'a challenge can count calls')
let badMetric = false
try { sql(`insert into public.powers_challenges (company_id, title, scope, metric, target) values ('${A}', 'x', 'daily', 'nonsense', 1)`) } catch { badMetric = true }
ok(badMetric, 'an unknown metric is refused')
for (const role of ['anon', 'authenticated']) {
  let denied = 0
  for (const q of [`select public.powers_beat('${A}','${U1}','${D1}',0)`, `select count(*) from public.powers_activity`]) { try { sqlFile(`set role ${role}; ${q};`) } catch { denied++ } }
  ok(denied === 2, `${role} can’t count minutes or read them`, denied)
}

console.log('challenges')
const CH = sql(`insert into public.powers_challenges (company_id, title, scope, metric, target) values ('${C}', 'Close 5 today', 'daily', 'resolve', 5) returning id`)
res = await Promise.all(Array.from({ length: 12 }, () => sqlAsync(`select public.powers_bump_progress('${C}','${CH}','${U1}','2026-11-16',5)`)))
st = res.map(x => x.code === 0 ? JSON.parse(x.out) : { err: x.err })
ok(st.filter(x => x.done_now).length === 1 && Math.max(...st.map(x => x.progress)) === 12, '12 parallel counts toward a target of 5: done exactly once, all counted', st.filter(x => x.done_now || x.err))
const team1 = j(`select public.powers_bump_progress('${C}','${CH}',null,'2026-11-16',2)`)
const team2 = j(`select public.powers_bump_progress('${C}','${CH}',null,'2026-11-16',2)`)
ok(team1.progress === 1 && team2.done_now === true, 'a team (shared) row counts separately from a person’s', [team1, team2])
ok(j(`select public.powers_bump_progress('${C}','${CH}','${U1}','2026-11-17',5)`).progress === 1, 'a new period starts from one')

run('postgres', `DROP DATABASE IF EXISTS ${DB}`)
console.log(fails ? `\n${fails} failed, ${passes} passed` : `\nall ${passes} passed`)
process.exit(fails ? 1 : 0)
