// @vitest-environment jsdom
/**
 * `useGeocodeSearch` must always FINISH. Its callers gate their primary action on `resolved`, so a
 * lookup that never settles is a dead button with nothing on screen to explain it — which is what
 * a hung geocoder used to produce on the onboarding location step. Every outcome below ends with
 * `resolved` set and `searching` false; they differ only in whether the answer is a real place.
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const geocodeAsync = vi.fn();
const reverseGeocodeAsync = vi.fn();
vi.mock('expo-location', () => ({
  geocodeAsync: (...a: unknown[]) => geocodeAsync(...a),
  reverseGeocodeAsync: (...a: unknown[]) => reverseGeocodeAsync(...a),
}));

import { useGeocodeSearch } from './useGeocodeSearch';

type Result = ReturnType<typeof useGeocodeSearch>;
let latest: Result;
const report = (r: Result) => {
  latest = r;
};
/** Hands each result out through an effect — writing to `latest` during render is impure. */
function Probe({ text }: { text: string }) {
  const result = useGeocodeSearch(text);
  useEffect(() => report(result));
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function type(text: string) {
  await act(async () => {
    root.render(createElement(Probe, { text }));
  });
}

/** Advance fake time and flush the promise chain that the timers release. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const LISBOA = { latitude: 38.72, longitude: -9.14 };

beforeEach(() => {
  vi.useFakeTimers();
  geocodeAsync.mockReset();
  reverseGeocodeAsync.mockReset();
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe('useGeocodeSearch', () => {
  it('resolves a real place with coordinates and a reverse-geocoded name', async () => {
    geocodeAsync.mockResolvedValue([LISBOA]);
    reverseGeocodeAsync.mockResolvedValue([{ name: 'Baixa', city: 'Lisboa', region: 'Lisboa' }]);

    await type('Lisboa');
    expect(latest.searching).toBe(true);
    await wait(500);

    expect(latest.resolved).toMatchObject({ lat: 38.72, lng: -9.14, label: 'Baixa, Lisboa', title: 'Lisboa' });
    expect(latest.approximate).toBe(false);
    expect(latest.searching).toBe(false);
  });

  it('falls back to the typed text when the geocoder knows no such place', async () => {
    geocodeAsync.mockResolvedValue([]);

    await type('Nowhereville');
    await wait(500);

    expect(latest.resolved).toEqual({ lat: null, lng: null, label: 'Nowhereville' });
    expect(latest.approximate).toBe(true);
    expect(latest.searching).toBe(false);
  });

  it('falls back to the typed text when the lookup throws', async () => {
    geocodeAsync.mockRejectedValue(new Error('network down'));

    await type('Lisboa');
    await wait(500);

    expect(latest.resolved).toEqual({ lat: null, lng: null, label: 'Lisboa' });
    expect(latest.approximate).toBe(true);
    expect(latest.searching).toBe(false);
  });

  // The case that stranded users: a lookup that never answers. Before the deadline it is still
  // honestly "searching"; after it, the typed text is handed back and the caller can proceed.
  it('falls back to the typed text when the lookup hangs past the deadline', async () => {
    geocodeAsync.mockReturnValue(new Promise(() => {}));

    await type('Lisboa');
    await wait(500 + 3999);
    expect(latest.resolved).toBeNull();
    expect(latest.searching).toBe(true);

    await wait(1);
    expect(latest.resolved).toEqual({ lat: null, lng: null, label: 'Lisboa' });
    expect(latest.approximate).toBe(true);
    expect(latest.searching).toBe(false);
  });

  it('also times out a hang in the reverse-geocode, not only the geocode', async () => {
    geocodeAsync.mockResolvedValue([LISBOA]);
    reverseGeocodeAsync.mockReturnValue(new Promise(() => {}));

    await type('Lisboa');
    await wait(500 + 4000);

    expect(latest.resolved).toEqual({ lat: null, lng: null, label: 'Lisboa' });
    expect(latest.approximate).toBe(true);
  });

  it('does not look anything up for fewer than three characters', async () => {
    await type('Li');
    await wait(5000);

    expect(geocodeAsync).not.toHaveBeenCalled();
    expect(latest.resolved).toBeNull();
    expect(latest.searching).toBe(false);
  });

  it('discards an answer for text the user has since changed', async () => {
    let answerFirst: (v: unknown) => void = () => {};
    geocodeAsync.mockReturnValueOnce(new Promise((r) => (answerFirst = r)));
    geocodeAsync.mockResolvedValueOnce([]);

    await type('Lisboa');
    await wait(500);
    await type('Porto');

    // The first lookup answers late, after the text has moved on. It must not land.
    reverseGeocodeAsync.mockResolvedValue([{ name: 'Baixa', city: 'Lisboa' }]);
    await act(async () => answerFirst([LISBOA]));
    await wait(500);

    expect(latest.resolved).toEqual({ lat: null, lng: null, label: 'Porto' });
  });

  it('returns up to three places, the first of which is `resolved`', async () => {
    geocodeAsync.mockResolvedValue([LISBOA, { latitude: 38.8, longitude: -9.2 }, { latitude: 54.5, longitude: -6.0 }, LISBOA]);
    reverseGeocodeAsync
      .mockResolvedValueOnce([{ city: 'Lisboa', region: 'Lisboa', country: 'Portugal' }])
      .mockResolvedValueOnce([{ city: 'Linda-a-Velha', region: 'Oeiras', country: 'Portugal' }])
      .mockResolvedValueOnce([{ city: 'Lisburn', region: 'Northern Ireland', country: 'UK' }]);

    await type('Lisb');
    await wait(500);

    expect(geocodeAsync).toHaveBeenCalledTimes(1);
    expect(reverseGeocodeAsync).toHaveBeenCalledTimes(3);
    expect(latest.places.map((p) => p.title)).toEqual(['Lisboa', 'Linda-a-Velha', 'Lisburn']);
    expect(latest.places[0]?.subtitle).toBe('Portugal'); // the region repeats the title, so the card drops it
    expect(latest.resolved).toBe(latest.places[0]);
  });

  it('lists a place once when two hits have the same name', async () => {
    geocodeAsync.mockResolvedValue([LISBOA, LISBOA]);
    reverseGeocodeAsync.mockResolvedValue([{ city: 'Lisboa', region: 'Lisboa' }]);

    await type('Lisboa');
    await wait(500);

    expect(latest.places).toHaveLength(1);
  });

  it('lists one card when two hits differ in label but show the same title and subtitle', async () => {
    geocodeAsync.mockResolvedValue([LISBOA, { latitude: 38.71, longitude: -9.13 }]);
    reverseGeocodeAsync
      .mockResolvedValueOnce([{ name: 'Baixa', city: 'Lisboa', region: 'Lisboa', country: 'Portugal' }])
      .mockResolvedValueOnce([{ name: 'Alfama', city: 'Lisboa', region: 'Lisboa', country: 'Portugal' }]);

    await type('Lisboa');
    await wait(500);

    expect(latest.places).toHaveLength(1);
  });

  it('offers the typed text as the only entry when the lookup finds nothing', async () => {
    geocodeAsync.mockResolvedValue([]);

    await type('Nowhereville');
    await wait(500);

    expect(latest.places).toEqual([{ lat: null, lng: null, label: 'Nowhereville' }]);
  });
});
