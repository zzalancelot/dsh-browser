// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { scoreAutomationLevel, type AutomationSignal } from '../src/content/automation-signals.ts'

function signal(partial: Partial<AutomationSignal> & Pick<AutomationSignal, 'id' | 'strength'>): AutomationSignal {
  return {
    category: 'vendor',
    detail: 'test',
    ...partial,
  }
}

describe('scoreAutomationLevel', () => {
  it('returns 1 when no signals match', () => {
    expect(scoreAutomationLevel({ signals: [], strongest: 'none' })).toBe(1)
  })

  it('steps up with weak then strong signals and challenge UI', () => {
    expect(scoreAutomationLevel({
      signals: [signal({ id: 'cookie:weak', strength: 'weak', category: 'token' })],
      strongest: 'weak',
    })).toBe(2)

    expect(scoreAutomationLevel({
      signals: [signal({ id: 'vendor:x', strength: 'strong' })],
      strongest: 'strong',
    })).toBe(3)

    expect(scoreAutomationLevel({
      signals: [
        signal({ id: 'vendor:a', strength: 'strong' }),
        signal({ id: 'vendor:b', strength: 'strong' }),
        signal({ id: 'challenge_ui:captcha', strength: 'strong', category: 'challenge_ui' }),
      ],
      strongest: 'strong',
    })).toBe(5)
  })
})
