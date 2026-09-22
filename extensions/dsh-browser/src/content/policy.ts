/**
 * Content-script operation policy: observation attributes and lighter input
 * behavior. Defaults prefer fewer page-visible fingerprints.
 *
 * @module
 */

/** Flags that shape how the content script touches the page. */
export interface ContentPolicy {
  /** Write `data-dsh-el` on inventoried elements. Off by default. */
  writeObservationAttribute: boolean
  /** Emit a short pointermove/mousemove trail before synthetic clicks. */
  pointerTrail: boolean
  /** Scroll only when the target is outside the viewport; use `nearest`. */
  minimalScroll: boolean
}

/** Built-in defaults after fingerprint cleanup (§1 + §2 high-value items). */
export const DEFAULT_CONTENT_POLICY: ContentPolicy = {
  writeObservationAttribute: false,
  pointerTrail: true,
  minimalScroll: true,
}

let policy: ContentPolicy = { ...DEFAULT_CONTENT_POLICY }

/** Current content-script policy. */
export function getContentPolicy(): ContentPolicy {
  return policy
}

/** Replace selected policy fields (messages from the background, or tests). */
export function setContentPolicy(next: Partial<ContentPolicy>): ContentPolicy {
  policy = {
    writeObservationAttribute: next.writeObservationAttribute ?? policy.writeObservationAttribute,
    pointerTrail: next.pointerTrail ?? policy.pointerTrail,
    minimalScroll: next.minimalScroll ?? policy.minimalScroll,
  }
  return policy
}

/** Restore built-in defaults (tests). */
export function resetContentPolicy(): void {
  policy = { ...DEFAULT_CONTENT_POLICY }
}

/** Map extension settings into a content policy. */
export function contentPolicyFromSettings(settings: {
  writeObservationAttribute?: boolean
  stealthMode?: boolean
}): ContentPolicy {
  const stealth = settings.stealthMode !== false
  return {
    writeObservationAttribute: settings.writeObservationAttribute === true,
    pointerTrail: stealth,
    minimalScroll: stealth,
  }
}
