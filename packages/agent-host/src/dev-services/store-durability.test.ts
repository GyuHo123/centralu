/**
 * How the store survives being stopped at a bad moment and keeps its files small (#396).
 *
 * Real files in a temporary folder throughout: an in-memory database has no WAL and no second connection.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store.js'

const dirs: string[] = []
function storeFile(): string {
  const d = mkdtempSync(join(tmpdir(), 'cc-store-durable-'))
  dirs.push(d)
  const file = join(d, 'store.db')
  const s = new Store(file)
  s.addProject({ id: 'p1', path: '/tmp/p1', name: 'p1' })
  s.close()
  return file
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function raw<T>(file: string, f: (db: Database.Database) => T): T {
  const db = new Database(file)
  try {
    return f(db)
  } finally {
    db.close()
  }
}
const columns = (file: string) =>
  raw(file, (db) => (db.pragma('table_info(projects)') as { name: string }[]).map((c) => c.name))

type Step = { to: number; breaksOlderReaders: boolean; run: () => void }

describe('a migration step is one unit with the record that it ran', () => {
  it('a step that fails half way leaves neither its first change nor the new version', () => {
    const file = storeFile()
    const version = raw(file, (db) => db.pragma('user_version', { simple: true }) as number)
    const proto = Store.prototype as unknown as { migrationSteps: () => Step[] }
    const real = proto.migrationSteps
    vi.spyOn(proto, 'migrationSteps').mockImplementation(function (this: { db: Database.Database }) {
      const steps = real.call(this)
      return [
        ...steps,
        {
          to: version + 1,
          breaksOlderReaders: false,
          run: () => {
            // Two changes, and the host is stopped between them
            this.db.exec('ALTER TABLE projects ADD COLUMN half_a TEXT')
            throw new Error('stopped here')
          },
        },
      ]
    })

    expect(() => new Store(file)).toThrow('stopped here')

    expect(columns(file)).not.toContain('half_a')
    expect(raw(file, (db) => db.pragma('user_version', { simple: true }))).toBe(version)
  })
})

describe('the WAL', () => {
  it('is folded once the steps a swap left for later have run', () => {
    const file = storeFile()
    raw(file, (db) => db.pragma('user_version = 38'))
    const s = new Store(file, { swap: true })
    expect(s.deferredSteps).toEqual([40])

    s.runDeferred()

    expect(statSync(`${file}-wal`).size).toBe(0)
    s.close()
  })

  it('a checkpoint with another connection reading reports it did not fold, without waiting', () => {
    const file = storeFile()
    const s = new Store(file)
    s.addProject({ id: 'p2', path: '/tmp/p2', name: 'p2' })
    const reader = new Database(file, { readonly: true })
    try {
      reader.exec('BEGIN')
      reader.prepare('SELECT COUNT(*) FROM projects').get()
      const t0 = Date.now()
      expect(s.checkpoint()).toBe(false)
      expect(Date.now() - t0).toBeLessThan(1000)
      reader.exec('COMMIT')
    } finally {
      reader.close()
    }
    expect(s.checkpoint()).toBe(true)
    expect(statSync(`${file}-wal`).size).toBe(0)
    s.close()
  })

  it('the settings a file store depends on are set by the store itself', () => {
    const file = storeFile()
    const s = new Store(file)
    const db = (s as unknown as { db: Database.Database }).db
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('synchronous', { simple: true })).toBe(1)
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.pragma('journal_size_limit', { simple: true })).toBe(64 * 1024 * 1024)
    s.close()
  })
})
