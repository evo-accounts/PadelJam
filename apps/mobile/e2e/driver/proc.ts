import { execFile } from 'node:child_process';
import { CONFIG } from './config';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run a command, resolving with output either way (callers check .code). */
export function run(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, DEVELOPER_DIR: CONFIG.developerDir },
      },
      (err, stdout, stderr) => {
        const errCode = err ? (err as NodeJS.ErrnoException & { code?: number | string }).code : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr), code: err ? (typeof errCode === 'number' ? errCode : 1) : 0 });
      },
    );
  });
}

/** Run and throw on non-zero exit with a readable message. */
export async function runOk(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.code}):\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}
