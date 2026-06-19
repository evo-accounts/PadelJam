import type { MsgLike } from './chat-media';

/** Display string for a channel's most recent message: text, an image label, or empty. */
export function lastMessagePreview(messages: MsgLike[]): string {
  const last = messages.length ? messages[messages.length - 1] : undefined;
  if (!last || last.type === 'deleted') return '';
  const text = last.text?.trim();
  if (text) return text;
  const hasImage = (last.attachments ?? []).some((a) => a?.type === 'image');
  return hasImage ? '📷 Photo' : '';
}
