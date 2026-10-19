#!/usr/bin/env node
// The merge queue's watch command (#956): a session runs it in the background after queue_merge, and
// it exits with the message when one of that session's items needs attention or lands, which wakes
// the session. While it waits it also drives the queue (the same lease as the board app's server), so
// the queue carries on when Centralu has stopped the idle app.
//
//   node .centralu/apps/project-board/bin/merge-queue.mjs watch --data <app data folder>
//        [--owner <name>] [--after <seq>] [--minutes <n>]
//
// queue_merge answers the whole command. Exit codes: 0 news without attention (merged, closed) or
// nothing left queued, 3 an item needs attention, 6 no news before the deadline (run it again),
// 2 a wrong argument or an unreadable queue, 130, 143 or 129 stopped by SIGINT, SIGTERM or SIGHUP (the
// tick in flight finishes and is written down first).
//
// Exiting with the news would stop the queue until a session runs it again (#1236: the app went idle,
// the session that heard about a merge started no new watch, and three pull requests waited 6.5
// hours). So a watch that ends (any exit but 2: its news, its deadline, SIGINT, SIGTERM or SIGHUP)
// while pull requests still wait or run CI, anyone's, leaves
//
//   node .centralu/apps/project-board/bin/merge-queue.mjs drive --data <app data folder> [--hours <n>]
//
// behind, detached: it drives under the same lease until no pull request waits or runs CI (one that
// needs attention waits for a session, which runs a watch again), after `--hours` (default 24), on
// SIGINT, SIGTERM or SIGHUP (`kill <pid>`; the tick in flight finishes first), or when the queue file
// does not read, always with exit 0. When this app's code changes under it (a pull or a branch
// switch), it starts a new one on the new code and ends. One runs at a time (`merge-queue.drive.json`:
// its pid, renewed every pass); what it says goes to `merge-queue.drive.log` there.
import { spawn } from 'node:child_process'
import { openSync, readdirSync, statSync, truncateSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backgroundDriver, beat, claimBackground, releaseBackground, releaseLease, readQueue, startDriver, TICK_MS } from '../queue-driver.mjs'
import { unattended, watchState } from '../queue.mjs'
import { shellQuote } from '../util.mjs'

const USAGE = [
  'Usage: node .centralu/apps/project-board/bin/merge-queue.mjs watch --data <folder> [--owner <name>] [--after <seq>] [--minutes <n>]',
  '       node .centralu/apps/project-board/bin/merge-queue.mjs drive --data <folder> [--hours <n>]',
].join('\n')
const args = process.argv.slice(2)
const cmd = args[0]
const opts = { data: null, owner: null, after: null, minutes: 100, hours: 24 }
let ok = cmd === 'watch' || cmd === 'drive'
for (let i = 1; ok && i < args.length; i += 2) {
  const [k, v] = [args[i], args[i + 1]]
  if (v === undefined) ok = false
  else if (k === '--data') opts.data = v
  else if (k === '--owner' && cmd === 'watch') opts.owner = v
  else if (k === '--after' && cmd === 'watch') opts.after = Number(v)
  else if (k === '--minutes' && cmd === 'watch') opts.minutes = Number(v)
  else if (k === '--hours' && cmd === 'drive') opts.hours = Number(v)
  else ok = false
}
if (!ok || !opts.data || (opts.after !== null && !Number.isInteger(opts.after)) || !(opts.minutes > 0) || !(opts.hours > 0 && Number.isFinite(opts.hours))) {
  console.error(USAGE)
  process.exit(2)
}

const LOG_FILE = 'merge-queue.drive.log'
const LOG_MAX = 1_000_000
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

if (cmd === 'drive') drive()
else watch()

/** This app's code as of now (each module's name, size and time): a driver ends when it changes. */
function sources() {
  const of = (dir) =>
    readdirSync(dir)
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => {
        const st = statSync(join(dir, n))
        return `${n}:${st.size}:${st.mtimeMs}`
      })
  try {
    return [...of(APP_DIR), ...of(join(APP_DIR, 'bin'))].join('|')
  } catch {
    return null
  }
}

