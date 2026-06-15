import { StreamChat } from 'stream-chat';

// Singleton Stream client. The public API key is safe to ship; the secret stays server-side
// (used only by the stream-token edge function). Set EXPO_PUBLIC_STREAM_API_KEY in the app env.
const apiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '';
export const streamClient = StreamChat.getInstance(apiKey);
