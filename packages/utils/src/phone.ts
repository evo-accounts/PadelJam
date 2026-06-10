const E164 = /^\+[1-9]\d{6,14}$/;
export const isE164 = (value: string): boolean => E164.test(value);
