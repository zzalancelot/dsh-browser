/**
 * Stable element numbering for the interactive inventory.
 *
 * Numbers are the model's addressing scheme ("click 7"), so they must survive
 * re-snapshots as long as the element itself survives: ids are assigned once
 * per element (WeakMap) and only renumbered when the element set is
 * restructured. Optionally mirrors ids onto `data-dsh-el` when the content
 * policy enables observation attributes (off by default).
 *
 * @module
 */

import { getContentPolicy } from './policy.ts'

/** Attribute optionally written on inventoried elements (debug / observation). */
export const ID_ATTRIBUTE = 'data-dsh-el'

/**
 * Stable element → id registry. One instance per content-script lifetime.
 */
export class ElementIds {
  private readonly idByElement = new WeakMap<Element, number>()
  private readonly elementById = new Map<number, Element>()
  private nextId = 1

  /**
   * Reconcile the registry against the current element set: drop ids of
   * vanished elements, assign fresh ids to new ones.
   * @param elements - the current interactive inventory (document order).
   * @returns counts of added and removed elements.
   */
  assign(elements: Element[]): { added: number; removed: number } {
    const writeAttr = getContentPolicy().writeObservationAttribute
    const seen = new Set(elements)
    let removed = 0
    for (const [id, el] of this.elementById) {
      if (!seen.has(el)) {
        this.elementById.delete(id)
        this.idByElement.delete(el)
        if (el.hasAttribute(ID_ATTRIBUTE)) el.removeAttribute(ID_ATTRIBUTE)
        removed += 1
      }
    }
    let added = 0
    for (const el of elements) {
      if (!this.idByElement.has(el)) {
        const id = this.nextId
        this.nextId += 1
        this.idByElement.set(el, id)
        this.elementById.set(id, el)
        added += 1
      }
      const id = this.idByElement.get(el)
      if (id === undefined) continue
      if (writeAttr) {
        el.setAttribute(ID_ATTRIBUTE, String(id))
      } else if (el.hasAttribute(ID_ATTRIBUTE)) {
        el.removeAttribute(ID_ATTRIBUTE)
      }
    }
    return { added, removed }
  }

  /**
   * Resolve an element's stable id.
   * @param el - element.
   * @returns the assigned id, or undefined when not inventoried.
   */
  indexOf(el: Element): number | undefined {
    return this.idByElement.get(el)
  }

  /**
   * Resolve an id to its element.
   * @param index - inventory number.
   * @returns the element, or undefined when stale or removed.
   */
  elementByIndex(index: number): Element | undefined {
    return this.elementById.get(index)
  }
}
