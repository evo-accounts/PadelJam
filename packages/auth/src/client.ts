import { createClient, type TypedClient } from '@padel/db';

export type AuthStorage = {
  getItem: (k: string) => Promise<string | null> | string | null;
  setItem: (k: string, v: string) => Promise<void> | void;
  removeItem: (k: string) => Promise<void> | void;
};

export const createAuthClient = (url: string, anonKey: string, storage?: AuthStorage): TypedClient =>
  createClient(url, anonKey, {
    auth: {
      ...(storage ? { storage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
