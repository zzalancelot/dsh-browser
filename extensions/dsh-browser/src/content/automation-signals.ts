/**
 * Heuristic probe for client-visible anti-automation / challenge capability.
 * Reports signals only — never claims the page "is" or "is not" protected.
 *
 * @module
 */

/** One observed capability signal. */
export interface AutomationSignal {
  id: string
  category: 'vendor' | 'challenge_ui' | 'token' | 'fingerprint' | 'environment'
  strength: 'weak' | 'strong'
  detail: string
}

/** Aggregate probe result for the current document. */
export interface AutomationSignalsReport {
  url: string
  signalCount: number
  strongest: 'none' | 'weak' | 'strong'
  signals: AutomationSignal[]
  notes: string[]
}

interface VendorPattern {
  id: string
  label: string
  /** Substrings matched against script src, iframe src, and Performance entries. */
  hosts: string[]
  strength: 'weak' | 'strong'
}

const VENDOR_PATTERNS: VendorPattern[] = [
  { id: 'bytedance-turing', label: 'ByteDance Turing / secsdk', hosts: ['verify.snssdk.com', 'secsdk-captcha', 'captcha.bytedance'], strength: 'strong' },
  { id: 'arkose', label: 'Arkose Labs', hosts: ['arkoselabs.com', 'funcaptcha.com'], strength: 'strong' },
  { id: 'castle', label: 'Castle', hosts: ['castle.io', 'crbcos.com'], strength: 'strong' },
  { id: 'socure', label: 'Socure Device Risk', hosts: ['socure.io', 'sdk.dv.socure'], strength: 'strong' },
  { id: 'geetest', label: 'Geetest', hosts: ['geetest.com', 'static.geetest', '/gt.js'], strength: 'strong' },
  { id: 'yidun', label: 'NetEase Yidun', hosts: ['yidun', 'captcha.dun.163', 'yidun-captcha'], strength: 'strong' },
  { id: 'aliyun-captcha', label: 'Aliyun captcha', hosts: ['captcha.alicdn', 'o.alicdn.com/captcha'], strength: 'strong' },
  { id: 'cloudflare', label: 'Cloudflare challenge / Turnstile', hosts: ['challenges.cloudflare.com', 'cf-challenge', 'turnstile'], strength: 'strong' },
  { id: 'recaptcha', label: 'Google reCAPTCHA', hosts: ['recaptcha', 'google.com/recaptcha', 'gstatic.com/recaptcha'], strength: 'strong' },
  { id: 'hcaptcha', label: 'hCaptcha', hosts: ['hcaptcha.com', 'newassets.hcaptcha'], strength: 'strong' },
  { id: 'datadome', label: 'DataDome', hosts: ['datadome.co', 'dd.js'], strength: 'strong' },
  { id: 'perimeterx', label: 'PerimeterX / HUMAN', hosts: ['perimeterx', 'px-cdn', 'humansecurity'], strength: 'strong' },
  { id: 'kasada', label: 'Kasada', hosts: ['kasada.io', 'kpsdk'], strength: 'strong' },
  { id: 'boss-verify', label: 'BOSS Zhipin verify / security-js', hosts: ['verify-sdk', 'security-js', 'static.zhipin.com/library/js/plugins/gt'], strength: 'strong' },
  { id: 'xhs-sdt', label: 'Xiaohongshu sdt security script', hosts: ['sdt_source_init'], strength: 'strong' },
  { id: 'xhs-redcaptcha', label: 'Xiaohongshu redcaptcha', hosts: ['/api/redcaptcha', 'redcaptcha'], strength: 'strong' },
  { id: 'xhs-fe-platform', label: 'Xiaohongshu fe-platform fingerprint CDN', hosts: ['fe-video-qc.xhscdn.com/fe-platform/'], strength: 'weak' },
]

const COOKIE_PATTERNS: Array<{ id: string; name: RegExp; label: string; strength: 'weak' | 'strong' }> = [
  { id: 'boss-stoken', name: /^__zp_stoken__$/i, label: 'BOSS __zp_stoken__ challenge cookie', strength: 'strong' },
  { id: 'boss-seed', name: /^__zp_s(seed|name|ts)__$/i, label: 'BOSS security-js seed cookie', strength: 'strong' },
  { id: 'bytedance-fp', name: /^s_v_web_id$/i, label: 'ByteDance s_v_web_id device id cookie', strength: 'weak' },
  { id: 'cf-clearance', name: /^cf_clearance$/i, label: 'Cloudflare cf_clearance cookie', strength: 'strong' },
  { id: 'xhs-websectiga', name: /^websectiga$/i, label: 'Xiaohongshu websectiga device/security cookie', strength: 'strong' },
  { id: 'xhs-sec-poison', name: /^sec_poison_id$/i, label: 'Xiaohongshu sec_poison_id cookie', strength: 'strong' },
  { id: 'xhs-a1', name: /^a1$/i, label: 'Xiaohongshu a1 device id cookie', strength: 'weak' },
  { id: 'xhs-webid', name: /^webId$/i, label: 'Xiaohongshu webId cookie', strength: 'weak' },
  { id: 'aliyun-acw', name: /^acw_tc$/i, label: 'Aliyun WAF acw_tc cookie (often HttpOnly; reported only when readable)', strength: 'strong' },
]

