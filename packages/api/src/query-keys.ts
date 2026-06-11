export const qk = {
  communities: ['communities'] as const,
  community: (id: string) => ['community', id] as const,
  members: (id: string) => ['community', id, 'members'] as const,
  permissions: (id: string) => ['community', id, 'permissions'] as const,
  posts: (id: string) => ['community', id, 'posts'] as const,
  post: (postId: string) => ['post', postId] as const,
  comments: (postId: string) => ['post', postId, 'comments'] as const,
  reviews: (id: string) => ['community', id, 'reviews'] as const,
  requests: (id: string) => ['community', id, 'requests'] as const,
  suggested: ['communities', 'suggested'] as const,
  canCreate: ['communities', 'can-create'] as const,
  defaultCommunity: ['communities', 'default'] as const,
};
