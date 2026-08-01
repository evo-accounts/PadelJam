import { light } from '@padel/ui';
import type { Meta, StoryObj } from '@storybook/nextjs';

/**
 * Contrast audit of the LIGHT scheme, rendered as the app actually renders it.
 *
 * Not a synthetic demo: every line below is markup copied from a real screen.
 * `text-success` is what four settings pages use to confirm a save; the muted
 * border pairs are what every Card draws.
 *
 * The point is that a token can be "correct" against the pair its NAME promises
 * and still fail in the pairing that ships. `success`/`success-foreground`
 * measures 3.03 — but nothing puts white on a success fill. What shipped was
 * `text-success` on the page, at 2.89, which a swatch sheet never reveals.
 *
 * Fixed by giving text its own token rather than darkening the shared one: the
 * fills keep the values approved at the screenshot review, and
 * `success-strong` / `warning-strong` carry the text. Both rows are kept below
 * so the difference stays visible and the regression stays obvious.
 */

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function lum(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!);
}

const ratio = (a: string, b: string) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

function Verdict({ r }: { r: number }) {
  const [label, cls] =
    r >= 4.5 ? ['passes AA', 'bg-secondary text-secondary-foreground']
    : r >= 3 ? ['large text only', 'bg-warning text-warning-foreground']
    : ['FAILS', 'bg-destructive text-white'];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {r.toFixed(2)} — {label}
    </span>
  );
}

function Row({ label, sample, fg, bg }: { label: string; sample: React.ReactNode; fg: string; bg: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-3">
      <div className="flex flex-col gap-1">
        {sample}
        <code className="text-xs text-muted-foreground">{label}</code>
      </div>
      <Verdict r={ratio(fg, bg)} />
    </div>
  );
}

function ContrastSheet() {
  return (
    <div className="bg-background p-6">
      <h1 className="mb-1 text-3xl font-bold text-foreground">Light scheme — contrast</h1>
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
        Every sample below is markup taken from a real screen. WCAG AA needs 4.5 for body
        text, 3.0 for large text, and 3.0 for a UI element to be perceivable at all.
      </p>

      <h2 className="mb-2 text-xl font-semibold text-foreground">Status text on the page</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        These are confirmation and warning messages — small body text, so the bar is 4.5.
      </p>
      <div className="mb-10">
        <Row
          label="BEFORE — text-success (the fill token) used as text"
          sample={<p className="text-sm text-success">Password changed</p>}
          fg={light.success}
          bg={light.background}
        />
        <Row
          label="AFTER — text-success-strong, what the five call sites use now"
          sample={<p className="text-sm text-success-strong">Password changed</p>}
          fg={light.successStrong}
          bg={light.background}
        />
        <Row
          label="BEFORE — text-warning (the fill token) used as text"
          sample={<p className="text-sm text-warning">Your session expires soon</p>}
          fg={light.warning}
          bg={light.background}
        />
        <Row
          label="AFTER — text-warning-strong"
          sample={<p className="text-sm text-warning-strong">Your session expires soon</p>}
          fg={light.warningStrong}
          bg={light.background}
        />
        <Row
          label="BEFORE — text-info (the fill token) used as text"
          sample={<p className="text-sm text-info">Six players confirmed</p>}
          fg={light.info}
          bg={light.background}
        />
        <Row
          label="AFTER — text-info-strong. Preventive: nothing uses info as text today, so this fixes no live screen — it exists so the next one starts correct."
          sample={<p className="text-sm text-info-strong">Six players confirmed</p>}
          fg={light.infoStrong}
          bg={light.background}
        />
        <Row
          label="text-destructive on background — for comparison, this one is fine"
          sample={<p className="text-sm text-destructive">That number is too short</p>}
          fg={light.destructive}
          bg={light.background}
        />
      </div>

      <h2 className="mb-2 text-xl font-semibold text-foreground">Surfaces and borders</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Not text — the bar is 3.0 for &ldquo;can you see this element at all&rdquo;. This is the
        strict-canon decision, quantified: the card below is drawn with a real border.
      </p>
      <div className="mb-6">
        <Row
          label="border on card — every Card in the app"
          sample={
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <span className="text-sm text-card-foreground">A bordered card</span>
            </div>
          }
          fg={light.border}
          bg={light.card}
        />
        <Row
          label="card on background"
          sample={<div className="rounded-lg bg-card px-4 py-3 text-sm">A card, no border</div>}
          fg={light.card}
          bg={light.background}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Design System/Contrast',
  component: ContrastSheet,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ContrastSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LightScheme: Story = {};
