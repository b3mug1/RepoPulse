import { DailyCommit } from '../api/client';
import { useLocale } from '../i18n';

interface Props {
  data: DailyCommit[];
  referenceDate?: string | null;
}

const DAYS = 90;

function cellStyle(count: number): { backgroundColor: string; boxShadow?: string } {
  if (count === 0) return { backgroundColor: 'rgba(255, 255, 255, 0.045)' };
  if (count <= 2) return { backgroundColor: 'rgba(203, 255, 96, 0.28)' };
  if (count <= 5) return { backgroundColor: 'rgba(203, 255, 96, 0.58)' };
  return {
    backgroundColor: 'rgba(203, 255, 96, 0.92)',
    boxShadow: '0 0 10px rgba(203, 255, 96, 0.25)',
  };
}

interface DayCell {
  date: string;
  count: number;
  month: number;
  inRange: boolean;
}

export default function ActivityHeatmap({ data, referenceDate }: Props) {
  const { t, dateLocale } = useLocale();
  const counts = new Map(data.map((d) => [d.date, d.commits]));
  const anchor = referenceDate ? new Date(referenceDate) : new Date();
  const endUtc = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  );

  const rawDays: DayCell[] = [];
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const dt = new Date(endUtc.getTime() - offset * 86_400_000);
    const iso = dt.toISOString().slice(0, 10);
    rawDays.push({
      date: iso,
      count: counts.get(iso) || 0,
      month: dt.getUTCMonth(),
      inRange: true,
    });
  }

  // Align to Monday-first 7-row calendar columns
  const firstDate = new Date(`${rawDays[0].date}T00:00:00Z`);
  const leadingPad = (firstDate.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const padded: DayCell[] = [
    ...Array.from({ length: leadingPad }, (_, i) => ({
      date: `pad-start-${i}`,
      count: 0,
      month: -1,
      inRange: false,
    })),
    ...rawDays,
  ];
  while (padded.length % 7 !== 0) {
    padded.push({
      date: `pad-end-${padded.length}`,
      count: 0,
      month: -1,
      inRange: false,
    });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const monthFormatter = new Intl.DateTimeFormat(dateLocale, { month: 'short', timeZone: 'UTC' });
  const weekLabels = weeks.map((week, idx) => {
    const firstValid = week.find((c) => c.inRange);
    if (!firstValid) return '';
    const prevValid = idx > 0 ? weeks[idx - 1].find((c) => c.inRange) : null;
    if (idx === 0 || (prevValid && prevValid.month !== firstValid.month)) {
      return monthFormatter.format(new Date(`${firstValid.date}T00:00:00Z`));
    }
    return '';
  });

  const totalInWindow = rawDays.reduce((sum, cell) => sum + cell.count, 0);
  const activeDays = rawDays.filter((cell) => cell.count > 0).length;
  const peakDay = rawDays.reduce((max, cell) => (cell.count > max ? cell.count : max), 0);
  const avgActive = activeDays > 0 ? (totalInWindow / activeDays).toFixed(1) : '0.0';

  return (
    <section
      className="glass p-6"
      role="region"
      aria-label={t.heatmapAria}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h3 className="text-slate-200 text-sm font-semibold">{t.heatmapTitle}</h3>
        <span className="text-[11px] text-slate-400">
          {t.heatmapSubtitle(totalInWindow, activeDays)}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="overflow-x-auto pb-1" aria-hidden="true">
          <div className="inline-flex flex-col gap-1.5">
            {/* Month header */}
            <div className="flex gap-1.5 pl-7 text-[10px] text-slate-400">
              {weeks.map((_, idx) => (
                <span key={`m-${idx}`} className="w-4 sm:w-5 truncate">
                  {weekLabels[idx]}
                </span>
              ))}
            </div>

            {/* Weekday labels + 7xN grid */}
            <div className="flex gap-2 items-stretch">
              <div className="grid grid-rows-7 gap-1.5 text-[10px] text-slate-500 w-5 text-right pr-1 select-none">
                <span className="leading-4 sm:leading-5">{t.heatmapWeekdays[0]}</span>
                <span />
                <span className="leading-4 sm:leading-5">{t.heatmapWeekdays[1]}</span>
                <span />
                <span className="leading-4 sm:leading-5">{t.heatmapWeekdays[2]}</span>
                <span />
                <span />
              </div>

              <div className="flex gap-1.5">
                {weeks.map((week, wIdx) => (
                  <div key={`w-${wIdx}`} className="grid grid-rows-7 gap-1.5">
                    {week.map((cell) =>
                      cell.inRange ? (
                        <div
                          key={cell.date}
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded-[4px] border border-white/[0.06] transition-transform hover:scale-110"
                          style={cellStyle(cell.count)}
                          title={t.heatmapTooltip(cell.date, cell.count)}
                        />
                      ) : (
                        <div key={cell.date} className="w-4 h-4 sm:w-5 sm:h-5" />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Compact summary + legend */}
        <div className="flex flex-col justify-between gap-4 lg:w-56 shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.08] pt-4 lg:pt-0 lg:pl-6">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.heatmapActiveDays}</p>
              <p className="text-base font-bold text-slate-100 tabular-nums">{activeDays} <span className="text-xs font-normal text-slate-400">/ {DAYS}</span></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.heatmapPeakDay}</p>
              <p className="text-base font-bold text-[#cbff60] tabular-nums">{peakDay}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.heatmapAvgActive}</p>
              <p className="text-base font-bold text-slate-100 tabular-nums">{avgActive}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span>{t.less}</span>
            {[0, 1, 3, 6].map((level) => (
              <span
                key={level}
                className="w-3 h-3 rounded-[3px] border border-white/10"
                style={cellStyle(level)}
              />
            ))}
            <span>{t.more}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