/** Starts a background driver (`args` after `--data`); answers its pid, or null when it could not be started. */
function spawnDrive(args = []) {
  let log = 'ignore'
  try {
    const path = join(opts.data, LOG_FILE)
    let big = false
    try {
      big = statSync(path).size > LOG_MAX
    } catch {
      // no log yet
    }
    // Emptied in place and always appended to: a driver still writing through its own descriptor
    // (one ending after it started this one) then writes at the end, never over another's lines
    if (big) truncateSync(path)
    log = openSync(path, 'a')
  } catch {
    // no log, then
  }
  try {
    const child = spawn(process.execPath, [process.argv[1], 'drive', '--data', opts.data, ...args], { detached: true, stdio: ['ignore', 'ignore', log], windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return child.pid ?? null
  } catch {
    return null
  }
}

function drive() {
  // Another one drives already: nothing to do
  if (!claimBackground(opts.data)) process.exit(0)
  const until = Date.now() + opts.hours * 3_600_000
  console.error(`[merge-queue drive] pid ${process.pid} started at ${new Date().toISOString()}, until ${new Date(until).toISOString()}`)
  const driver = startDriver(opts.data, { holder: `drive:${process.pid}` })
  const code = sources()
  let seen = code
  let ending = false
  const end = async (why, { again = false } = {}) => {
    if (ending) return
    ending = true
    // Let go first, so a watch that ends meanwhile hands off to a new one
    releaseBackground(opts.data)
    await driver.stop()
    // The next one keeps this one's deadline: a restart is not a new day
    const hours = (until - Date.now()) / 3_600_000
    const next = again && hours > 0 ? spawnDrive(['--hours', String(hours)]) : null
    console.error(`[merge-queue drive] pid ${process.pid} ended at ${new Date().toISOString()}: ${why}${again ? (next ? `; pid ${next} goes on` : '; could not start the next one') : ''}`)
    process.exit(0)
  }
  const look = () => {
    if (ending) return
    let q
    try {
      q = readQueue(opts.data)
    } catch (e) {
      return end(e.message)
    }
    if (!unattended(q)) return end('nothing waits or runs CI')
    if (Date.now() > until) return end(`${opts.hours} hours`)
    // Changed, and the same for one pass (not a checkout half written): go on with the new code. Not
    // readable (the folder moved or gone) is no change: this one drives on from what it has loaded,
    // where a new one would not even start
    const now = sources()
    if (now !== null && now !== code && now === seen) return end("this app's code changed", { again: true })
    if (now !== null) seen = now
    if (!beat(opts.data)) return end('another background driver runs')
    setTimeout(look, TICK_MS)
  }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => end(sig))
  look()
}

/** Leaves the background driver when pull requests still wait or run CI; answers the line saying so. */
function handOff() {
  let q
  try {
    q = readQueue(opts.data)
  } catch {
    return null
  }
  if (!unattended(q)) return null
  const pid = backgroundDriver(opts.data) ?? spawnDrive()
  return pid
    ? `The queue goes on in the background (pid ${pid}) while pull requests in it wait or run CI; kill ${pid} stops it.`
    : 'Could not start the queue in the background: it stops until the board app runs or a watch command runs again.'
}

function watch() {
  let after
  try {
    after = opts.after ?? readQueue(opts.data).seq
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const again = (seq) => ['node', shellQuote(process.argv[1]), 'watch', '--data', shellQuote(opts.data), ...(opts.owner ? ['--owner', shellQuote(opts.owner)] : []), '--after', String(seq)].join(' ')
  const holder = `watch:${process.pid}`
  const driver = startDriver(opts.data, { holder })
  const deadline = Date.now() + opts.minutes * 60_000

  let finishing = false
  async function finish(code, lines) {
    if (finishing) return
    finishing = true
    // A merge in flight finishes and is written down before the process ends
    await driver.stop()
    releaseLease(opts.data, holder)
    const left = code === 2 ? null : handOff()
    for (const l of left ? [...lines, left] : lines) console.log(l)
    process.exit(code)
  }

  function look() {
    let q
    try {
      q = readQueue(opts.data)
    } catch (e) {
      console.error(e.message)
      return finish(2, [])
    }
    // A batch whose last member landed still has its end to do (and maybe a notice): wait for it
    const { news, left, batchPending, done } = watchState(q, { owner: opts.owner, after })
    const tail = left.length
      ? [`${left.length} still queued${opts.owner ? ` for ${opts.owner}` : ''}. To hear about them, run again in the background:`, again(q.seq)]
      : batchPending
        ? ['A batch is still finishing. To hear when it has, run again in the background:', again(q.seq)]
        : ['Nothing left queued.']
    const code = news.some((e) => e.kind === 'attention') ? 3 : 0
    if (done && news.length) return finish(code, [...news.map((e) => e.text), ...tail])
    if (done) return finish(0, [`Nothing queued${opts.owner ? ` for ${opts.owner}` : ''}.`])
    if (Date.now() > deadline) return news.length ? finish(code, [...news.map((e) => e.text), ...tail]) : finish(6, [`No news in ${opts.minutes} minutes.`, ...tail])
    // The driver's timer does not hold the process; this one does
    setTimeout(look, TICK_MS)
  }
  process.on('SIGINT', () => finish(130, []))
  process.on('SIGTERM', () => finish(143, []))
  // A terminal closed under it (a session's shell gone) ends it as the others do, handing off
  process.on('SIGHUP', () => finish(129, []))
  look()
}
