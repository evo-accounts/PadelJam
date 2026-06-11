export const ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  'Community', 'Group', 'Event', 'Post', 'Member', 'JoinRequest', 'Payment',
  'Analytics', 'Broadcast', 'Review', 'Comment', 'Like', 'Invitation', 'all',
] as const;
export type Subject = (typeof SUBJECTS)[number];
