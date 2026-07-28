import { CONFIG } from './config';
import { runOk } from './proc';

/** Thin wrapper over the fb-idb CLI, always scoped to the configured UDID. */
export const idb = (args: string[], timeoutMs = 30_000) =>
  runOk(CONFIG.idbPath, [...args, '--udid', CONFIG.udid], { timeoutMs });

export const idbTap = (x: number, y: number) => idb(['ui', 'tap', String(Math.round(x)), String(Math.round(y))]);
export const idbText = (text: string) => idb(['ui', 'text', text]);
/** HID key codes: 40 = return, 42 = backspace/delete. */
export const idbKey = (code: number) => idb(['ui', 'key', String(code)]);
export const idbSwipe = (x1: number, y1: number, x2: number, y2: number, durationMs = 300) =>
  idb(['ui', 'swipe', String(x1), String(y1), String(x2), String(y2), '--duration', String(durationMs / 1000)]);
export const idbDescribeAll = () => idb(['ui', 'describe-all', '--json'], 30_000);
