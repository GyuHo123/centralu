/**
 * How the store survives being stopped at a bad moment and keeps its files small (#396).
 *
 * Real files in a temporary folder throughout: an in-memory database has no WAL and no second connection.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
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
