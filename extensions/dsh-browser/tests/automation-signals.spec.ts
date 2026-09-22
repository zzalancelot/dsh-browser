// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { collectAutomationSignals, renderAutomationSignals } from '../src/content/automation-signals.ts'

function clearCookies(): void {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0]
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  clearCookies()
  for (const key of ['zpFingerPrint', 'xhsFingerprint', 'FeCaptcha'] as const) {
    try {
      delete (window as unknown as Record<string, unknown>)[key]
    } catch {
      // Ignore non-configurable leftovers.
    }
  }
})

describe('collectAutomationSignals', () => {
  it('reports no signals on a plain page', () => {
    document.body.innerHTML = '<main><p>hello</p></main>'
    const report = collectAutomationSignals(document, window)
    expect(report.strongest).toBe('none')
    expect(report.signalCount).toBe(0)
    expect(renderAutomationSignals(report)).toContain('No client-visible vendor')
  })

  it('detects known vendor script URLs as strong signals', () => {
    document.body.innerHTML = '<script src="https://verify.snssdk.com/static/pc_slide.js"></script>'
    const report = collectAutomationSignals(document, window)
    expect(report.strongest).toBe('strong')
    expect(report.signals.some((s) => s.id === 'vendor:bytedance-turing')).toBe(true)
  })

  it('detects challenge cookies and fingerprint globals', () => {
    document.cookie = '__zp_stoken__=abc; path=/'
    Object.defineProperty(window, 'zpFingerPrint', { value: { version: 1 }, configurable: true })
    const report = collectAutomationSignals(document, window)
    expect(report.signals.some((s) => s.detail.includes('__zp_stoken__'))).toBe(true)
    expect(report.signals.some((s) => s.id === 'global:boss-fingerprint')).toBe(true)
    expect(report.strongest).toBe('strong')
  })

  it('detects challenge-like DOM and hidden blank iframes', () => {
    document.body.innerHTML = `
      <div id="secsdk-captcha-box"></div>
      <iframe name="zhipinFrame" src="about:blank" width="0" height="0" style="z-index:-100"></iframe>
    `
    const report = collectAutomationSignals(document, window)
    expect(report.signals.some((s) => s.id === 'dom:challenge-attr')).toBe(true)
    expect(report.signals.some((s) => s.id.startsWith('iframe:hidden-blank'))).toBe(true)
  })

  it('detects Xiaohongshu sdt script, cookies, fingerprint global, and xsec_token links', () => {
    document.body.innerHTML = `
      <script src="https://fe-static.xhscdn.com/as/v1/public/a9ef723c.js?s=sdt_source_init"></script>
      <script src="https://fe-video-qc.xhscdn.com/fe-platform/565a6c0720d87794072b272492de312ec8143fb7.js"></script>
      <a href="/explore/abc?xsec_token=AB_qq235&xsec_source=">note</a>
    `
    document.cookie = 'websectiga=tok; path=/'
    document.cookie = 'a1=device; path=/'
    Object.defineProperty(window, 'xhsFingerprint', { value: {}, configurable: true })
    Object.defineProperty(window, 'FeCaptcha', { value: { showFeedbackForm() {} }, configurable: true })

    const report = collectAutomationSignals(document, window)
    expect(report.signals.some((s) => s.id === 'vendor:xhs-sdt')).toBe(true)
    expect(report.signals.some((s) => s.id === 'vendor:xhs-fe-platform')).toBe(true)
    expect(report.signals.some((s) => s.id === 'cookie:xhs-websectiga:websectiga')).toBe(true)
    expect(report.signals.some((s) => s.id === 'cookie:xhs-a1:a1')).toBe(true)
    expect(report.signals.some((s) => s.id === 'global:xhs-fingerprint')).toBe(true)
    expect(report.signals.some((s) => s.id === 'global:xhs-fecaptcha')).toBe(true)
    expect(report.signals.some((s) => s.id === 'token:xsec_token')).toBe(true)
    expect(report.strongest).toBe('strong')
  })

  it('treats Xiaohongshu captcha / risk error URLs as challenge pages', () => {
    document.body.innerHTML = ''
    const report = collectAutomationSignals(document, window, {
      href: 'https://www.xiaohongshu.com/web-login/captcha?error_code=300031&verifyType=301',
      pathname: '/web-login/captcha',
      search: '?error_code=300031&verifyType=301',
    })
    expect(report.signals.some((s) => s.id === 'url:challenge')).toBe(true)
    expect(report.strongest).toBe('strong')
  })

  it('renders notes that avoid a binary verdict', () => {
    document.body.innerHTML = ''
    const text = renderAutomationSignals(collectAutomationSignals(document, window))
    expect(text).toContain('not a verdict')
    expect(text).toContain('absence of signals does not mean')
    expect(text).toContain('HttpOnly')
  })
})
