/**
 * Does this look like an email address? SHAPE ONLY, deliberately: anything stricter rejects
 * addresses that exist (plus-tags, new TLDs, quoted locals), and the server is the real authority.
 * This is here to catch a typo before a rate-limit slot is spent on it.
 *
 * It was the same regex copied into three screens — mobile sign-in, mobile create-account and web's
 * change-email page — each with its own copy of this comment. Web's sign-in needed a fourth.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmailShape = (value: string): boolean => EMAIL_SHAPE.test(value);
