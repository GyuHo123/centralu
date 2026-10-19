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
// 2 a wrong argument or an unreadable queue, 130 or 143 stopped by SIGINT or SIGTERM (the tick in
// flight finishes and is written down first).
//
// Exiting with the news would stop the queue until a session runs it again (#1236: the app went idle,
// the session that heard about a merge started no new watch, and three pull requests waited 6.5
// hours). So a watch that ends while pull requests still wait or run CI, anyone's, leaves
//
//   node .centralu/apps/project-board/bin/merge-queue.mjs drive --data <app data folder> [--hours <n>]
//
// behind, detached: it drives under the same lease until no pull request waits or runs CI (one that
// needs attention waits for a session, which runs a watch again), or after `--hours` (default 24).
// One runs at a time (`merge-queue.drive.json`); its errors go to `merge-queue.drive.log` there.
import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import { join } from 'node:path'
import { backgroundDriver, claimBackground, releaseBackground, releaseLease, readQueue, startDriver, TICK_MS } from '../queue-driver.mjs'
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
if (!ok || !opts.data || (opts.after !== null && !Number.isInteger(opts.after)) || !(opts.minutes > 0) || !(opts.hours > 0)) {
  console.error(USAGE)
  process.exit(2)
}

if (cmd === 'drive') drive()
else watch()

function drive() {
  // Another one drives already: nothing to do
  if (!claimBackground(opts.data)) process.exit(0)
  const driver = startDriver(opts.data, { holder: `drive:${process.pid}` })
  const until = Date.now() + opts.hours * 3_600_000
  let ending = false
  const end = async () => {
    if (ending) return
    ending = true
    await driver.stop()
    releaseBackground(opts.data)
    process.exit(0)
  }
  const look = () => {
    let q
    try {
      q = readQueue(opts.data)
    } catch (e) {
      console.error(e.message)
      return end()
    }
    if (!unattended(q) || Date.now() > until) return end()
    setTimeout(look, TICK_MS)
  }
  process.on('SIGINT', end)
  process.on('SIGTERM', end)
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
  let pid = backgroundDriver(opts.data)
  if (!pid) {
    let log = 'ignore'
    try {
      log = openSync(join(opts.data, 'merge-queue.drive.log'), 'a')
    } catch {
      // no log, then
    }
    const child = spawn(process.execPath, [process.argv[1], 'drive', '--data', opts.data], { detached: true, stdio: ['ignore', 'ignore', log], windowsHide: true })
    child.on('error', () => {})
    child.unref()
    pid = child.pid ?? null
  }
  return pid ? `The queue goes on in the background (pid ${pid}) while pull requests in it wait or run CI.` : null
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
  look()
}
