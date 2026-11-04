#!/usr/bin/env node
// Counts stranded hand-offs and rescues from the Paperclip API. Read-only.
//
//   node scripts/ops/handoff-check.mjs --since 2026-11-04T12:00:00Z [--until <iso>] [--minutes 30] [--json]
//
// Needs PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID, which every agent run has.
// Definitions are in docs/superpowers/plans/2026-11-04-handoff-fix.md.
import { pathToFileURL } from 'node:url';

const CLOSED = new Set(['done', 'cancelled']);
const ms = (iso) => new Date(iso).getTime();

// Paperclip's per-issue run list uses runId; the company list uses id.
const runId = (run) => run.runId ?? run.id;

/**
 * Every time a task gained an agent owner, oldest first, with the task's status right after.
 * Claiming a run moves a task to in_progress with no activity event, so reading forward goes stale.
 * The next status change's "from" is the status that really held; after the last one, the current status.
 */
export function ownerChanges(issue, activity) {
  const events = [...activity].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const updates = events.filter((e) => e.action === 'issue.updated');
  const changes = [];
  const statusAfter = (index) => {
    if (updates[index]?.details?.changes?.status?.to) return updates[index].details.changes.status.to;
    const next = updates.slice(index + 1).find((e) => e.details?.changes?.status);
    return next ? next.details.changes.status.from : issue.status;
  };

  const created = events.find((e) => e.action === 'issue.created');
  if (created) {
    const status = created.details?.status ?? statusAfter(-1);
    // issue.created doesn't record the owner: it's the "from" of the first change, or the current one.
    const firstChange = updates.find((e) => e.details?.changes?.assigneeAgentId);
    const firstOwner = firstChange
      ? firstChange.details.changes.assigneeAgentId.from
      : issue.assigneeAgentId;
    if (firstOwner) changes.push({ at: created.createdAt, to: firstOwner, status, how: 'created' });
  }

  updates.forEach((event, index) => {
    const to = event.details?.changes?.assigneeAgentId?.to;
    if (!to) return;
    changes.push({
      at: event.createdAt,
      to,
      status: statusAfter(index),
      how: event.details?.interruptedRunId ? 'reassigned-own-run' : 'reassigned',
      byBoard: event.actorType === 'user',
    });
  });
  return changes.sort((a, b) => ms(a.at) - ms(b.at));
}

function cardPendingAt(interactions, at) {
  return interactions.some(
    (card) => ms(card.createdAt) <= at && (!card.resolvedAt || ms(card.resolvedAt) > at),
  );
}

/**
 * A hand-off is stranded when the new owner has no run on the task within the limit, and neither a
 * blocker nor a pending card explains it. `pending` means the limit hasn't passed yet.
 */
export function analyseIssue({ issue, activity, runs, interactions = [] }, { since, until, minutes, now, boardWakes = new Set() }) {
  // A board wake starts a run too, but that's the rescue, not the hand-off landing.
  const isBoardWake = (run) => boardWakes.has(runId(run));
  const limitMs = minutes * 60_000;
  const changes = ownerChanges(issue, activity);
  const result = { changes: 0, landed: 0, stranded: [], pending: [], explained: 0 };

  changes.forEach((change, index) => {
    const at = ms(change.at);
    if (at < since || at > until) return;
    result.changes += 1;

    const deadline = at + limitMs;
    const next = changes[index + 1];
    const end = next ? Math.min(deadline, ms(next.at)) : deadline;
    const ownerRuns = runs.filter((run) => run.agentId === change.to);
    const landingRun = ownerRuns.find(
      (run) =>
        (change.byBoard || !isBoardWake(run)) &&
        run.startedAt &&
        ms(run.createdAt) >= at - 2000 &&
        ms(run.createdAt) <= end,
    );
    const rescued = ownerRuns.some((run) => isBoardWake(run) && ms(run.createdAt) >= at && ms(run.createdAt) <= end);
    const entry = { issue: issue.identifier, at: change.at, to: change.to, how: change.how };

    if (landingRun) {
      result.landed += 1;
    } else if (next && ms(next.at) < deadline && !rescued) {
      // Moved on again inside the limit: judge the later change instead.
      result.explained += 1;
    } else if (['backlog', 'blocked', ...CLOSED].includes(change.status)) {
      result.explained += 1;
    } else if (cardPendingAt(interactions, deadline)) {
      result.explained += 1;
    } else if (deadline > now) {
      result.pending.push(entry);
    } else {
      const firstRun = ownerRuns
        .filter((run) => ms(run.createdAt) > at)
        .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))[0];
      const stillOpen =
        !next && !CLOSED.has(issue.status) && issue.status !== 'blocked' && issue.assigneeAgentId === change.to;
      result.stranded.push({
        ...entry,
        waitedMinutes: firstRun ? Math.round((ms(firstRun.createdAt) - at) / 60_000) : null,
        firstRunWasBoardWake: firstRun ? isBoardWake(firstRun) : false,
        stillStranded: stillOpen && !firstRun,
      });
    }
  });
  return result;
}

