import { execFile } from 'node:child_process';
import { CONFIG } from './config';

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Exit status. 1 when the process never exited on its own — see timedOut and signal. */
  code: number;
  /** Killed by our own `timeoutMs`, not failed by itself. */
  timedOut: boolean;
  /** The signal that ended it, if one did. */
  signal: string | null;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Run a command, resolving with output either way (callers check .code). */
export function run(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, DEVELOPER_DIR: CONFIG.developerDir },
      },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string | null; killed?: boolean; signal?: string | null }) | null;
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          // execFile's own timeout kills with SIGTERM and leaves code null.
          timedOut: Boolean(e?.killed) && e?.code == null,
          signal: e?.signal ?? null,
          timeoutMs,
        });
      },
    );
  });
}

/**
 * How the process ended, in words.
 *
 * This used to be just `code`, and execFile gives a KILLED process no code, so
 * our own timeout read as "failed (1)" with no output — which is how a
 * `simctl launch` that hung for its full 120 s on CI run 36713494350
 * (2026-09-30) was reported, indistinguishable from a real exit 1.
 */
export function describeExit(r: RunResult): string {
  if (r.timedOut) return `timed out after ${Math.round(r.timeoutMs / 1000)}s and was killed`;
  if (r.signal) return `killed by ${r.signal}`;
  return `exit ${r.code}`;
}

const MAX_STREAM_CHARS = 4_000;
const clip = (s: string) => (s.length > MAX_STREAM_CHARS ? `${s.slice(0, MAX_STREAM_CHARS)}… [${s.length - MAX_STREAM_CHARS} more chars]` : s);

/** Both streams, labelled — or an explicit note that there were none. */
export function describeOutput(r: RunResult): string {
  const parts: string[] = [];
  if (r.stderr.trim()) parts.push(`stderr: ${clip(r.stderr.trim())}`);
  if (r.stdout.trim()) parts.push(`stdout: ${clip(r.stdout.trim())}`);
  return parts.length ? parts.join('\n') : '(nothing on stdout or stderr)';
}

/** The one-stop failure message: command, how it ended, what it printed. */
export function describeFailure(cmd: string, args: string[], r: RunResult): string {
  return `${cmd} ${args.join(' ')} failed (${describeExit(r)}):\n${describeOutput(r)}`;
}

/** Run and throw on non-zero exit with a readable message. */
export async function runOk(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(describeFailure(cmd, args, r));
  return r.stdout;
}
