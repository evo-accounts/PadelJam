import type { SemanticScheme } from '@padel/ui';
import {
  dark,
  light,
  radius as radiusScale,
  space as spaceScale,
  text as textScale,
} from '@padel/ui';
import type { Meta, StoryObj } from '@storybook/nextjs';

/**
 * The shared design tokens, as WEB resolves them.
 *
 * Every swatch shows two things side by side: the CSS custom property the app
 * actually paints with, and the TypeScript value `packages/ui` hands to mobile.
 * They come from different places at runtime — the CSS is generated into
 * `tokens.generated.css`, the TS is imported directly — so showing both turns
 * this page into a live parity check rather than a claim. If the generator ever
 * drifts from its source, the two halves of a swatch stop matching and you can
 * see it.
 *
 * `pnpm tokens:check` already fails CI on that drift. This is the version a
 * designer can look at.
 */

/**
 * `primary` -> `--primary`, `chart1` -> `--chart-1`.
 *
 * Mirrors `cssVarName` in `packages/ui/src/generate/css.ts`, which is
 * deliberately NOT exported from the package root — it is build tooling for
 * `scripts/tokens.mjs`, and re-exporting it would drag that module's `.ts`
 * import extensions into every consumer's typecheck. The digit boundary is the
 * only non-obvious part, and it is the reason this is not just a camel-to-kebab
 * one-liner.
 */
function cssVar(name: string): string {
  return (
    '--' +
    name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([a-zA-Z])(\d)/g, '$1-$2')
      .toLowerCase()
  );
}

const NAMES = Object.keys(light) as (keyof typeof light)[];

// `SemanticScheme` rather than `typeof light`: both schemes are `as const`, so
// their values are literal types and `dark` is not assignable to `typeof light`.
// The package exports the widened shape for exactly this reason.
function Swatch({ name, scheme }: { name: keyof typeof light; scheme: SemanticScheme }) {
  const v = cssVar(name);
  return (
    <div className="flex flex-col gap-1">
      {/* Painted from the CSS variable — i.e. whatever the app would paint. */}
      <div
        className="h-14 w-full rounded-md border border-border"
        style={{ background: `var(${v})` }}
      />
      <code className="text-xs text-muted-foreground">{v}</code>
      <div className="flex items-center gap-1">
        {/* Painted from the TypeScript value mobile consumes. A mismatch with
            the block above is exactly the drift this page exists to reveal. */}
        <span
          className="inline-block size-3 rounded-sm border border-border"
          style={{ background: scheme[name] }}
        />
        <code className="text-xs text-muted-foreground">{scheme[name]}</code>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function TokenSheet({ mode = 'light' }: { mode?: 'light' | 'dark' }) {
  const scheme = mode === 'dark' ? dark : light;
  return (
    // The `dark` class is what flips the CSS variables — the same switch the app
    // would use. So the swatches above and below stay honest: the top half reads
    // whatever `.dark` resolved, the bottom half reads the TS scheme by name.
    <div className={`${mode === 'dark' ? 'dark ' : ''}bg-background p-6`}>
      <h1 className="mb-1 text-3xl font-bold text-foreground">Design tokens</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Generated from <code>packages/ui/src/tokens/*.ts</code>. Mobile reads the same
        values through <code>apps/mobile/theme</code>. Each swatch shows the CSS variable
        above and the TypeScript value below — they must match.
      </p>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {NAMES.map((n) => (
            <Swatch key={n} name={n} scheme={scheme} />
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-3">
          {(Object.keys(textScale) as (keyof typeof textScale)[]).map((k) => (
            <div key={k} className="flex items-baseline gap-4">
              <code className="w-16 shrink-0 text-xs text-muted-foreground">{k}</code>
              <span
                className="text-foreground"
                style={{
                  fontSize: textScale[k].size,
                  lineHeight: `${textScale[k].lineHeight}px`,
                }}
              >
                The quick brown fox — {textScale[k].size}/{textScale[k].lineHeight}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <div className="flex flex-wrap items-end gap-4">
          {(Object.keys(radiusScale) as (keyof typeof radiusScale)[])
            .filter((k) => k !== 'full')
            .map((k) => (
              <div key={k} className="flex flex-col items-center gap-1">
                <div
                  className="size-16 border border-border bg-muted"
                  style={{ borderRadius: radiusScale[k] }}
                />
                <code className="text-xs text-muted-foreground">
                  {k} {radiusScale[k]}
                </code>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div className="flex flex-col gap-1">
          {(Object.keys(spaceScale) as unknown as (keyof typeof spaceScale)[])
            .filter((k) => Number(k) > 0)
            .map((k) => (
              <div key={String(k)} className="flex items-center gap-3">
                <code className="w-8 shrink-0 text-xs text-muted-foreground">{String(k)}</code>
                <div
                  className="h-3 rounded-sm bg-primary"
                  style={{ width: spaceScale[k] * 4 }}
                />
                <code className="text-xs text-muted-foreground">{spaceScale[k]}px</code>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

const meta = {
  title: 'Design System/Tokens',
  component: TokenSheet,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TokenSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tokens: Story = {};

/**
 * The dark scheme, repaired.
 *
 * Before this, `primary` was the SAME colour as `background` (contrast 1.00), so
 * a primary button was invisible on the page — plus four more defects a WCAG
 * pass turned up. Rendering both schemes side by side in the same place is what
 * makes that checkable by eye rather than only by script.
 */
export const TokensDark: Story = {
  args: { mode: 'dark' },
};
