import { idbDescribeAll } from './idb';

/** One element from `idb ui describe-all --json`. */
export interface AxElement {
  AXLabel: string | null;
  AXUniqueId: string | null;
  AXValue: string | null;
  type: string;
  role: string;
  enabled: boolean;
  frame: { x: number; y: number; width: number; height: number };
}

export interface Selector {
  /** Matches AXUniqueId (React Native testID). */
  id?: string;
  /** Exact AXLabel match. */
  label?: string;
  /** Substring or regex match against AXLabel or AXValue. */
  text?: string | RegExp;
  /** Element type filter, e.g. 'Button', 'TextField', 'Heading'. */
  type?: string;
  /** 0-based index among matches (default 0). */
  nth?: number;
}

export async function snapshot(): Promise<AxElement[]> {
  const raw = await idbDescribeAll();
  const parsed = JSON.parse(raw) as AxElement[];
  return parsed.filter((e) => e && e.frame && e.frame.width > 0 && e.frame.height > 0);
}

function matches(el: AxElement, sel: Selector): boolean {
  if (sel.type && el.type !== sel.type) return false;
  if (sel.id) return el.AXUniqueId === sel.id;
  if (sel.label) return el.AXLabel === sel.label;
  if (sel.text !== undefined) {
    const hay = [el.AXLabel, el.AXValue].filter(Boolean).join(' ');
    return sel.text instanceof RegExp ? sel.text.test(hay) : hay.toLowerCase().includes(String(sel.text).toLowerCase());
  }
  // Type-only selector: the type filter above already passed.
  return sel.type !== undefined;
}

export function query(tree: AxElement[], sel: Selector): AxElement | undefined {
  const found = tree.filter((el) => matches(el, sel));
  return found[sel.nth ?? 0];
}

export function queryAll(tree: AxElement[], sel: Selector): AxElement[] {
  return tree.filter((el) => matches(el, sel));
}

export function center(el: AxElement): { x: number; y: number } {
  return { x: el.frame.x + el.frame.width / 2, y: el.frame.y + el.frame.height / 2 };
}

export function describeSelector(sel: Selector): string {
  return JSON.stringify(sel);
}
