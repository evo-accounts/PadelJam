import { describe, expect, it } from 'vitest';
import { passwordRules, passwordValid } from './passwordRules';

describe('passwordRules', () => {
  it('reports each rule separately', () => {
    expect(passwordRules('abc')).toEqual({ minLength: false, uppercase: false, number: false, symbol: false });
    expect(passwordRules('Padel1234#')).toEqual({ minLength: true, uppercase: true, number: true, symbol: true });
    expect(passwordRules('padel1234#')).toEqual({ minLength: true, uppercase: false, number: true, symbol: true });
    expect(passwordRules('Padelpadel#')).toEqual({ minLength: true, uppercase: true, number: false, symbol: true });
    expect(passwordRules('Padel12345')).toEqual({ minLength: true, uppercase: true, number: true, symbol: false });
  });
  it('counts unicode uppercase and any non-alphanumeric as a symbol', () => {
    expect(passwordRules('Ólá12345!').uppercase).toBe(true);
    expect(passwordRules('Abcdefg1 ').symbol).toBe(true);
  });
  it('passwordValid is the conjunction', () => {
    expect(passwordValid('Padel1234#')).toBe(true);
    expect(passwordValid('padel1234#')).toBe(false);
  });
});
