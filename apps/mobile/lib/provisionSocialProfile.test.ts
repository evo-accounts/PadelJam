import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the fetch call shape, not the edge function itself.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// We need SUPABASE_URL — stub the module.
vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co' }));

// Import after mocks are set up.
const { provisionSocialProfile } = await import('./provisionSocialProfile');

describe('provisionSocialProfile', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('POSTs to provision-social-profile with the access token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('test-token-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/provision-social-profile',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
      }),
    );
  });

  it('includes full_name in body when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('tok', 'Maria Santos');
    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ full_name: 'Maria Santos' });
  });

  it('sends empty body when name is not provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('tok');
    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({});
  });

  it('throws provision_failed on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'some error' }) });
    await expect(provisionSocialProfile('tok')).rejects.toThrow('provision_failed');
  });
});
