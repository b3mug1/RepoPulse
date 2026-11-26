import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from '../HomePage';
import * as client from '../../api/client';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
    vi.spyOn(client, 'getAllAnalysisHistory').mockResolvedValue({
      items: [],
      total: 0,
      limit: 4,
      offset: 0,
    });
    vi.spyOn(client, 'getExploreRepos').mockResolvedValue([]);
  });

  it('shows validation error on invalid repo input', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const input = screen.getByLabelText('GitHub repository');
    fireEvent.change(input, { target: { value: 'not-a-repo' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a GitHub repository as owner/repo.');
  });

  it('submits valid owner/repo and navigates to analysis page', async () => {
    const spy = vi.spyOn(client, 'analyzeRepo').mockResolvedValue({
      analysis_id: 'abc-123',
      repository_id: 'repo-1',
      status: 'pending',
      message: 'queued',
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const input = screen.getByLabelText('GitHub repository');
    fireEvent.change(input, { target: { value: 'https://github.com/vercel/next.js' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('vercel', 'next.js');
      expect(mockNavigate).toHaveBeenCalledWith('/analysis/abc-123');
    });
  });

  it('renders explore showcase repositories when returned by API', async () => {
    vi.spyOn(client, 'getExploreRepos').mockResolvedValue([
      {
        analysis_id: 'exp-1',
        full_name: 'fastapi/fastapi',
        description: 'FastAPI framework',
        language: 'Python',
        stars: 82000,
        health_score: 92,
        bus_factor: 3,
        commits_per_month: 64,
        completed_at: '2026-01-01T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(await screen.findByText('92/100')).toBeInTheDocument();
    expect(screen.getByText('fastapi/fastapi')).toBeInTheDocument();
  });
});
