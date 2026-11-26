import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { AnalysisHistoryItem } from '../api/client';
import { useLocale } from '../i18n';

interface Props {
  history: AnalysisHistoryItem[];
}

export default function HealthTrendChart({ history }: Props) {
  const { t, dateLocale } = useLocale();
  const completed = [...history]
    .filter((item) => item.status === 'completed' && item.health_score !== null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((item) => ({
      date: new Date(item.created_at).toLocaleDateString(dateLocale),
      health: item.health_score,
      commitsPerMonth: Number((item.commits_per_month ?? 0).toFixed(1)),
    }));

  if (completed.length < 2) {
    return null;
  }

  return (
    <div className="mb-6" role="region" aria-label={t.healthTrendAria}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-slate-600 text-xs font-semibold uppercase tracking-wider">
          {t.healthTrendTitle}
        </h3>
        <span className="text-[11px] text-slate-400">
          {t.healthTrendLegend}
        </span>
      </div>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={completed}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9a9ba3' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="health"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#9a9ba3' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="velocity"
              orientation="right"
              tick={{ fontSize: 10, fill: '#9a9ba3' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(24,25,29,0.95)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
              }}
              labelStyle={{ color: '#e6e6e8', fontSize: 12 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Line
              yAxisId="health"
              type="monotone"
              dataKey="health"
              name={t.healthScoreLabel}
              stroke="#cbff60"
              strokeWidth={2.5}
              dot={{ r: 3.5 }}
            />
            <Line
              yAxisId="velocity"
              type="monotone"
              dataKey="commitsPerMonth"
              name={t.commitsPer30dLabel}
              stroke="#a78bfa"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
