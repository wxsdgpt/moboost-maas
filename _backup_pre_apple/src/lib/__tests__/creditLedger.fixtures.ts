/**
 * creditLedger fixture tests (Phase 1 — onboarding/pricing cycle)
 * ============================================================================
 * In-memory fake SupabaseClient that emulates just enough of .from().insert/
 * select/update() to drive the append-only ledger through realistic scenarios:
 *
 *   - balance math with multiple grants
 *   - expired subscription credits drop out
 *   - FIFO by expiry on reserve (picks subscription first when present)
 *   - reserve fails on insufficient funds
 *   - commit / rollback flip reservation state correctly
 *   - rolled-back reserves return to the balance
 *   - bonus credits never expire
 *
 * Same pattern as projectPersistence.fixtures.ts — no test runner, exits 0/1.
 *
 * Run with:
 *     ./node_modules/.bin/sucrase-node src/lib/__tests__/creditLedger.fixtures.ts
 */
import {
  grantBonus,
  grantSubscription,
  grantTopup,
  getBalance,
  reserve,
  commit,
  rollback,
} from '../creditLedger'

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake Supabase client
// ─────────────────────────────────────────────────────────────────────────────
//
// We implement only the surface creditLedger.ts uses:
//   db.from(table).insert(row).select(cols?).single?()    → { data, error }
//   db.from(table).select(cols).eq(col, val)              → { data, error }
//   db.from(table).update(patch).eq(...).eq(...).eq(...)  → { data, error }
//
// Rows live in an array on a per-table Map.  `id` is autoassigned.

type Row = Record<string, any>

function makeFakeDb() {
  const tables = new Map<string, Row[]>()
  let idCounter = 0
  const nextId = () => `row-${++idCounter}`

  function from(table: string) {
    if (!tables.has(table)) tables.set(table, [])
    const rows = tables.get(table)!

    // ── INSERT builder ──────────────────────────────────────
    function insert(payload: Row | Row[]) {
      const arr = Array.isArray(payload) ? payload : [payload]
      const inserted: Row[] = arr.map((r) => {
        const row = {
          id: r.id ?? nextId(),
          created_at: r.created_at ?? new Date().toISOString(),
          ...r,
        }
        rows.push(row)
        return row
      })

      // Chainable .select().single() — we ignore column projection.
      const chain = {
        select(_cols?: string) {
          return {
            single() {
              return Promise.resolve({
                data: inserted[0] ?? null,
                error: null as any,
              })
            },
            // For inserts that don't use .single() — return the array.
            then(resolve: any) {
              resolve({ data: inserted, error: null as any })
            },
          }
        },
        // Bare insert without .select() — still resolves.
        then(resolve: any) {
          resolve({ data: inserted, error: null as any })
        },
      }
      return chain
    }

    // ── SELECT builder ──────────────────────────────────────
    function select(_cols: string) {
      const filters: Array<(r: Row) => boolean> = []
      const api: any = {
        eq(col: string, val: any) {
          filters.push((r) => r[col] === val)
          return api
        },
        maybeSingle() {
          const hit = rows.find((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: hit ?? null, error: null as any })
        },
        single() {
          const hit = rows.find((r) => filters.every((f) => f(r)))
          return Promise.resolve({
            data: hit ?? null,
            error: hit ? null : ({ message: 'not found' } as any),
          })
        },
        // Bare await — return all matches.
        then(resolve: any) {
          const matches = rows.filter((r) => filters.every((f) => f(r)))
          resolve({ data: matches, error: null as any })
        },
      }
      return api
    }

    // ── UPDATE builder ──────────────────────────────────────
    function update(patch: Row) {
      const filters: Array<(r: Row) => boolean> = []
      const api: any = {
        eq(col: string, val: any) {
          filters.push((r) => r[col] === val)
          return api
        },
        then(resolve: any) {
          let count = 0
          for (const r of rows) {
            if (filters.every((f) => f(r))) {
              Object.assign(r, patch)
              count++
            }
          }
          resolve({ data: { count }, error: null as any })
        },
      }
      return api
    }

    return { insert, select, update }
  }

  return {
    from,
    _raw: tables, // for inspection in tests
  } as any
}

// ─────────────────────────────────────────────────────────────────────────────
// Cases
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  name: string
  run: () => Promise<true | string>
}

