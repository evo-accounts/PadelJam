import { describe, expect, it, vi } from 'vitest';
import { inviteAll, inviteEach, inviteNotice } from './invitations';

// A stand-in for the RPCs as the hooks call them: refuses with Error(code) the way the mutationFns
// throw mapPgError's code. invite_to_community refuses the WHOLE list if any one id is blocked
// (0141), and writes nothing; `written` records only what a real call would have kept.
function fakeCommunityRpc(blocked: string[], other?: { id: string; code: string }) {
  const written: string[] = [];
  const calls: string[][] = [];
  const send = async (ids: string[]) => {
    calls.push(ids);
    if (other && ids.includes(other.id)) throw new Error(other.code);
    if (ids.some((id) => blocked.includes(id))) throw new Error('blocked');
    written.push(...ids);
  };
  return { send, written, calls };
}

describe('inviteEach (invite_to_group: one invitee per call)', () => {
  it('invites everyone when nobody is blocked', async () => {
    const sendOne = vi.fn(async () => {});
    await expect(inviteEach(['a', 'b', 'c'], sendOne)).resolves.toEqual({
      invited: ['a', 'b', 'c'],
      blocked: [],
    });
    expect(sendOne).toHaveBeenCalledTimes(3);
  });

  it('keeps going past a blocked person in the middle and counts them', async () => {
    const sent: string[] = [];
    const sendOne = async (id: string) => {
      if (id === 'b') throw new Error('blocked');
      sent.push(id);
    };
    await expect(inviteEach(['a', 'b', 'c'], sendOne)).resolves.toEqual({
      invited: ['a', 'c'],
      blocked: ['b'],
    });
    // The bug this replaces: the screen's loop stopped at 'b', so 'c' was never sent.
    expect(sent).toEqual(['a', 'c']);
  });

  it("rejects 'blocked' when nobody could be invited: one person fails as before", async () => {
    const sendOne = async () => {
      throw new Error('blocked');
    };
    await expect(inviteEach(['a'], sendOne)).rejects.toThrow('blocked');
    await expect(inviteEach(['a', 'b'], sendOne)).rejects.toThrow('blocked');
  });

  it('stops at any other refusal: it is not about one person', async () => {
    const sendOne = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('forbidden');
    });
    await expect(inviteEach(['a', 'b', 'c'], sendOne)).rejects.toThrow('forbidden');
    expect(sendOne).toHaveBeenCalledTimes(2);
  });

  it('does not mistake a code that merely contains "blocked" for a block', async () => {
    const sendOne = async () => {
      throw new Error('unknown_error: blocked by proxy');
    };
    await expect(inviteEach(['a', 'b'], sendOne)).rejects.toThrow(
      'unknown_error: blocked by proxy',
    );
  });

  it('resolves empty for an empty selection', async () => {
    const sendOne = vi.fn(async () => {});
    await expect(inviteEach([], sendOne)).resolves.toEqual({ invited: [], blocked: [] });
    expect(sendOne).not.toHaveBeenCalled();
  });
});

