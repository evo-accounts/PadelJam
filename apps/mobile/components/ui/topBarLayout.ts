export type TopBarVariant = 'top' | 'nav' | 'edit' | 'wizard';
export type TopBarLayout = {
  left: 'none' | 'back' | 'close';
  titleAlign: 'left' | 'center';
  titleVariant: 'title' | 'bodyStrong';
  right: 'actions' | 'close';
  divider: boolean;
  /**
   * Both side slots take this width, so the title stays centred by construction —
   * 'double' only when two actions sit on the right, otherwise 'single'.
   */
  sideWidth: 'single' | 'double';
};

/** UX-GLOB-01: the three header patterns, plus the wizard's two-control case. */
export function topBarLayout(variant: TopBarVariant, opts: { actionCount: number }): TopBarLayout {
  const sideWidth: TopBarLayout['sideWidth'] = opts.actionCount > 1 ? 'double' : 'single';
  switch (variant) {
    case 'top':
      return { left: 'none', titleAlign: 'left', titleVariant: 'title', right: 'actions', divider: false, sideWidth };
    case 'nav':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true, sideWidth };
    case 'edit':
      return { left: 'close', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true, sideWidth };
    case 'wizard':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'close', divider: true, sideWidth };
  }
}
