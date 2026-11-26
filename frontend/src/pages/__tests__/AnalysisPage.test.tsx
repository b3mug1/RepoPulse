import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalysisPage from '../AnalysisPage';
import * as client from '../../api/client';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}));

const baseCompleted: client.AnalysisDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  repository_id: '22222222-2222-2222-2222-222222222222',
  repository_full_name: 'acme/demo',
  repository_owner: 'acme',
  repository_name: 'demo',
  status: 'completed',
  progress_stage: 'Completed',
  health: {
    score: 82,
    coverage: 100,
    confidence: 'high',
    grade: 'Excellent',
    formula_version: '1.1',
    breakdown: {},
    findings: [],
  },
  sample_scope: {
    sampled_commits: 10,
    max_commits_limit: 100,
    max_pages_limit: 5,
    is_truncated: false,
    window_start_at: '2025-06-01T00:00:00Z',
    window_end_at: '2025-06-10T00:00:00Z',
    timezone: 'UTC',
  },
  error_message: null,
  metrics: {
    total_commits: 10,
    avg_commit_size: 20,
    commits_per_day: 1,
    commits_per_month: 10,
    code_churn_additions: 150,
    code_churn_deletions: 50,
    avg_time_between_commits_hours: 12,
    bus_factor: 2,
    language_distribution: { TypeScript: 100 },
    commits_per_date: [{ date: '2025-06-09', commits: 10 }],
  },
  ai_insights: {
    ai_summary: 'Demo summary',
    readme_quality_score: 8,
    readme_quality_feedback: 'Good README',
    detected_tech_stack: ['TypeScript'],
    architecture_analysis: 'Clean',
    ai_metadata: { status: 'demo', model: 'deterministic-heuristic', prompt_version: '2.0' },
  },
  contributors: [
    {
      username: 'alice',
      total_commits: 10,
      additions: 150,
      deletions: 50,
      first_commit_at: '2025-06-01T00:00:00Z',
      last_commit_at: '2025-06-10T00:00:00Z',
    },
  ],
  commits_count: 10,
  created_at: '2025-06-10T00:00:00Z',
  completed_at: '2025-06-10T00:01:00Z',
};

describe('AnalysisPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, 'getAnalysisHistory').mockResolvedValue([]);
  });

  it('renders completed report and CSV export link', async () => {
    vi.spyOn(client, 'getAnalysis').mockResolvedValue(baseCompleted);
    render(
      <MemoryRouter initialEntries={['/analysis/11111111-1111-1111-1111-111111111111']}>
        <Routes>
          <Route path="/analysis/:id" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('acme/demo')).toBeInTheDocument();
    });
    expect(screen.getByText('90-Day Activity Heatmap')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^badge$/i }));
    expect(screen.getByLabelText('Markdown badge snippet')).toHaveValue(
      '[![RepoPulse](http://localhost:3000/api/v1/repos/acme/demo/badge.svg)](http://localhost:3000/analysis/11111111-1111-1111-1111-111111111111)'
    );
    const csvLink = screen.getByRole('link', { name: /export csv/i });
    expect(csvLink).toHaveAttribute(
      'href',
      '/api/v1/analyses/11111111-1111-1111-1111-111111111111/export.csv'
    );
  });

  it('renders failed state and triggers retry', async () => {
    vi.spyOn(client, 'getAnalysis').mockResolvedValue({
      ...baseCompleted,
      status: 'failed',
      error_message: 'GitHub is temporarily limiting requests.',
    });
    const retrySpy = vi.spyOn(client, 'retryAnalysis').mockResolvedValue({
      analysis_id: 'new-id',
      repository_id: '22222222-2222-2222-2222-222222222222',
      status: 'pending',
      message: 'queued',
    });

    render(
      <MemoryRouter initialEntries={['/analysis/11111111-1111-1111-1111-111111111111']}>
        <Routes>
          <Route path="/analysis/:id" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('We hit a snag.')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /retry analysis/i }));
    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });
  });

  it('renders polling progress stage while in_progress', async () => {
    vi.spyOn(client, 'getAnalysis').mockResolvedValue({
      ...baseCompleted,
      status: 'in_progress',
      progress_stage: 'Loading commit details (50/100)',
    });

    render(
      <MemoryRouter initialEntries={['/analysis/11111111-1111-1111-1111-111111111111']}>
        <Routes>
          <Route path="/analysis/:id" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Loading commit details (50/100)')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /cancel analysis/i })).toBeInTheDocument();
  });

  it('renders health trend chart when multiple completed analyses exist', async () => {
    vi.spyOn(client, 'getAnalysis').mockResolvedValue(baseCompleted);
    vi.spyOn(client, 'getAnalysisHistory').mockResolvedValue([
      {
        id: 'prev-1',
        status: 'completed',
        total_commits: 8,
        commits_per_month: 8,
        bus_factor: 2,
        health_score: 74,
        health_coverage: 100,
        created_at: '2025-06-01T00:00:00Z',
        completed_at: '2025-06-01T00:01:00Z',
      },
      {
        id: baseCompleted.id,
        status: 'completed',
        total_commits: 10,
        commits_per_month: 10,
        bus_factor: 2,
        health_score: 82,
        health_coverage: 100,
        created_at: '2025-06-10T00:00:00Z',
        completed_at: '2025-06-10T00:01:00Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/analysis/11111111-1111-1111-1111-111111111111']}>
        <Routes>
          <Route path="/analysis/:id" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Health Score & Velocity Trend/i)).toBeInTheDocument();
    });
  });
});
