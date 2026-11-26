import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DailyCommit } from '../api/client';
import { useLocale } from '../i18n';

interface Props {
  data: DailyCommit[];
}

export default function CommitFrequencyChart({ data }: Props) {
  const { t } = useLocale();
  return (
    <div className="glass p-6" role="region" aria-label={t.dailyCommitsAria}>
      <div className="flex items-baseline justify-between gap-2 mb-5">
        <h3 className="text-slate-200 text-sm font-semibold">{t.dailyCommitsTitle}</h3>
        <span className="text-[11px] text-slate-400">{t.dailyCommitsSubtitle}</span>
      </div>
      {data.length === 0 ? (
        <p className="text-slate-400 text-sm">{t.noCommitData}</p>
      ) : (
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.08)"
                tick={{ fontSize: 10, fill: '#9a9ba3' }}
                interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
                angle={-45}
                textAnchor="end"
                height={55}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="rgba(255,255,255,0.08)"
                tick={{ fontSize: 10, fill: '#9a9ba3' }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  backgroundColor: 'rgba(24,25,29,0.95)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
                labelStyle={{ color: '#e6e6e8', fontSize: 12 }}
                itemStyle={{ color: '#cbff60', fontSize: 12 }}
                formatter={(value: number) => [`${value}`, t.chartCommitsName]}
              />
              <Bar dataKey="commits" fill="rgba(203,255,96,0.82)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
