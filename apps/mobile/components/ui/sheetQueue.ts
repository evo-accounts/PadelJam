/**
 * One open request at a time; each resolves exactly once. Opening a new request while one is
 * open dismisses the old one (resolves null), which is what a user expects when a second sheet
 * is summoned over the first. Pure so it can be tested without React.
 */
export type SheetRequest<P> = { id: number; payload: P };

export class SheetQueue<P, R = string | null> {
  private nextId = 1;
  private open_: { id: number; payload: P; resolve: (v: R | null) => void } | null = null;
  private listeners = new Set<(r: SheetRequest<P> | null) => void>();
  // Cached so `current()` is referentially stable between emits — required by
  // useSyncExternalStore, whose getSnapshot must return the same reference
  // when nothing has changed or React re-renders in a loop.
  private snapshot: SheetRequest<P> | null = null;

  // Arrow properties, not methods: useSyncExternalStore(queue.subscribe, queue.current)
  // passes these detached from the instance, so they cannot rely on `this` binding.
  subscribe = (fn: (r: SheetRequest<P> | null) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  current = (): SheetRequest<P> | null => this.snapshot;

  open(payload: P): Promise<R | null> {
    if (this.open_) this.open_.resolve(null);
    const id = this.nextId++;
    return new Promise<R | null>((resolve) => {
      this.open_ = { id, payload, resolve };
      this.emit();
    });
  }

  resolve(id: number, value: R): void {
    if (!this.open_ || this.open_.id !== id) return;
    const { resolve } = this.open_;
    this.open_ = null;
    this.emit();
    resolve(value);
  }

  dismiss(id: number): void {
    if (!this.open_ || this.open_.id !== id) return;
    const { resolve } = this.open_;
    this.open_ = null;
    this.emit();
    resolve(null);
  }

  private emit() {
    this.snapshot = this.open_ ? { id: this.open_.id, payload: this.open_.payload } : null;
    for (const fn of this.listeners) fn(this.snapshot);
  }
}
