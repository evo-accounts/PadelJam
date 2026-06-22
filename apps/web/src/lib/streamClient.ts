import { StreamChat } from 'stream-chat';

// Singleton Stream client. The public API key is safe to ship; the secret stays server-side
// (used only by the stream-token edge function). Set NEXT_PUBLIC_STREAM_API_KEY in the web env.
const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? '';
export const streamClient = StreamChat.getInstance(apiKey);
