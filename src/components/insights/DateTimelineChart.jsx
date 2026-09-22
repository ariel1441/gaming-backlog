import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartEmpty from "./ChartEmpty";
import { fmtInt } from "../../utils/format";

function DateLegend() {
  return <div className="mt-3 flex items-center justify-center gap-4 text-xs text-content-muted">
    <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" />Added</span>
    <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-2)]" />Started</span>
    <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-3)]" />Finished</span>
  </div>;
}

function DateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const values = Object.fromEntries(payload.map((item) => [item.dataKey, item.value]));
  return <div className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm shadow-menu">
    <p className="font-medium text-content-primary">{label}</p>
    <p className="mt-1 text-content-secondary">Added: {fmtInt(values.added)}</p>
    <p className="text-content-secondary">Started: {fmtInt(values.started)}</p>
    <p className="text-content-secondary">Finished: {fmtInt(values.finished)}</p>
  </div>;
}

function YearSummary({ row, onBarClick }) {
  const metrics = [
    { key: "added", label: "Added", color: "bg-[var(--chart-1)]" },
    { key: "started", label: "Started", color: "bg-[var(--chart-2)]" },
    { key: "finished", label: "Finished", color: "bg-[var(--chart-3)]" },
  ];
  const max = Math.max(1, ...metrics.map(({ key }) => row[key] || 0));
  return <div className="flex min-h-64 flex-col justify-center gap-5">
    {metrics.map(({ key, label, color }) => <button key={key} type="button" onClick={() => onBarClick?.(key, row.year)} className="rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <div className="flex items-baseline justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-content-primary"><i className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />{label}</span><span className="text-2xl font-semibold text-content-primary">{fmtInt(row[key])}</span></div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-elevated"><div className={`h-full rounded-full ${color}`} style={{ width: `${((row[key] || 0) / max) * 100}%` }} /></div>
    </button>)}
  </div>;
}

export default function DateTimelineChart({
  data,
  axisTick,
  gridStroke,
  onBarClick,
}) {
  const handleBarClick = (dateType, row) => {
    const year = row?.year ?? row?.payload?.year;
    onBarClick?.(dateType, year);
  };

  return (
    <div>
      {data?.length === 1 ? <YearSummary row={data[0]} onBarClick={onBarClick} /> : data?.length ? (
        <>
        <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            barCategoryGap={20}
          >
            <CartesianGrid stroke={gridStroke()} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: axisTick() }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: axisTick() }}
            />
            <RTooltip cursor={{ fill: "transparent" }} wrapperStyle={{ outline: "none" }} content={<DateTooltip />} />
            <Bar
              dataKey="added"
              name="Added"
              fill="var(--chart-1)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(row) => handleBarClick("added", row)}
            />
            <Bar
              dataKey="started"
              name="Started"
              fill="var(--chart-2)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(row) => handleBarClick("started", row)}
            />
            <Bar
              dataKey="finished"
              name="Finished"
              fill="var(--chart-3)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(row) => handleBarClick("finished", row)}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
        <DateLegend />
        </>
      ) : (
        <ChartEmpty message="Add games or save start and finish dates to see a timeline." />
      )}
    </div>
  );
}
