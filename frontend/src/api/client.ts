import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  analysis_id: string;
  repository_id: string;
  status: string;
  message: string;
}

export interface Contributor {
  username: string;
  total_commits: number;
  additions: number;
  deletions: number;
  first_commit_at: string | null;
  last_commit_at: string | null;
}

export interface DailyCommit {
  date: string;
  commits: number;
}

export interface Metrics {
  total_commits: number;
  avg_commit_size: number;
  commits_per_day: number;
  commits_per_month: number;
  code_churn_additions: number;
  code_churn_deletions: number;
  avg_time_between_commits_hours: number;
  bus_factor: number;
  language_distribution: Record<string, number>;
  commits_per_date: DailyCommit[];
}

export interface AIInsights {
  ai_summary: string | null;
  readme_quality_score: number | null;
  readme_quality_feedback: string | null;
  detected_tech_stack: string[];
  architecture_analysis: string | null;
  ai_metadata?: {
    provider?: string;
    model?: string;
    prompt_version?: string;
    status?: string;
    reason?: string;
    data_sent_disclosure?: string;
    role_summaries?: {
      developer?: string;
      manager?: string;
      recruiter?: string;
    };
    evidence_refs?: {
      claim: string;
      source_type: string;
      target: string;
    }[];
  };
}

export interface AnalysisDetail {
  id: string;
  repository_id: string;
  repository_full_name: string;
  repository_owner: string;
  repository_name: string;
  status: string;
  progress_stage: string;
  health: {
    score: number | null;
    coverage: number;
    confidence: string;
    grade: string;
    formula_version: string;
    breakdown: Record<string, {
      label: string;
      score: number | null;
      weight: number;
      weighted_points: number | null;
      status: string;
      explanation: string;
      evidence: string;
    }>;
    findings: { severity: string; title: string; detail: string }[];
  };
  sample_scope: {
    sampled_commits: number;
    max_commits_limit: number;
    max_pages_limit: number;
    is_truncated: boolean;
    window_start_at: string | null;
    window_end_at: string | null;
    timezone: string;
  };
  extended_signals?: {
    pull_requests?: {
      sampled_count: number;
      open_count: number;
      closed_count: number;
      merged_count: number;
      draft_count: number;
      open_ratio: number | null;
      avg_time_to_close_hours: number | null;
      avg_open_age_hours: number | null;
    };
    issues?: {
      sampled_count: number;
      open_count: number;
      closed_count: number;
      avg_open_age_hours: number | null;
      avg_time_to_close_hours: number | null;
    };
    releases?: {
      sampled_count: number;
      latest_tag: string | null;
      latest_published_at: string | null;
      avg_days_between_releases: number | null;
    };
    ci?: {
      providers_detected: string[];
      actions_runs_sampled: number | null;
      actions_success_rate: number | null;
      latest_run_conclusion: string | null;
    };
    governance?: {
      license: string | null;
      default_branch: string;
      branch_protection: string;
      has_codeowners: boolean | null;
    };
    activity_windows?: {
      last_7_days: number;
      last_30_days: number;
      prev_30_days: number;
      last_90_days: number;
      trend_30d: string;
    };
    data_refreshed_at?: string;
  };
  error_message: string | null;
  metrics: Metrics;
  ai_insights: AIInsights;
  contributors: Contributor[];
  commits_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface AnalysisHistoryItem {
  id: string;
  status: string;
  total_commits: number;
  commits_per_month?: number;
  bus_factor: number;
  health_score: number | null;
  health_coverage: number;
  created_at: string;
  completed_at: string | null;
}

export interface GlobalHistoryItem extends AnalysisHistoryItem {
  repository_id: string;
  repository_full_name: string;
  commits_per_month: number;
}

export interface AnalysisHistoryPage {
  items: GlobalHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnalysisComparison {
  left: AnalysisDetail;
  right: AnalysisDetail;
  deltas: {
    health_score: number | null;
    total_commits: number;
    commits_per_month: number;
    avg_commit_size: number;
    bus_factor: number;
    code_churn_additions: number;
    code_churn_deletions: number;
    avg_time_between_commits_hours: number;
  };
}

export interface ShareLinkResult {
  token: string;
  analysis_id: string;
  expires_at: string;
  include_ai_insights: boolean;
  include_contributors: boolean;
  revoked: boolean;
}

// ── API Calls ────────────────────────────────────────────────────────────────

export async function analyzeRepo(owner: string, name: string): Promise<AnalyzeResponse> {
  const { data } = await api.post('/analyses/analyze', { owner, name });
  return data;
}

export async function getAnalysis(analysisId: string): Promise<AnalysisDetail> {
  const { data } = await api.get(`/analyses/${analysisId}`);
  return data;
}

export async function getSharedAnalysis(token: string): Promise<AnalysisDetail> {
  const { data } = await api.get(`/analyses/shared/${token}`);
  return data;
}

export async function cancelAnalysis(analysisId: string): Promise<{ status: string }> {
  const { data } = await api.delete(`/analyses/${analysisId}`);
  return data;
}

export async function retryAnalysis(analysisId: string): Promise<AnalyzeResponse> {
  const { data } = await api.post(`/analyses/${analysisId}/retry`);
  return data;
}

export async function getAnalysisHistory(repositoryId: string): Promise<AnalysisHistoryItem[]> {
  const { data } = await api.get('/analyses/', { params: { repository_id: repositoryId, limit: 10 } });
  return data;
}

export async function getAllAnalysisHistory(params: {
  repository_id?: string;
  status?: string;
  search?: string;
  sort_by?: 'created_at' | 'health_score' | 'total_commits';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<AnalysisHistoryPage> {
  const { data } = await api.get('/analyses/history', { params });
  return data;
}

export async function compareAnalyses(leftId: string, rightId: string): Promise<AnalysisComparison> {
  const { data } = await api.get('/analyses/compare', { params: { left_id: leftId, right_id: rightId } });
  return data;
}

export async function createShareLink(
  analysisId: string,
  payload: { expires_in_hours: number; include_ai_insights: boolean; include_contributors: boolean }
): Promise<ShareLinkResult> {
  const { data } = await api.post(`/analyses/${analysisId}/share`, payload);
  return data;
}

// ── Saved Repositories (localStorage) ────────────────────────────────────────

const SAVED_REPOS_KEY = 'repopulse_saved_repos';

export function getSavedRepos(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_REPOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isRepoSaved(fullName: string): boolean {
  return getSavedRepos().includes(fullName);
}

export function toggleSavedRepo(fullName: string): string[] {
  const current = getSavedRepos();
  const next = current.includes(fullName)
    ? current.filter((item) => item !== fullName)
    : [fullName, ...current].slice(0, 20);
  try {
    localStorage.setItem(SAVED_REPOS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export default api;
