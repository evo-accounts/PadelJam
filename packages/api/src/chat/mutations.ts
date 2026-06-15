import { useMutation } from '@tanstack/react-query';
import { useDb } from '../client';

export type EnsureChannelInput = { kind: 'group' | 'event'; id: string };

// Ensures the Stream channel for a group/event exists + has the right members, returns its cid.
export const useEnsureChannel = () => {
  const db = useDb();
  return useMutation({
    mutationFn: async (input: EnsureChannelInput) => {
      const { data, error } = await db.functions.invoke('ensure-channel', { body: input });
      if (error) throw error;
      return data as { cid: string };
    },
  });
};
