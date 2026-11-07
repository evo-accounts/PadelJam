/** "See plans" only when plans are shown and the user can act on them; otherwise OK, which closes. */
export const showSeePlans = (canManage: boolean, plansVisible: boolean): boolean => canManage && plansVisible;
