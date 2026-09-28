import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Button — the "Custom Button" set in the PJAM Design System Figma file.
 *
 * Colours come from the `--button-*` variables generated out of
 * packages/ui/src/tokens/button.ts, which mobile's Button reads too; sizes are
 * the Tailwind steps that file names (h-11 is its 44, px-2.5 its 10, …).
 *
 * The class lists below are spelled out per variant, not built from a template:
 * Tailwind only generates classes it can find literally in the source.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center border border-transparent font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-(--button-invalid-border) aria-invalid:ring-[3px] aria-invalid:ring-(--button-invalid-ring) [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-(--button-primary-bg) text-(--button-primary-fg) hover:bg-(--button-primary-bg-hover) focus-visible:bg-(--button-primary-bg-hover) active:bg-(--button-primary-bg-active) focus-visible:border-(--button-primary-focus-border) focus-visible:ring-(--button-primary-focus-ring)",
        secondary:
          "bg-(--button-secondary-bg) text-(--button-secondary-fg) hover:bg-(--button-secondary-bg-hover) focus-visible:bg-(--button-secondary-bg-hover) active:bg-(--button-secondary-bg-active) focus-visible:border-(--button-secondary-focus-border) focus-visible:ring-(--button-secondary-focus-ring)",
        tertiary:
          "bg-(--button-tertiary-bg) text-(--button-tertiary-fg) hover:bg-(--button-tertiary-bg-hover) focus-visible:bg-(--button-tertiary-bg-hover) active:bg-(--button-tertiary-bg-active) focus-visible:border-(--button-tertiary-focus-border) focus-visible:ring-(--button-tertiary-focus-ring)",
        info:
          "bg-(--button-info-bg) text-(--button-info-fg) hover:bg-(--button-info-bg-hover) focus-visible:bg-(--button-info-bg-hover) active:bg-(--button-info-bg-active) focus-visible:border-(--button-info-focus-border) focus-visible:ring-(--button-info-focus-ring)",
        success:
          "bg-(--button-success-bg) text-(--button-success-fg) hover:bg-(--button-success-bg-hover) focus-visible:bg-(--button-success-bg-hover) active:bg-(--button-success-bg-active) focus-visible:border-(--button-success-focus-border) focus-visible:ring-(--button-success-focus-ring)",
        warning:
          "bg-(--button-warning-bg) text-(--button-warning-fg) hover:bg-(--button-warning-bg-hover) focus-visible:bg-(--button-warning-bg-hover) active:bg-(--button-warning-bg-active) focus-visible:border-(--button-warning-focus-border) focus-visible:ring-(--button-warning-focus-ring)",
        destructive:
          "bg-(--button-destructive-bg) text-(--button-destructive-fg) hover:bg-(--button-destructive-bg-hover) focus-visible:bg-(--button-destructive-bg-hover) active:bg-(--button-destructive-bg-active) focus-visible:border-(--button-destructive-focus-border) focus-visible:ring-(--button-destructive-focus-ring)",
      },
      size: {
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-md px-2.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        // 12px: Figma's rounded-xl, off the shared ladder — see button.ts.
        md: "h-11 gap-1.5 rounded-[12px] px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 gap-1.5 rounded-2xl px-4 text-base [&_svg:not([class*='size-'])]:size-6",
        // Square icon-only buttons at the same heights. Not in the Figma set,
        // which has no icon-only button; kept because web depends on them.
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-11 rounded-[12px] [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14 rounded-2xl [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Shows a spinner before the label and blocks presses. Distinct from
     * `disabled`: this is transient. Ignored with `asChild`, whose Slot needs
     * exactly one child.
     */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const busy = loading && !asChild

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <>
          <Loader2Icon aria-hidden className="size-3 animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
