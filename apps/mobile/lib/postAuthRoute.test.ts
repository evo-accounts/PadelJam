import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockGetSession = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
  },
}));

// Mock provisionSocialProfile
const mockProvision = vi.fn();
vi.mock('@/lib/provisionSocialProfile', () => ({ provisionSocialProfile: mockProvision }));

const { resolvePostAuthRoute } = await import('./postAuthRoute');

const makeSession = (provider: string, token = 'tok') => ({
  data: {
    session: {
      access_token: token,
      user: { id: 'u1', app_metadata: { provider } },
    },
  },
});

const makeProfileQuery = (profile: object | null) => ({
  from: () => ({ maybeSingle: async () => ({ data: profile }) }),
});

beforeEach(() => { vi.resetAllMocks(); });

describe('resolvePostAuthRoute', () => {
  it('returns sign-in when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await resolvePostAuthRoute()).toBe('/(auth)/sign-in');
  });

  it('returns tabs when profile is onboarded', async () => {
    mockGetSession.mockResolvedValue(makeSession('email'));
    mockRpc.mockReturnValue(makeProfileQuery({ onboarded_at: '2026-01-01', location_text: 'Lisbon', level: 2, dominant_hand: 'right', court_side: 'left' }).from());
    expect(await resolvePostAuthRoute()).toBe('/(tabs)');
  });

  it('location answered, level not → resumes at level; level answered → hand', async () => {
    mockGetSession.mockResolvedValue(makeSession('email'));
    mockRpc.mockReturnValue(makeProfileQuery({ onboarded_at: null, location_text: 'Lisbon', level: null, dominant_hand: null, court_side: null }).from());
    expect(await resolvePostAuthRoute()).toBe('/(onboarding)/level');
    mockRpc.mockReturnValue(makeProfileQuery({ onboarded_at: null, location_text: 'Lisbon', level: 3, dominant_hand: null, court_side: null }).from());
    expect(await resolvePostAuthRoute()).toBe('/(onboarding)/hand');
  });

  it('OTP user with no profile → create-account (no provision called)', async () => {
    mockGetSession.mockResolvedValue(makeSession('email'));
    mockRpc.mockReturnValue(makeProfileQuery(null).from());
    expect(await resolvePostAuthRoute()).toBe('/(auth)/create-account');
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('social user with no profile → retries provision then routes to onboarding', async () => {
    mockGetSession.mockResolvedValue(makeSession('apple', 'tok'));
    mockProvision.mockResolvedValue(undefined);
    let calls = 0;
    mockRpc.mockReturnValue({
      maybeSingle: async () => {
        calls++;
        // First call: no profile. Second call (after provision): profile exists.
        return calls === 1
          ? { data: null }
          : { data: { onboarded_at: null, location_text: null, level: null, dominant_hand: null, court_side: null } };
      },
    });
    expect(await resolvePostAuthRoute()).toBe('/(onboarding)/location');
    expect(mockProvision).toHaveBeenCalledWith('tok', undefined);
  });

  it('social user provision fails → falls through to create-account', async () => {
    mockGetSession.mockResolvedValue(makeSession('google', 'tok'));
    mockProvision.mockRejectedValue(new Error('provision_failed'));
    mockRpc.mockReturnValue(makeProfileQuery(null).from());
    expect(await resolvePostAuthRoute()).toBe('/(auth)/create-account');
  });

  it('auto-linked social user (provider=email, providers includes google) with no profile → retries provision then routes to onboarding', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          user: { id: 'u1', app_metadata: { provider: 'email', providers: ['email', 'google'] } },
        },
      },
    });
    mockProvision.mockResolvedValue(undefined);
    let calls = 0;
    mockRpc.mockReturnValue({
      maybeSingle: async () => {
        calls++;
        // First call: no profile. Second call (after provision): profile exists.
        return calls === 1
          ? { data: null }
          : { data: { onboarded_at: null, location_text: null, level: null, dominant_hand: null, court_side: null } };
      },
    });
    expect(await resolvePostAuthRoute()).toBe('/(onboarding)/location');
    expect(mockProvision).toHaveBeenCalledWith('tok', undefined);
  });
});
