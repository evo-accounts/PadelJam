export type BannerState = { message: string; tone: 'error' | 'success' } | null;

/** Holds one banner at a time; auto-hides after `ms`, or on dismiss(). Pure, no React. */
export class BannerTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(private ms: number, private onChange: (s: BannerState) => void) {}

  show(message: string, tone: 'error' | 'success'): void {
    this.clear();
    this.onChange({ message, tone });
    this.handle = setTimeout(() => {
      this.handle = null;
      this.onChange(null);
    }, this.ms);
  }

  dismiss(): void {
    if (this.handle == null) return;
    this.clear();
    this.onChange(null);
  }

  private clear() {
    if (this.handle != null) clearTimeout(this.handle);
    this.handle = null;
  }
}