const GLOBAL_PATTERNS: Array<{ id: string; key: string; label: string; strength: 'weak' | 'strong' }> = [
  { id: 'boss-fingerprint', key: 'zpFingerPrint', label: 'window.zpFingerPrint device fingerprint API', strength: 'strong' },
  { id: 'turnstile-global', key: 'turnstile', label: 'window.turnstile (Cloudflare Turnstile)', strength: 'strong' },
  { id: 'grecaptcha', key: 'grecaptcha', label: 'window.grecaptcha', strength: 'strong' },
  { id: 'hcaptcha-global', key: 'hcaptcha', label: 'window.hcaptcha', strength: 'strong' },
  { id: 'xhs-fingerprint', key: 'xhsFingerprint', label: 'window.xhsFingerprint device fingerprint API', strength: 'strong' },
  { id: 'xhs-fecaptcha', key: 'FeCaptcha', label: 'window.FeCaptcha (Xiaohongshu captcha UI)', strength: 'strong' },
]

const CHALLENGE_URL = /security-check|verify-slider|\/captcha|challenge|cdn-cgi\/challenge|cf-browser-verification|web-login\/captcha|redcaptcha|error_code=30003/i

const CHALLENGE_ATTR = /captcha|verify-slider|slide-verify|arkose|geetest|recaptcha|hcaptcha|turnstile|secsdk|redcaptcha|fecaptcha|xsec/i

const CONTENT_TOKEN_HREF = /[?&]xsec_token=/i

/**
 * Scan the current document for client-visible anti-automation signals.
 * Safe to call from the content script; never mutates the page.
 *
 * @param options.href - optional document URL override (tests / non-standard documents).
 */
export function collectAutomationSignals(
  doc: Document = document,
  win: Window & typeof globalThis = window,
  options?: { href?: string; pathname?: string; search?: string },
): AutomationSignalsReport {
  const signals: AutomationSignal[] = []
  const seen = new Set<string>()
  const add = (signal: AutomationSignal): void => {
    if (seen.has(signal.id)) return
    seen.add(signal.id)
    signals.push(signal)
  }

  const resourceUrls = collectResourceUrls(doc, win)
  for (const vendor of VENDOR_PATTERNS) {
    const hit = resourceUrls.find((url) => vendor.hosts.some((host) => url.toLowerCase().includes(host.toLowerCase())))
    if (hit !== undefined) {
      add({
        id: `vendor:${vendor.id}`,
        category: 'vendor',
        strength: vendor.strength,
        detail: `${vendor.label} resource: ${truncateUrl(hit)}`,
      })
    }
  }

  for (const pattern of COOKIE_PATTERNS) {
    for (const name of cookieNames(doc)) {
      if (pattern.name.test(name)) {
        add({
          id: `cookie:${pattern.id}:${name}`,
          category: 'token',
          strength: pattern.strength,
          detail: pattern.label,
        })
      }
    }
  }

  for (const pattern of GLOBAL_PATTERNS) {
    try {
      if ((win as unknown as Record<string, unknown>)[pattern.key] !== undefined) {
        add({
          id: `global:${pattern.id}`,
          category: 'fingerprint',
          strength: pattern.strength,
          detail: pattern.label,
        })
      }
    } catch {
      // Cross-origin or revoked access; skip.
    }
  }

  const href = options?.href ?? doc.location?.href ?? ''
  const pathname = options?.pathname ?? doc.location?.pathname ?? ''
  const search = options?.search ?? doc.location?.search ?? ''
  if (CHALLENGE_URL.test(href) || CHALLENGE_URL.test(pathname) || CHALLENGE_URL.test(search)) {
    add({
      id: 'url:challenge',
      category: 'challenge_ui',
      strength: 'strong',
      detail: `Document URL looks like a challenge / security-check page: ${truncateUrl(href)}`,
    })
  }

  const challengeHit = findChallengeDomHint(doc)
  if (challengeHit !== undefined) add(challengeHit)

  const contentToken = findContentAccessToken(doc, href, search)
  if (contentToken !== undefined) add(contentToken)

  for (const iframe of findChallengeIframes(doc)) {
    add(iframe)
  }

  try {
    if (win.navigator.webdriver === true) {
      add({
        id: 'env:webdriver',
        category: 'environment',
        strength: 'weak',
        detail: 'navigator.webdriver is true in this browsing context (environment flag, not page vendor logic)',
      })
    }
  } catch {
    // Ignore.
  }

  const strongest = signals.some((s) => s.strength === 'strong')
    ? 'strong'
    : signals.length > 0 ? 'weak' : 'none'

  return {
    url: href,
    signalCount: signals.length,
    strongest,
    signals,
    notes: [
      'Heuristic client-side probe only; absence of signals does not mean the site has no server-side anti-automation.',
      'Does not read response CSP headers, HttpOnly cookies (e.g. acw_tc), request-signing headers (e.g. X-s), or obfuscated bundle internals (e.g. isRiskWindow).',
      'Do not treat this as a bypass capability check.',
    ],
  }
}

