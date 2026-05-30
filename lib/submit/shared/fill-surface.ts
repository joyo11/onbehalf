/**
 * FillSurface — the abstraction that lets the same fill logic run
 * server-side (Playwright Locator) AND in the Chrome extension's
 * content script (live DOM HTMLElement).
 *
 * Phase 3 wave 2. The server keeps its existing greenhouse.ts path
 * for now — we don't touch 1300 lines under launch pressure. The
 * extension uses this surface directly via the DOM implementation
 * in chrome-extension/src/fill/dom-surface.js.
 *
 * Once the extension is proven on real users, the server filler
 * can collapse onto the same surface as a follow-up refactor.
 *
 * Why an interface and not duck-typed methods: TypeScript catches
 * "you forgot to wire one of the methods" at compile time. Worth
 * the generic.
 */

export interface FillSurface<E> {
  /** querySelectorAll — returns every visible-or-not match. Callers
   * filter via isVisible. */
  $$(selector: string): Promise<E[]>;

  /** Visibility check — width/height > 0, computed style not hidden,
   * not opacity 0. Both surfaces should agree on what "visible" means
   * to keep the heuristics portable. */
  isVisible(el: E): Promise<boolean>;

  /** Click. Wrap the underlying click so callers don't deal with
   * environment-specific options (timeout, force, etc.). */
  click(el: E): Promise<void>;

  /** Set the value of a text/textarea input and dispatch input/change
   * events so React frameworks pick the change up. */
  fill(el: E, value: string): Promise<void>;

  /** Upload a file. Pass raw bytes + a filename + the MIME type;
   * the surface assembles the File/Blob the environment expects. */
  setFile(el: E, filename: string, bytes: Uint8Array, mime: string): Promise<void>;

  /** Read the current value of an input/textarea. */
  getValue(el: E): Promise<string>;

  /** Read the innerText / textContent of an element. */
  getText(el: E): Promise<string>;

  /** Walk up the DOM to find a sensible label for this input:
   *   - <label for={id}>
   *   - closest <label>
   *   - aria-label
   *   - heading inside a near-by ancestor
   * Returns "" if nothing usable is found. */
  labelFor(el: E): Promise<string>;

  /** Get an attribute (name, id, type, placeholder, etc.). */
  attr(el: E, name: string): Promise<string | null>;
}
