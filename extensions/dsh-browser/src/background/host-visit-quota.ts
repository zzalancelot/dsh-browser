/**
 * Global per-host visit quotas for browser navigation tools.
 *
 * Shared across every Agent session in this browser profile so sensitive sites
 * (e.g. customs statistics) cannot be hammered after captcha is solvable.
 *
 * @module
 */

export interface HostVisitPolicy {
  /** Exact hostname or registrable parent (also matches subdomains). */
  host: string
  /** Sliding window length in milliseconds. */
  windowMs: number
  /** Maximum recorded visits inside the window. */
  maxVisits: number
}

export interface HostVisitDecision {
  ok: boolean
  /** Matched policy host when this URL is gated; undefined when unrestricted. */
  host?: string
  used?: number
  maxVisits?: number
  /** Milliseconds until the oldest visit in-window expires (deny only). */
  retryAfterMs?: number
  message?: string
}

export interface HostVisitQuotaStore {
  read(): Promise<Record<string, number[]>>
  write(value: Record<string, number[]>): Promise<void>
}

const STORAGE_KEY = 'dsh.browser.hostVisitQuota.v1'

/** Built-in global policies. Keep this list short and explicit. */
export const GLOBAL_HOST_VISIT_POLICIES: readonly HostVisitPolicy[] = [
  {
    host: 'stats.customs.gov.cn',
    windowMs: 60 * 60 * 1000,
    // Conservative: captcha is solvable, so volume — not ability — is the risk.
    maxVisits: 5,
  },
]

const memoryFallback: Record<string, number[]> = {}

const chromeLocalStore: HostVisitQuotaStore = {
  async read() {
    try {
      const area = (globalThis as { chrome?: { storage?: { local?: chrome.storage.StorageArea } } }).chrome?.storage?.local
      if (area === undefined) return { ...memoryFallback }
      const stored = await area.get(STORAGE_KEY)
      const value = stored[STORAGE_KEY]
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...memoryFallback }
      const out: Record<string, number[]> = {}
      for (const [host, stamps] of Object.entries(value as Record<string, unknown>)) {
        if (!Array.isArray(stamps)) continue
        out[host] = stamps.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      }
      return out
    } catch {
      return { ...memoryFallback }
    }
  },
  async write(value) {
    Object.keys(memoryFallback).forEach((key) => { delete memoryFallback[key] })
    Object.assign(memoryFallback, value)
    try {
      const area = (globalThis as { chrome?: { storage?: { local?: chrome.storage.StorageArea } } }).chrome?.storage?.local
      if (area === undefined) return
      await area.set({ [STORAGE_KEY]: value })
    } catch {
      // Memory fallback still holds the quota for this worker lifetime.
    }
  },
}

let activeStore: HostVisitQuotaStore = chromeLocalStore
let nowFn: () => number = () => Date.now()

/** Test seam: swap storage / clock without mocking chrome.storage. */
export function configureHostVisitQuotaForTests(options: {
  store?: HostVisitQuotaStore
  now?: () => number
  resetMemory?: boolean
} = {}): void {
  if (options.store !== undefined) activeStore = options.store
  if (options.now !== undefined) nowFn = options.now
  if (options.resetMemory === true) {
    Object.keys(memoryFallback).forEach((key) => { delete memoryFallback[key] })
  }
}

export function resetHostVisitQuotaTestHooks(): void {
  activeStore = chromeLocalStore
  nowFn = () => Date.now()
  Object.keys(memoryFallback).forEach((key) => { delete memoryFallback[key] })
}

/** Whether hostname is covered by a policy host (exact or subdomain). */
export function hostnameMatchesPolicy(hostname: string, policyHost: string): boolean {
  const host = hostname.trim().toLowerCase()
  const policy = policyHost.trim().toLowerCase()
  if (host === '' || policy === '') return false
  return host === policy || host.endsWith(`.${policy}`)
}

export function findHostVisitPolicy(
  url: string | URL,
  policies: readonly HostVisitPolicy[] = GLOBAL_HOST_VISIT_POLICIES,
): HostVisitPolicy | undefined {
  let hostname: string
  try {
    hostname = (typeof url === 'string' ? new URL(url) : url).hostname
  } catch {
    return undefined
  }
  return policies.find((policy) => hostnameMatchesPolicy(hostname, policy.host))
}

function prune(stamps: number[], now: number, windowMs: number): number[] {
  const floor = now - windowMs
  return stamps.filter((ts) => ts > floor).sort((a, b) => a - b)
}

/**
 * Inspect quota without consuming a visit.
 */
export async function inspectHostVisit(
  url: string | URL,
  policies: readonly HostVisitPolicy[] = GLOBAL_HOST_VISIT_POLICIES,
): Promise<HostVisitDecision> {
  const policy = findHostVisitPolicy(url, policies)
  if (policy === undefined) return { ok: true }

  const now = nowFn()
  const state = await activeStore.read()
  const used = prune(state[policy.host] ?? [], now, policy.windowMs)
  if (used.length < policy.maxVisits) {
    return { ok: true, host: policy.host, used: used.length, maxVisits: policy.maxVisits }
  }
  const oldest = used[0]!
  const retryAfterMs = Math.max(0, oldest + policy.windowMs - now)
  return {
    ok: false,
    host: policy.host,
    used: used.length,
    maxVisits: policy.maxVisits,
    retryAfterMs,
    message: formatDenyMessage(policy, used.length, retryAfterMs),
  }
}

/**
 * Consume one visit when the URL matches a global policy.
 * Call this immediately before committing navigation / open-tab / open-window.
 */
export async function consumeHostVisit(
  url: string | URL,
  policies: readonly HostVisitPolicy[] = GLOBAL_HOST_VISIT_POLICIES,
): Promise<HostVisitDecision> {
  const policy = findHostVisitPolicy(url, policies)
  if (policy === undefined) return { ok: true }

  const now = nowFn()
  const state = await activeStore.read()
  const used = prune(state[policy.host] ?? [], now, policy.windowMs)
  if (used.length >= policy.maxVisits) {
    const oldest = used[0]!
    const retryAfterMs = Math.max(0, oldest + policy.windowMs - now)
    // Persist pruned stamps so storage does not grow forever while denied.
    state[policy.host] = used
    await activeStore.write(state)
    return {
      ok: false,
      host: policy.host,
      used: used.length,
      maxVisits: policy.maxVisits,
      retryAfterMs,
      message: formatDenyMessage(policy, used.length, retryAfterMs),
    }
  }

  used.push(now)
  state[policy.host] = used
  await activeStore.write(state)
  return { ok: true, host: policy.host, used: used.length, maxVisits: policy.maxVisits }
}

function formatDenyMessage(policy: HostVisitPolicy, used: number, retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000))
  const windowMinutes = Math.round(policy.windowMs / 60_000)
  return (
    `Global host visit quota exceeded for ${policy.host}: `
    + `${used}/${policy.maxVisits} visits in the last ${windowMinutes} minute(s). `
    + `Do not open this site again for about ${minutes} minute(s) to avoid anti-bot detection. `
    + `请约 ${minutes} 分钟后再访问海关统计站，避免触发风控。`
  )
}
