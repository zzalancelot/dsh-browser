// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '../src/content/actions.ts'
import { ElementIds } from '../src/content/ids.ts'
import {
  contentPolicyFromSettings,
  resetContentPolicy,
  setContentPolicy,
} from '../src/content/policy.ts'
import { buildSnapshot, type SnapshotBudget } from '../src/content/snapshot.ts'

const BUDGET: SnapshotBudget = { maxItems: 40, maxForms: 20, maxHiddenForms: 40, maxChars: 8_000 }

function layout(el: Element, width = 80, height = 24, top = 10, left = 10): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height,
      top,
      left,
      bottom: top + height,
      right: left + width,
      x: left,
      y: top,
      toJSON() { return {} },
    }),
  })
}

afterEach(() => {
  resetContentPolicy()
  document.body.innerHTML = ''
})

describe('content policy defaults', () => {
  it('maps stealth settings onto pointer/scroll flags', () => {
    expect(contentPolicyFromSettings({})).toEqual({
      writeObservationAttribute: false,
      pointerTrail: true,
      minimalScroll: true,
    })
    expect(contentPolicyFromSettings({ stealthMode: false, writeObservationAttribute: true })).toEqual({
      writeObservationAttribute: true,
      pointerTrail: false,
      minimalScroll: false,
    })
  })
})

describe('stealth pointer trail', () => {
  it('emits pointermove/mousemove before mousedown across animation frames when enabled', async () => {
    document.body.innerHTML = `<button id="go">Go</button>`
    const button = document.getElementById('go') as HTMLButtonElement
    layout(button)
    const events: Array<{ type: string; at: number }> = []
    for (const type of ['pointermove', 'mousemove', 'mousedown', 'click'] as const) {
      button.addEventListener(type, () => {
        events.push({ type, at: performance.now() })
      })
    }

    setContentPolicy({ pointerTrail: true, minimalScroll: true })
    const ids = new ElementIds()
    const view = buildSnapshot(ids, { budget: BUDGET }, null)
    const item = view.items[0]!
    await runAction('browser_click', { index: item.index }, { ids, budget: BUDGET })

    const moves = events.filter((e) => e.type === 'mousemove' || e.type === 'pointermove')
    const down = events.find((e) => e.type === 'mousedown')
    expect(moves.length).toBeGreaterThanOrEqual(2)
    expect(down).toBeDefined()
    expect(Math.max(...moves.map((m) => m.at))).toBeLessThan(down!.at)
  })

  it('skips the trail when stealth pointerTrail is disabled', async () => {
    document.body.innerHTML = `<button id="go">Go</button>`
    const button = document.getElementById('go') as HTMLButtonElement
    layout(button)
    const types: string[] = []
    button.addEventListener('mousemove', () => { types.push('mousemove') })
    button.addEventListener('mousedown', () => { types.push('mousedown') })

    setContentPolicy({ pointerTrail: false })
    const ids = new ElementIds()
    const view = buildSnapshot(ids, { budget: BUDGET }, null)
    await runAction('browser_click', { index: view.items[0]!.index }, { ids, budget: BUDGET })
    expect(types).toEqual(['mousedown'])
  })
})

describe('minimal scroll', () => {
  it('does not force-center scroll when the target is already in view', async () => {
    document.body.innerHTML = `<button id="go">Go</button>`
    const button = document.getElementById('go') as HTMLButtonElement
    layout(button, 80, 24, 20, 20)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const scrollIntoView = vi.fn()
    button.scrollIntoView = scrollIntoView

    setContentPolicy({ pointerTrail: false, minimalScroll: true })
    const ids = new ElementIds()
    const view = buildSnapshot(ids, { budget: BUDGET }, null)
    await runAction('browser_click', { index: view.items[0]!.index }, { ids, budget: BUDGET })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
