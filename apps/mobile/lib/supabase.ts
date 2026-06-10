import * as SecureStore from 'expo-secure-store';
import { createAuthClient, type AuthStorage } from '@padel/auth';
import { createPublicEnv } from '@padel/config';

const env = createPublicEnv({
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
});

// SecureStore-backed adapter. Note: SecureStore has a per-value size limit
// (~2KB on iOS); acceptable for Supabase session tokens at this stage.
const storage: AuthStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

export const supabase = createAuthClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, storage);

export const SUPABASE_URL = env.SUPABASE_URL;
