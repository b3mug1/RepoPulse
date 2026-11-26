import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';
import * as client from '../../api/client';

describe('Auth session persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.restoreAllMocks();
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
    vi.spyOn(client, 'getAllAnalysisHistory').mockResolvedValue({
      items: [],
      total: 0,
      limit: 4,
      offset: 0,
    });
    vi.spyOn(client, 'getExploreRepos').mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })
    );
  });

  it('preserves token and cached user when /auth/me fails with 502', async () => {
    store['repopulse_auth_token'] = 'valid-session-token';
    store['repopulse_auth_user'] = JSON.stringify({
      id: 'u1',
      username: 'b3mug1',
      avatar_url: null,
      github_id: 123,
    });

    vi.spyOn(client, 'getCurrentUser').mockRejectedValue({
      response: { status: 502 },
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('@b3mug1')).toBeInTheDocument();

    await waitFor(() => {
      expect(client.getCurrentUser).toHaveBeenCalled();
    });

    expect(store['repopulse_auth_token']).toBe('valid-session-token');
    expect(screen.getByText('@b3mug1')).toBeInTheDocument();
  });

  it('clears token and cached user when /auth/me returns 401', async () => {
    store['repopulse_auth_token'] = 'expired-token';
    store['repopulse_auth_user'] = JSON.stringify({
      id: 'u1',
      username: 'b3mug1',
      avatar_url: null,
      github_id: 123,
    });

    vi.spyOn(client, 'getCurrentUser').mockRejectedValue({
      response: { status: 401 },
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(store['repopulse_auth_token']).toBeUndefined();
      expect(store['repopulse_auth_user']).toBeUndefined();
    });
  });
});
