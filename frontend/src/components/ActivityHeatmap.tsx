import { DailyCommit } from '../api/client';

interface Props {
  data: DailyCommit[];
  referenceDate?: string | null;
}

const DAYS = 90;

function cellColor(count: number): string {
  if (count === 0) return 'rgba(255, 255, 255, 0.05)';
  if (count <= 2) return 'rgba(203, 255, 96, 0.32)';
  if (count <= 5) return 'rgba(203, 255, 96, 0.62)';
  return 'rgba(203, 255, 96, 0.95)';
}

export default function ActivityHeatmap({ data, referenceDate }: Props) {
  const counts = new Map(data.map((d) => [d.date, d.commits]));
  const anchor = referenceDate ? new Date(referenceDate) : new Date();
  const endUtc = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  );

  const cells: { date: string; count: number }[] = [];
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const dt = new Date(endUtc.getTime() - offset * 86_400_000);
    const iso = dt.toISOString().slice(0, 10);
    cells.push({ date: iso, count: counts.get(iso) || 0 });
  }

  const totalInWindow = cells.reduce((sum, cell) => sum + cell.count, 0);
  const activeDays = cells.filter((cell) => cell.count > 0).length;

  return (
    <section
      className="glass p-6"
      role="region"
      aria-label="90-day UTC commit activity heatmap"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-slate-600 text-sm font-semibold">90-Day Activity Heatmap</h3>
        <span className="text-[11px] text-slate-400">
          {totalInWindow} sampled commits across {activeDays} active UTC days
        </span>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
        aria-hidden="true"
      >
        {cells.map((cell) => (
          <div
            key={cell.date}
            className="aspect-square rounded-[3px] border border-white/5 transition-transform hover:scale-110"
            style={{ backgroundColor: cellColor(cell.count) }}
            title={`${cell.date} (UTC): ${cell.count} commit${cell.count === 1 ? '' : 's'}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-slate-400">
        <span>Less</span>
        {[0, 1, 3, 6].map((level) => (
          <span
            key={level}
            className="w-2.5 h-2.5 rounded-[2px] border border-white/10"
            style={{ backgroundColor: cellColor(level) }}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
