import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DailyCommit } from '../api/client';

interface Props {
  data: DailyCommit[];
}

export default function CommitFrequencyChart({ data }: Props) {
  return (
    <div className="glass p-6" role="region" aria-label="Daily commit frequency chart in UTC">
      <div className="flex items-baseline justify-between gap-2 mb-5">
        <h3 className="text-slate-600 text-sm font-semibold">Daily Commits</h3>
        <span className="text-[11px] text-slate-400">UTC calendar days · sampled commits</span>
      </div>
      {data.length === 0 ? (
        <p className="text-slate-300 text-sm">No commit data available.</p>
      ) : (
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis
              dataKey="date"
              stroke="rgba(0,0,0,0.1)"
              tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.35)' }}
              interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
              angle={-45}
              textAnchor="end"
              height={55}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(0,0,0,0.1)"
              tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.35)' }}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: '12px',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
              }}
              labelStyle={{ color: '#475569', fontSize: 12 }}
              itemStyle={{ color: '#1e293b', fontSize: 12 }}
              formatter={(value: number) => [`${value}`, 'Commits']}
            />
            <Bar dataKey="commits" fill="rgba(99,102,241,0.65)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
