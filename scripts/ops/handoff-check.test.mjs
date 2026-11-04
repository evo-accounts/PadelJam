import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyseIssue, boardComments, ownerChanges, silentWait } from './handoff-check.mjs';

const QA = 'agent-qa';
const CTO = 'agent-cto';
const T0 = '2026-11-04T01:00:00.000Z';
const at = (minutes) => new Date(new Date(T0).getTime() + minutes * 60_000).toISOString();
const opts = { since: new Date(T0).getTime() - 1, until: new Date(at(600)).getTime(), minutes: 30, now: new Date(at(600)).getTime() };

const reassign = (minutes, from, to, extra = {}) => ({
  action: 'issue.updated',
  createdAt: at(minutes),
  details: { changes: { assigneeAgentId: { from, to } }, ...extra },
});
const run = (minutes, agentId, extra = {}) => ({
  agentId,
  createdAt: at(minutes),
  startedAt: at(minutes),
  finishedAt: at(minutes + 1),
  invocationSource: 'assignment',
  status: 'succeeded',
  ...extra,
});
const issue = { identifier: 'PAD-1', status: 'todo', assigneeAgentId: CTO };

test('a reassign with a run inside the limit landed', () => {
  const r = analyseIssue({ issue, activity: [reassign(0, QA, CTO)], runs: [run(1, CTO)] }, opts);
  assert.equal(r.landed, 1);
  assert.equal(r.stranded.length, 0);
});

test('a reassign with no run is stranded, and still stranded while nothing has run', () => {
  const activity = [reassign(0, QA, CTO, { interruptedRunId: 'r1' })];
  const r = analyseIssue({ issue, activity, runs: [] }, opts);
  assert.equal(r.stranded.length, 1);
  assert.equal(r.stranded[0].how, 'reassigned-own-run');
  assert.equal(r.stranded[0].stillStranded, true);
});

test('a board wake is the rescue, so it does not count as landing', () => {
  const wake = run(20, CTO, { id: 'wake-1' });
  const r = analyseIssue({ issue, activity: [reassign(0, QA, CTO)], runs: [wake] }, { ...opts, boardWakes: new Set(['wake-1']) });
  assert.equal(r.landed, 0);
  assert.equal(r.stranded.length, 1);
  assert.equal(r.stranded[0].firstRunWasBoardWake, true);
  assert.equal(r.stranded[0].stillStranded, false);
});

test('a rescued owner who hands off inside the limit is still a stranded hand-off', () => {
  const activity = [reassign(0, QA, CTO), reassign(25, CTO, QA)];
  const r = analyseIssue(
    { issue, activity, runs: [run(24, CTO, { id: 'wake-1' }), run(26, QA)] },
    { ...opts, boardWakes: new Set(['wake-1']) },
  );
  assert.equal(r.stranded.length, 1);
  assert.equal(r.stranded[0].to, CTO);
});

test('a board reassign followed by its own wake landed', () => {
  const activity = [{ ...reassign(0, QA, CTO), actorType: 'user' }];
  const r = analyseIssue({ issue, activity, runs: [run(1, CTO, { id: 'wake-1' })] }, { ...opts, boardWakes: new Set(['wake-1']) });
  assert.equal(r.landed, 1);
});

test('the status comes from the next change, because claiming a run logs nothing', () => {
  const activity = [
    { action: 'issue.created', createdAt: at(0), details: { status: 'blocked' } },
    reassign(10, QA, CTO),
    { action: 'issue.updated', createdAt: at(200), details: { changes: { status: { from: 'in_progress', to: 'done' } } } },
  ];
  const r = analyseIssue({ issue: { ...issue, status: 'done' }, activity, runs: [] }, opts);
  assert.equal(r.stranded.length, 1);
});

test('a run of the sender does not land the hand-off', () => {
  const r = analyseIssue({ issue, activity: [reassign(0, QA, CTO)], runs: [run(1, QA)] }, opts);
  assert.equal(r.stranded.length, 1);
});

test('a queued run that never started does not land the hand-off', () => {
  const r = analyseIssue(
    { issue, activity: [reassign(0, QA, CTO)], runs: [run(1, CTO, { startedAt: null, status: 'cancelled' })] },
    opts,
  );
  assert.equal(r.stranded.length, 1);
});

test('a task moved to blocked with the reassign is explained', () => {
  const activity = [{
    action: 'issue.updated',
    createdAt: at(0),
    details: { changes: { assigneeAgentId: { from: QA, to: CTO }, status: { from: 'in_progress', to: 'blocked' } } },
  }];
  const r = analyseIssue({ issue: { ...issue, status: 'blocked' }, activity, runs: [] }, opts);
  assert.equal(r.explained, 1);
  assert.equal(r.stranded.length, 0);
});

