import { afterEach, describe, expect, it } from 'vitest'
import {
  configureHostVisitQuotaForTests,
  consumeHostVisit,
  findHostVisitPolicy,
  hostnameMatchesPolicy,
  resetHostVisitQuotaTestHooks,
  type HostVisitQuotaStore,
} from '../src/background/host-visit-quota.ts'

function memoryStore(seed: Record<string, number[]> = {}): HostVisitQuotaStore {
  let state = structuredClone(seed)
  return {
    async read() {
      return structuredClone(state)
    },
    async write(value) {
      state = structuredClone(value)
    },
  }
}

describe('host-visit-quota', () => {
  afterEach(() => {
    resetHostVisitQuotaTestHooks()
  })

  it('matches customs host and subdomains', () => {
    expect(hostnameMatchesPolicy('stats.customs.gov.cn', 'stats.customs.gov.cn')).toBe(true)
    expect(hostnameMatchesPolicy('www.stats.customs.gov.cn', 'stats.customs.gov.cn')).toBe(true)
    expect(hostnameMatchesPolicy('example.com', 'stats.customs.gov.cn')).toBe(false)
    expect(findHostVisitPolicy('http://stats.customs.gov.cn/query')).toMatchObject({
      host: 'stats.customs.gov.cn',
      maxVisits: 5,
    })
  })

  it('allows other sites without consuming quota', async () => {
    configureHostVisitQuotaForTests({ store: memoryStore(), now: () => 1_000_000 })
    const decision = await consumeHostVisit('https://www.google.com/search?q=1')
    expect(decision.ok).toBe(true)
    expect(decision.host).toBeUndefined()
  })

  it('blocks the 6th customs visit within one hour', async () => {
    let now = 10_000_000
    configureHostVisitQuotaForTests({
      store: memoryStore(),
      now: () => now,
    })

    for (let i = 0; i < 5; i += 1) {
      const allowed = await consumeHostVisit('http://stats.customs.gov.cn/')
      expect(allowed.ok).toBe(true)
      now += 60_000
    }

    const denied = await consumeHostVisit('https://www.stats.customs.gov.cn/onlineQuery')
    expect(denied.ok).toBe(false)
    expect(denied.host).toBe('stats.customs.gov.cn')
    expect(denied.used).toBe(5)
    expect(denied.maxVisits).toBe(5)
    expect(denied.message).toContain('stats.customs.gov.cn')
    expect(denied.message).toContain('海关统计站')
  })

  it('allows visits again after the sliding window rolls forward', async () => {
    let now = 20_000_000
    configureHostVisitQuotaForTests({
      store: memoryStore({
        'stats.customs.gov.cn': [now - 3_600_000 + 1, now - 3_000_000, now - 2_000_000, now - 1_000_000, now - 500_000],
      }),
      now: () => now,
    })

    const stillBlocked = await consumeHostVisit('http://stats.customs.gov.cn/')
    expect(stillBlocked.ok).toBe(false)

    now += 2
    const allowed = await consumeHostVisit('http://stats.customs.gov.cn/')
    expect(allowed.ok).toBe(true)
    expect(allowed.used).toBe(5)
  })
})