const USER = 'user-abc'

const cases: Case[] = [
  {
    name: 'empty ledger → balance 0',
    run: async () => {
      const db = makeFakeDb()
      const b = await getBalance(db, USER)
      if (b.total !== 0) return `expected 0, got ${b.total}`
      if (b.bySource.subscription !== 0) return 'subscription != 0'
      if (b.bySource.bonus !== 0) return 'bonus != 0'
      if (b.bySource.topup !== 0) return 'topup != 0'
      return true
    },
  },
  {
    name: 'grantBonus adds to bonus bucket and total',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50, 'demo bonus')
      const b = await getBalance(db, USER)
      if (b.total !== 50) return `total expected 50, got ${b.total}`
      if (b.bySource.bonus !== 50) return `bonus expected 50, got ${b.bySource.bonus}`
      if (b.bySource.subscription !== 0) return 'subscription should be 0'
      return true
    },
  },
  {
    name: 'grantSubscription with future expiry contributes to balance',
    run: async () => {
      const db = makeFakeDb()
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000)
      await grantSubscription(db, USER, 100, future)
      const b = await getBalance(db, USER)
      if (b.total !== 100) return `total expected 100, got ${b.total}`
      if (b.bySource.subscription !== 100) return `sub expected 100, got ${b.bySource.subscription}`
      return true
    },
  },
  {
    name: 'expired subscription credits drop out of balance',
    run: async () => {
      const db = makeFakeDb()
      const past = new Date(Date.now() - 24 * 3600 * 1000)
      await grantSubscription(db, USER, 100, past)
      await grantBonus(db, USER, 50)
      const b = await getBalance(db, USER)
      if (b.total !== 50) return `total expected 50 (bonus only), got ${b.total}`
      if (b.bySource.subscription !== 0)
        return `sub should be 0 after expiry, got ${b.bySource.subscription}`
      if (b.bySource.bonus !== 50) return 'bonus should still be 50'
      return true
    },
  },
  {
    name: 'mixed grants sum correctly',
    run: async () => {
      const db = makeFakeDb()
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000)
      await grantSubscription(db, USER, 100, future)
      await grantBonus(db, USER, 50)
      await grantTopup(db, USER, 200)
      const b = await getBalance(db, USER)
      if (b.total !== 350) return `total expected 350, got ${b.total}`
      if (b.bySource.subscription !== 100) return 'sub wrong'
      if (b.bySource.bonus !== 50) return 'bonus wrong'
      if (b.bySource.topup !== 200) return 'topup wrong'
      return true
    },
  },
  {
    name: 'reserve reduces balance by amount',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      const resId = await reserve(db, USER, 10)
      if (!resId) return 'no reservation id returned'
      const b = await getBalance(db, USER)
      if (b.total !== 40) return `expected 40 after reserve, got ${b.total}`
      return true
    },
  },
  {
    name: 'reserve throws INSUFFICIENT_CREDITS when balance too low',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 5)
      try {
        await reserve(db, USER, 10)
        return 'should have thrown'
      } catch (e) {
        if ((e as Error).message !== 'INSUFFICIENT_CREDITS')
          return `wrong error: ${(e as Error).message}`
        return true
      }
    },
  },
  {
    name: 'reserve with no grants throws INSUFFICIENT_CREDITS',
    run: async () => {
      const db = makeFakeDb()
      try {
        await reserve(db, USER, 1)
        return 'should have thrown'
      } catch (e) {
        if ((e as Error).message !== 'INSUFFICIENT_CREDITS')
          return `wrong error: ${(e as Error).message}`
        return true
      }
    },
  },
  {
    name: 'FIFO by expiry: reserve labels subscription bucket when present',
    run: async () => {
      const db = makeFakeDb()
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000)
      await grantSubscription(db, USER, 100, future)
      await grantBonus(db, USER, 50)
      await grantTopup(db, USER, 200)
      const resId = await reserve(db, USER, 10)
      // Find the reserve row and check its bucket label
      const tables = (db as any)._raw as Map<string, Row[]>
      const rows = tables.get('credit_ledger')!
      const reserveRow = rows.find((r) => r.id === resId)!
      if (reserveRow.bucket !== 'subscription')
        return `expected subscription, got ${reserveRow.bucket}`
      return true
    },
  },
  {
    name: 'FIFO: prefers bonus over topup when no subscription',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      await grantTopup(db, USER, 200)
      const resId = await reserve(db, USER, 10)
      const tables = (db as any)._raw as Map<string, Row[]>
      const rows = tables.get('credit_ledger')!
      const reserveRow = rows.find((r) => r.id === resId)!
      if (reserveRow.bucket !== 'bonus')
        return `expected bonus before topup, got ${reserveRow.bucket}`
      return true
    },
  },
  {
    name: 'FIFO: falls back to topup when only topup exists',
    run: async () => {
      const db = makeFakeDb()
      await grantTopup(db, USER, 200)
      const resId = await reserve(db, USER, 10)
      const tables = (db as any)._raw as Map<string, Row[]>
      const rows = tables.get('credit_ledger')!
      const reserveRow = rows.find((r) => r.id === resId)!
      if (reserveRow.bucket !== 'topup')
        return `expected topup, got ${reserveRow.bucket}`
      return true
    },
  },
  {
    name: 'commit flips reserve → committed; balance stays reduced',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      const resId = await reserve(db, USER, 10)
      await commit(db, USER, resId)
      const b = await getBalance(db, USER)
      if (b.total !== 40) return `committed balance should be 40, got ${b.total}`
      const tables = (db as any)._raw as Map<string, Row[]>
      const reserveRow = tables.get('credit_ledger')!.find((r) => r.id === resId)!
      if (reserveRow.status !== 'committed')
        return `status expected committed, got ${reserveRow.status}`
      return true
    },
  },
  {
    name: 'rollback flips reserve → rolled_back; balance restored',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      const resId = await reserve(db, USER, 10)
      const mid = await getBalance(db, USER)
      if (mid.total !== 40) return `mid balance should be 40, got ${mid.total}`
      await rollback(db, USER, resId)
      const b = await getBalance(db, USER)
      if (b.total !== 50) return `rolled-back balance should be 50, got ${b.total}`
      return true
    },
  },
  {
    name: 'multiple reserves stack correctly',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      await reserve(db, USER, 10)
      await reserve(db, USER, 15)
      const b = await getBalance(db, USER)
      if (b.total !== 25) return `expected 25 after two reserves, got ${b.total}`
      return true
    },
  },
  {
    name: 'third reserve fails when it would exceed balance',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 50)
      await reserve(db, USER, 30)
      await reserve(db, USER, 15)
      try {
        await reserve(db, USER, 10)
        return 'should have thrown (balance=5 < 10)'
      } catch (e) {
        if ((e as Error).message !== 'INSUFFICIENT_CREDITS')
          return `wrong error: ${(e as Error).message}`
        return true
      }
    },
  },
  {
    name: 'bonus credits survive even after subscription period ends',
    run: async () => {
      const db = makeFakeDb()
      const past = new Date(Date.now() - 1000)
      await grantSubscription(db, USER, 100, past) // expired
      await grantBonus(db, USER, 50)               // never expires
      const b = await getBalance(db, USER)
      if (b.total !== 50) return `expected 50 (bonus only), got ${b.total}`
      // And we can still reserve against the bonus.
      const resId = await reserve(db, USER, 20)
      if (!resId) return 'reserve should have succeeded against bonus'
      const after = await getBalance(db, USER)
      if (after.total !== 30) return `expected 30 after reserve, got ${after.total}`
      return true
    },
  },
  {
    name: 'reserve at exactly balance succeeds, leaves zero',
    run: async () => {
      const db = makeFakeDb()
      await grantBonus(db, USER, 10)
      const resId = await reserve(db, USER, 10)
      if (!resId) return 'reserve at exact balance should succeed'
      const b = await getBalance(db, USER)
      if (b.total !== 0) return `expected 0, got ${b.total}`
      return true
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  let passed = 0
  let failed = 0
  for (const c of cases) {
    let result: true | string
    try {
      result = await c.run()
    } catch (e) {
      result = `THREW: ${(e as Error).message}`
    }
    if (result === true) {
      console.log(`  ✓ ${c.name}`)
      passed++
    } else {
      console.log(`  ✗ ${c.name}  →  ${result}`)
      failed++
    }
  }
  console.log(`\n${passed}/${passed + failed} passed${failed ? `, ${failed} failed` : ''}`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
