/**
 * Whether the host's Modal is currently presented, plus the resolvers for
 * callers awaiting its NEXT full dismissal — see `waitClosed` below and the
 * comment on BottomSheet's `onDismissed`. Its state changes only through its
 * own methods (mirroring `SheetQueue`), never through a raw field write at
 * the call site: a `useRef`, or a plain object mutated directly by the
 * component, both trip the "no ref access / no useState mutation during
 * render" lint rules once threaded through a memoized value handed to
 * context — a class instance mutating itself from its own methods does not.
 *
 * Pure (no React, no React Native) so it can be tested directly — see
 * `sheetPresence.test.ts`.
 */
export class SheetPresence {
  private presented = false;
  private resolvers: Array<() => void> = [];

  markPresented(): void {
    this.presented = true;
  }

  markDismissed(): void {
    this.presented = false;
    const resolvers = this.resolvers;
    this.resolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  /**
   * Resolves once presented is false AND the caller confirms nothing is
   * queued. A call made while presented stays pending across any number of
   * further `markPresented()` calls in between — e.g. the destructive-row ->
   * confirm hand-off re-presents the same Modal with new content — because a
   * superseded request's promise is meant to complete only when whatever
   * superseded it eventually closes, not when it is merely replaced.
   */
  waitClosed(queueEmpty: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (queueEmpty && !this.presented) resolve();
      else this.resolvers.push(resolve);
    });
  }
}