/** Open and in_progress, nothing running, nothing scheduled: nobody will ever wake this owner. */
export function silentWait({ issue, runs, interactions = [] }, { minutes, now }) {
  if (issue.status !== 'in_progress' || !issue.assigneeAgentId) return null;
  if (issue.monitorNextCheckAt) return null;
  if (cardPendingAt(interactions, now)) return null;
  const owner = runs.filter((run) => run.agentId === issue.assigneeAgentId);
  if (owner.some((run) => ['queued', 'running', 'scheduled_retry'].includes(run.status))) return null;
  const last = owner.map((run) => ms(run.finishedAt ?? run.createdAt)).sort((a, b) => b - a)[0];
  if (last && now - last < minutes * 60_000) return null;
  return { issue: issue.identifier, to: issue.assigneeAgentId, idleMinutes: last ? Math.round((now - last) / 60_000) : null };
}

export function boardComments(issue, comments, { since, until }) {
  return comments
    .filter((c) => c.authorUserId && ms(c.createdAt) >= since && ms(c.createdAt) <= until)
    .filter((c) => /^(Rescue:|Board check-in)/.test(c.body ?? ''))
    .map((c) => ({
      issue: issue.identifier,
      at: c.createdAt,
      kind: c.body.startsWith('Rescue:') ? 'rescue' : 'check-in',
      text: c.body.replace(/\s+/g, ' ').slice(0, 110),
    }));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const { PAPERCLIP_API_URL: api, PAPERCLIP_API_KEY: key, PAPERCLIP_COMPANY_ID: company } = process.env;
  if (!api || !key || !company) throw new Error('Needs PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID');
  if (!flag('since')) throw new Error('Needs --since <iso>');

  const now = Date.now();
  const opts = {
    since: ms(flag('since')),
    until: flag('until') ? ms(flag('until')) : now,
    minutes: Number(flag('minutes') ?? 30),
    now,
  };
  if (Number.isNaN(opts.since) || Number.isNaN(opts.until)) throw new Error('--since and --until must be ISO dates');

  const get = async (path) => {
    const res = await fetch(`${api.replace(/\/$/, '')}/api${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json();
  };

  const agents = await get(`/companies/${company}/agents`);
  const name = (id) => agents.find((a) => a.id === id)?.name ?? id;
  const allIssues = await get(`/companies/${company}/issues?limit=500`);
  const companyRuns = await get(`/companies/${company}/heartbeat-runs?limit=1000`);
  const issueKey = new Map(allIssues.map((i) => [i.id, i.identifier]));
  const invoked = await get(`/companies/${company}/activity?entityType=heartbeat_run&limit=500`);
  const boardInvoked = invoked.filter((e) => e.action === 'heartbeat.invoked' && e.actorType === 'user');
  opts.boardWakes = new Set(boardInvoked.map((e) => e.entityId));

  const total = { changes: 0, landed: 0, explained: 0, stranded: [], pending: [], silent: [], comments: [] };
  for (const issue of allIssues) {
    const open = !CLOSED.has(issue.status);
    if (!open && ms(issue.updatedAt) < opts.since) continue;
    const [activity, runs, interactions, comments] = await Promise.all([
      get(`/issues/${issue.id}/activity`),
      get(`/issues/${issue.id}/runs`),
      get(`/issues/${issue.id}/interactions`),
      get(`/issues/${issue.id}/comments?order=asc&limit=500`),
    ]);
    const input = { issue, activity, runs, interactions };
    const result = analyseIssue(input, opts);
    total.changes += result.changes;
    total.landed += result.landed;
    total.explained += result.explained;
    total.stranded.push(...result.stranded);
    total.pending.push(...result.pending);
    const silent = silentWait(input, opts);
    if (silent) total.silent.push(silent);
    total.comments.push(...boardComments(issue, comments, opts));
  }

  const boardWakes = companyRuns
    .filter((run) => opts.boardWakes.has(runId(run)) && ms(run.createdAt) >= opts.since && ms(run.createdAt) <= opts.until)
    .map((run) => ({ at: run.createdAt, agent: name(run.agentId), issue: issueKey.get(run.issueId) ?? null, run: runId(run) }));

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ...total, boardWakes }, null, 2));
    return;
  }

  const byTime = (a, b) => ms(a.at) - ms(b.at);
  console.log(`Window: ${new Date(opts.since).toISOString()} to ${new Date(opts.until).toISOString()}, limit ${opts.minutes} min`);
  console.log(`Hand-offs: ${total.changes} (${total.landed} landed, ${total.explained} explained, ${total.pending.length} not judged yet)`);
  console.log(`STRANDED: ${total.stranded.length}`);
  for (const s of total.stranded.sort(byTime)) {
    const waited = s.waitedMinutes === null ? 'no run since' : `first run after ${s.waitedMinutes} min${s.firstRunWasBoardWake ? ' (board wake)' : ''}`;
    console.log(`  ${s.at} ${s.issue} to ${name(s.to)} [${s.how}]: ${waited}${s.stillStranded ? ' STILL STRANDED' : ''}`);
  }
  console.log(`SILENT WAITS (in_progress, nothing will wake the owner): ${total.silent.length}`);
  for (const s of total.silent) console.log(`  ${s.issue} ${name(s.to)}: idle ${s.idleMinutes ?? '?'} min`);
  console.log(`Board wakes: ${boardWakes.length}`);
  for (const w of boardWakes.sort(byTime)) console.log(`  ${w.at} ${w.agent} on ${w.issue}`);
  const rescues = total.comments.filter((c) => c.kind === 'rescue');
  const checkIns = total.comments.filter((c) => c.kind === 'check-in');
  console.log(`Board comments: ${rescues.length} marked Rescue:, ${checkIns.length} Board check-in to classify by hand`);
  for (const c of total.comments.sort(byTime)) console.log(`  ${c.at} ${c.issue}: ${c.text}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