describe('inviteAll (invite_to_community: the whole list in one call)', () => {
  it('sends the list once when nobody is blocked', async () => {
    const rpc = fakeCommunityRpc([]);
    await expect(inviteAll(['a', 'b', 'c'], rpc.send)).resolves.toEqual({
      invited: ['a', 'b', 'c'],
      blocked: [],
    });
    expect(rpc.calls).toEqual([['a', 'b', 'c']]);
  });

  it('on a blocked refusal, retries one by one so everybody else is still invited', async () => {
    const rpc = fakeCommunityRpc(['b']);
    await expect(inviteAll(['a', 'b', 'c'], rpc.send)).resolves.toEqual({
      invited: ['a', 'c'],
      blocked: ['b'],
    });
    expect(rpc.calls).toEqual([['a', 'b', 'c'], ['a'], ['b'], ['c']]);
    expect(rpc.written).toEqual(['a', 'c']);
  });

  it('counts every blocked person in the list', async () => {
    const rpc = fakeCommunityRpc(['a', 'c']);
    await expect(inviteAll(['a', 'b', 'c', 'd'], rpc.send)).resolves.toEqual({
      invited: ['b', 'd'],
      blocked: ['a', 'c'],
    });
  });

  it("rejects 'blocked' when everyone in the list is blocked", async () => {
    const rpc = fakeCommunityRpc(['a', 'b']);
    await expect(inviteAll(['a', 'b'], rpc.send)).rejects.toThrow('blocked');
    expect(rpc.written).toEqual([]);
  });

  it("does not retry a single blocked invitee: their 'blocked' is the answer", async () => {
    const rpc = fakeCommunityRpc(['a']);
    await expect(inviteAll(['a'], rpc.send)).rejects.toThrow('blocked');
    expect(rpc.calls).toEqual([['a']]);
  });

  it('does not retry any other refusal of the list', async () => {
    const rpc = fakeCommunityRpc([], { id: 'b', code: 'forbidden' });
    await expect(inviteAll(['a', 'b', 'c'], rpc.send)).rejects.toThrow('forbidden');
    expect(rpc.calls).toEqual([['a', 'b', 'c']]);
  });

  it('stops the fallback at a non-block error, keeping who was already invited', async () => {
    // The list is refused for 'b'; going one by one, 'c' then hits a network error.
    const written: string[] = [];
    const send = vi.fn(async (ids: string[]) => {
      if (ids.length > 1 || ids[0] === 'b') throw new Error('blocked');
      if (ids[0] === 'c') throw new Error('unknown_error');
      written.push(...ids);
    });
    await expect(inviteAll(['a', 'b', 'c', 'd'], send)).rejects.toThrow('unknown_error');
    expect(written).toEqual(['a']);
    expect(send).toHaveBeenCalledTimes(4); // the list, then a, b, c — never d
  });

  it('passes an empty selection through as one call, as before', async () => {
    const rpc = fakeCommunityRpc([]);
    await expect(inviteAll([], rpc.send)).resolves.toEqual({ invited: [], blocked: [] });
    expect(rpc.calls).toEqual([[]]);
  });

  it('does not hand the caller its own array to mutate', async () => {
    const ids = ['a', 'b'];
    const outcome = await inviteAll(ids, async () => {});
    outcome.invited.push('z');
    expect(ids).toEqual(['a', 'b']);
  });
});

// What the three multi-select pickers show once a send settles. They used to choose inline; a
// screen that drifted (the wrong count, or the generic error for a block) would have passed every
// other test here.
describe('inviteNotice (the banner or toast after a send)', () => {
  it("says the screen's own sent copy when nobody was refused", () => {
    const outcome = { invited: ['a', 'b'], blocked: [] };
    expect(inviteNotice({ outcome }, 2, 'inviteSentToast')).toEqual({
      key: 'inviteSentToast',
      tone: 'success',
    });
    expect(inviteNotice({ outcome }, 2, 'inviteSentBody').key).toBe('inviteSentBody');
  });

  it('counts the refused, not the selection, when the others were sent', () => {
    const outcome = { invited: ['a', 'c', 'd'], blocked: ['b', 'e'] };
    expect(inviteNotice({ outcome }, 5, 'inviteSentToast')).toEqual({
      key: 'inviteSentSomeBlocked',
      count: 2,
      tone: 'success',
    });
  });

  it("counts the whole selection on 'blocked': nobody could be invited", () => {
    expect(inviteNotice({ error: new Error('blocked') }, 3, 'inviteSentToast')).toEqual({
      key: 'invitesBlocked',
      count: 3,
      tone: 'error',
    });
    expect(inviteNotice({ error: new Error('blocked') }, 1, 'inviteSentBody')).toEqual({
      key: 'invitesBlocked',
      count: 1,
      tone: 'error',
    });
  });

  it('passes any other code through for the screen to translate, with no count', () => {
    expect(inviteNotice({ error: new Error('forbidden') }, 3, 'inviteSentToast')).toEqual({
      key: 'forbidden',
      tone: 'error',
    });
  });

  it('falls back to unknown_error for something that is not an Error', () => {
    expect(inviteNotice({ error: 'offline' }, 2, 'inviteSentToast')).toEqual({
      key: 'unknown_error',
      tone: 'error',
    });
  });

  it('agrees with what the helpers settle to, end to end', async () => {
    // Group: one call per person, 'b' blocked.
    const sendOne = async (id: string) => {
      if (id === 'b') throw new Error('blocked');
    };
    const outcome = await inviteEach(['a', 'b', 'c'], sendOne);
    expect(inviteNotice({ outcome }, 3, 'inviteSentToast')).toMatchObject({
      key: 'inviteSentSomeBlocked',
      count: 1,
    });
    // Community: everyone in the list blocked, so the send rejects.
    const rpc = fakeCommunityRpc(['a', 'b']);
    const error = await inviteAll(['a', 'b'], rpc.send).catch((e: unknown) => e);
    expect(inviteNotice({ error }, 2, 'inviteSentBody')).toEqual({
      key: 'invitesBlocked',
      count: 2,
      tone: 'error',
    });
  });
});
