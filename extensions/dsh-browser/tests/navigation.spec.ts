// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForNextDocumentReady, waitForTabStatusComplete } from '../src/background/navigation.ts'

type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void
let listeners: Set<Listener>

type TabUpdatedListener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void
let tabUpdatedListeners: Set<TabUpdatedListener>

beforeEach(() => {
  vi.useFakeTimers()
  listeners = new Set()
  tabUpdatedListeners = new Set()
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => { listeners.add(listener) },
        removeListener: (listener: Listener) => { listeners.delete(listener) },
      },
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({ id: tabId, status: 'loading' as const })),
      onUpdated: {
        addListener: (listener: TabUpdatedListener) => { tabUpdatedListeners.add(listener) },
        removeListener: (listener: TabUpdatedListener) => { tabUpdatedListeners.delete(listener) },
      },
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function emit(tabId: number, frameId: number, documentId: string, url = 'https://example.test/'): void {
  for (const listener of listeners) {
    listener({ type: 'DSH_CONTENT_READY' }, {
      tab: { id: tabId },
      frameId,
      documentId,
      url,
    } as chrome.runtime.MessageSender)
  }
}

describe('navigation readiness', () => {
  it('resolves only for a replacement document in the target frame', async () => {
    const wait = waitForNextDocumentReady(7, 2, 'old-document')
    let resolved = false
    void wait.ready.then(() => { resolved = true })

    emit(8, 2, 'other-tab')
    emit(7, 3, 'other-frame')
    emit(7, 2, 'old-document')
    await Promise.resolve()
    expect(resolved).toBe(false)

    emit(7, 2, 'new-document')
    await expect(wait.ready).resolves.toBe(true)
    expect(listeners.size).toBe(0)
  })

  it('cleans up when cancelled or timed out', async () => {
    const cancelled = waitForNextDocumentReady(7, 0, 'old-document')
    cancelled.cancel()
    await expect(cancelled.ready).resolves.toBe(false)
    expect(listeners.size).toBe(0)

    const timedOut = waitForNextDocumentReady(7, 0, 'old-document', undefined, 50)
    await vi.advanceTimersByTimeAsync(50)
    await expect(timedOut.ready).resolves.toBe(false)
    expect(listeners.size).toBe(0)
  })

  it('resolves when the tab status becomes complete', async () => {
    const get = vi.mocked(chrome.tabs.get)
    get.mockResolvedValueOnce({ id: 7, status: 'loading' } as chrome.tabs.Tab)
    get.mockResolvedValue({ id: 7, status: 'complete' } as chrome.tabs.Tab)

    const wait = waitForTabStatusComplete(7, undefined, 500)
    await vi.advanceTimersByTimeAsync(60)
    await expect(wait).resolves.toBe(true)
  })

  it('ignores a new Firefox tab\'s initial blank document without a baseline id', async () => {
    const wait = waitForNextDocumentReady(7, 0, undefined)
    let resolved = false
    void wait.ready.then(() => { resolved = true })

    emit(7, 0, 'blank-document', 'about:blank')
    await Promise.resolve()
    expect(resolved).toBe(false)

    emit(7, 0, 'destination-document', 'https://example.test/destination')
    await expect(wait.ready).resolves.toBe(true)
    expect(listeners.size).toBe(0)
  })
})
