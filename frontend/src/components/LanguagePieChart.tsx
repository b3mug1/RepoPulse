import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useLocale } from '../i18n';

interface Props {
  distribution: Record<string, number>;
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#3b82f6',
];

export default function LanguagePieChart({ distribution }: Props) {
  const { t } = useLocale();
  const data = Object.entries(distribution)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="glass p-6">
        <h3 className="text-slate-200 text-sm font-semibold mb-5">{t.languagesTitle}</h3>
        <p className="text-slate-400 text-sm">{t.noLanguageData}</p>
      </div>
    );
  }

  return (
    <div className="glass p-6" role="region" aria-label={t.languagesAria}>
      <h3 className="text-slate-200 text-sm font-semibold mb-5">{t.languagesTitle}</h3>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex-shrink-0" aria-hidden="true">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                stroke="rgba(21,22,25,0.85)"
                strokeWidth={2}
              >
                {data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={0.85} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(24,25,29,0.95)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
                labelStyle={{ color: '#e6e6e8', fontSize: 12 }}
                itemStyle={{ color: '#e6e6e8', fontSize: 12 }}
                formatter={(value: number) => `${value.toFixed(1)}%`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2.5 w-full">
          {data.slice(0, 6).map((lang, i) => (
            <div key={lang.name} className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-slate-200 text-xs flex-1 font-medium">{lang.name}</span>
              <span className="text-slate-400 text-xs tabular-nums">{lang.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