test('a card pending at the limit explains the wait, and one answered earlier does not', () => {
  const pending = [{ createdAt: at(1), resolvedAt: null }];
  const answered = [{ createdAt: at(1), resolvedAt: at(5) }];
  const input = { issue, activity: [reassign(0, QA, CTO)], runs: [] };
  assert.equal(analyseIssue({ ...input, interactions: pending }, opts).explained, 1);
  assert.equal(analyseIssue({ ...input, interactions: answered }, opts).stranded.length, 1);
});

test('inside the limit is not judged yet', () => {
  const soon = { ...opts, now: new Date(at(10)).getTime(), until: new Date(at(10)).getTime() };
  const r = analyseIssue({ issue, activity: [reassign(0, QA, CTO)], runs: [] }, soon);
  assert.equal(r.pending.length, 1);
  assert.equal(r.stranded.length, 0);
});

test('a second owner change inside the limit judges only the later one', () => {
  const activity = [reassign(0, QA, 'agent-b'), reassign(5, 'agent-b', CTO)];
  const r = analyseIssue({ issue, activity, runs: [run(6, CTO)] }, opts);
  assert.equal(r.explained, 1);
  assert.equal(r.landed, 1);
});

test('a task created with an owner counts as a hand-off, so the new route stays measured', () => {
  const activity = [{ action: 'issue.created', createdAt: at(0), details: { status: 'todo' } }];
  assert.deepEqual(ownerChanges(issue, activity).map((c) => [c.to, c.how]), [[CTO, 'created']]);
  assert.equal(analyseIssue({ issue, activity, runs: [run(0, CTO)] }, opts).landed, 1);
  assert.equal(analyseIssue({ issue, activity, runs: [] }, opts).stranded.length, 1);
});

test('a task created in backlog or for the founder is not a stranded hand-off', () => {
  const backlog = [{ action: 'issue.created', createdAt: at(0), details: { status: 'backlog' } }];
  assert.equal(analyseIssue({ issue, activity: backlog, runs: [] }, opts).stranded.length, 0);
  const founder = { ...issue, assigneeAgentId: null };
  const created = [{ action: 'issue.created', createdAt: at(0), details: { status: 'todo' } }];
  assert.equal(analyseIssue({ issue: founder, activity: created, runs: [] }, opts).changes, 0);
});

test('changes outside the window are ignored', () => {
  const window = { ...opts, since: new Date(at(100)).getTime() };
  assert.equal(analyseIssue({ issue, activity: [reassign(0, QA, CTO)], runs: [] }, window).changes, 0);
});

const waiting = { identifier: 'PAD-2', status: 'in_progress', assigneeAgentId: CTO, monitorNextCheckAt: null };

test('in_progress with nothing running and no monitor is a silent wait', () => {
  const s = silentWait({ issue: waiting, runs: [run(0, CTO)] }, opts);
  assert.equal(s.issue, 'PAD-2');
  assert.ok(s.idleMinutes > 30);
});

test('a monitor, a live run, a pending card or a recent run is not a silent wait', () => {
  const monitored = { ...waiting, monitorNextCheckAt: at(700) };
  assert.equal(silentWait({ issue: monitored, runs: [run(0, CTO)] }, opts), null);
  assert.equal(silentWait({ issue: waiting, runs: [run(0, CTO, { status: 'running', finishedAt: null })] }, opts), null);
  assert.equal(silentWait({ issue: waiting, runs: [run(0, CTO)], interactions: [{ createdAt: at(1), resolvedAt: null }] }, opts), null);
  assert.equal(silentWait({ issue: waiting, runs: [run(590, CTO)] }, opts), null);
});

test('board comments: only marked ones, only from the board, only in the window', () => {
  const comments = [
    { authorUserId: 'u', createdAt: at(1), body: 'Rescue: QA, this is yours' },
    { authorUserId: 'u', createdAt: at(2), body: 'Board check-in (Claude): nudge' },
    { authorUserId: 'u', createdAt: at(3), body: "Founder's decision: A" },
    { authorUserId: null, createdAt: at(4), body: 'Rescue: an agent wrote this' },
    { authorUserId: 'u', createdAt: at(700), body: 'Rescue: too late' },
  ];
  assert.deepEqual(boardComments(issue, comments, opts).map((c) => c.kind), ['rescue', 'check-in']);
});