/** Render the report as model-facing structured text. */
export function renderAutomationSignals(report: AutomationSignalsReport): string {
  const lines: string[] = [
    'Automation capability signals (heuristic; not a verdict)',
    `URL: ${report.url || '(unknown)'}`,
    `Strongest observed: ${report.strongest}`,
    `Signal count: ${report.signalCount}`,
  ]
  if (report.signals.length === 0) {
    lines.push('', 'No client-visible vendor / challenge / token signals matched the built-in patterns.')
  } else {
    lines.push('', 'Signals:')
    for (const signal of report.signals) {
      lines.push(`- [${signal.strength}/${signal.category}] ${signal.detail}`)
    }
  }
  lines.push('', 'Notes:')
  for (const note of report.notes) {
    lines.push(`- ${note}`)
  }
  return lines.join('\n')
}

function collectResourceUrls(doc: Document, win: Window & typeof globalThis): string[] {
  const urls = new Set<string>()
  for (const el of Array.from(doc.querySelectorAll('script[src], iframe[src], link[href], img[src]'))) {
    const value = el.getAttribute('src') ?? el.getAttribute('href')
    if (value !== null && value !== '') urls.add(value)
  }
  try {
    const entries = win.performance?.getEntriesByType?.('resource') ?? []
    for (const entry of entries) {
      if (entry.name) urls.add(entry.name)
    }
  } catch {
    // Ignore performance access failures.
  }
  return [...urls]
}

function cookieNames(doc: Document): string[] {
  try {
    const raw = doc.cookie ?? ''
    if (raw.trim() === '') return []
    return raw.split(';').map((part) => part.trim().split('=')[0] ?? '').filter((name) => name !== '')
  } catch {
    return []
  }
}

function findChallengeDomHint(doc: Document): AutomationSignal | undefined {
  for (const el of Array.from(doc.querySelectorAll('[id], [class], iframe[src]'))) {
    const id = el.getAttribute('id') ?? ''
    const className = el.getAttribute('class') ?? ''
    const src = el.getAttribute('src') ?? ''
    const haystack = `${id} ${className} ${src}`
    if (!CHALLENGE_ATTR.test(haystack)) continue
    const tag = el.tagName.toLowerCase()
    return {
      id: 'dom:challenge-attr',
      category: 'challenge_ui',
      strength: 'strong',
      detail: `Challenge-like ${tag} attributes matched (${truncateUrl(haystack.trim().slice(0, 80))})`,
    }
  }
  return undefined
}

/** Xiaohongshu-style content access tokens embedded in note/user links. */
function findContentAccessToken(
  doc: Document,
  href: string,
  search: string,
): AutomationSignal | undefined {
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const link = anchor.getAttribute('href') ?? ''
    if (!CONTENT_TOKEN_HREF.test(link)) continue
    return {
      id: 'token:xsec_token',
      category: 'token',
      strength: 'strong',
      detail: `Link carries xsec_token content-access parameter: ${truncateUrl(link)}`,
    }
  }
  if (CONTENT_TOKEN_HREF.test(search) || CONTENT_TOKEN_HREF.test(href) || /(?:^\?|&)xsec_token=/i.test(search)) {
    return {
      id: 'token:xsec_token-url',
      category: 'token',
      strength: 'strong',
      detail: `Document URL carries xsec_token: ${truncateUrl(href || search)}`,
    }
  }
  return undefined
}

function findChallengeIframes(doc: Document): AutomationSignal[] {
  const out: AutomationSignal[] = []
  for (const iframe of Array.from(doc.querySelectorAll('iframe'))) {
    const name = iframe.getAttribute('name') ?? ''
    const src = iframe.getAttribute('src') ?? ''
    const width = iframe.getAttribute('width') ?? ''
    const height = iframe.getAttribute('height') ?? ''
    const style = iframe.getAttribute('style') ?? ''
    const hiddenBlank = (src === 'about:blank' || src === '')
      && (
        name.toLowerCase().includes('zhipin')
        || /z-index\s*:\s*-/i.test(style)
        || (width === '0' && height === '0')
        || /width\s*:\s*0|height\s*:\s*0|display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)
      )
    if (hiddenBlank) {
      out.push({
        id: `iframe:hidden-blank:${name || 'unnamed'}`,
        category: 'token',
        strength: 'weak',
        detail: `Hidden about:blank iframe${name !== '' ? ` name="${name}"` : ''} (common challenge/token container pattern)`,
      })
    }
  }
  return out.slice(0, 3)
}

function truncateUrl(url: string): string {
  return url.length <= 160 ? url : `${url.slice(0, 157)}...`
}
