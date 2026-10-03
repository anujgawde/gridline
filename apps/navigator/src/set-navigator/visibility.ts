/* Tells each watched element when it enters or leaves the screen, through one
   IntersectionObserver for all of them.

   No root is given, so intersection is with the viewport — and an observer
   clips by every scrolling ancestor on the way, so a card scrolled out of the
   grid reads as off screen without the grid being named here. */
export class VisibilityWatcher {
  #callbacks = new Map<Element, (visible: boolean) => void>();
  #observer = new IntersectionObserver((entries) => {
    for (const entry of entries) this.#callbacks.get(entry.target)?.(entry.isIntersecting);
  });

  /* Returns a function that stops watching. */
  watch(element: Element, onChange: (visible: boolean) => void) {
    this.#callbacks.set(element, onChange);
    this.#observer.observe(element);
    return () => {
      this.#observer.unobserve(element);
      this.#callbacks.delete(element);
    };
  }

  disconnect() {
    this.#observer.disconnect();
    this.#callbacks.clear();
  }
}
