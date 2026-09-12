export type TopBarVariant = 'top' | 'nav' | 'edit' | 'wizard';
export type TopBarLayout = {
  left: 'none' | 'back' | 'close';
  titleAlign: 'left' | 'center';
  titleVariant: 'title' | 'bodyStrong';
  right: 'actions' | 'close';
  divider: boolean;
};

/** UX-GLOB-01: the three header patterns, plus the wizard's two-control case. */
export function topBarLayout(variant: TopBarVariant, _opts: { hasTitle: boolean }): TopBarLayout {
  switch (variant) {
    case 'top':
      return { left: 'none', titleAlign: 'left', titleVariant: 'title', right: 'actions', divider: false };
    case 'nav':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true };
    case 'edit':
      return { left: 'close', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'actions', divider: true };
    case 'wizard':
      return { left: 'back', titleAlign: 'center', titleVariant: 'bodyStrong', right: 'close', divider: true };
  }
}
