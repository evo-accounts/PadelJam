import type { TypedClient } from '@padel/db';

export const getSession = (c: TypedClient) => c.auth.getSession();
export const getUser = (c: TypedClient) => c.auth.getUser();
export const signOut = (c: TypedClient) => c.auth.signOut();
export const refresh = (c: TypedClient) => c.auth.refreshSession();
