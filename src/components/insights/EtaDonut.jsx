import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
} from "recharts";
import { fmtInt } from "../../utils/format";

/**
 * Props:
 * - data: [{ name, value, count }] (statusData filtered to exclude "done")
 * - eta: { remaining_hours, weekly_hours, weeks, finish_date }
 * - axisTick(), tooltipColors(), colorAt(i)
 * - onSliceClick(status)
 */
export default function EtaDonut({
  data,
  eta,
  tooltipColors,
  colorAt,
  onSliceClick,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-content-primary">ETA</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-center">
        <div className="h-64">
          {!data?.length ? (
            <div className="h-full flex items-center justify-center text-sm text-content-muted">
              No hours to visualize.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                >
                  {data.map((row, i) => (
                    <Cell
                      key={i}
                      fill={colorAt(i)}
                      cursor="pointer"
                      onClick={() => onSliceClick(row.name)}
                    />
                  ))}
                </Pie>
                <RTooltip
                  wrapperStyle={{ outline: "none" }}
                  contentStyle={{
                    background: tooltipColors().bg,
                    border: `1px solid ${tooltipColors().border}`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  labelFormatter={() => ""}
                  formatter={(value, name, { payload }) => [
                    `${fmtInt(value)} h`,
                    `${name} (${fmtInt(payload.count)} games)`,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-content-muted">Remaining</span>
            <span className="font-medium">{fmtInt(eta?.remaining_hours)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-content-muted">Weekly pace</span>
            <span className="font-medium">
              {fmtInt(eta?.weekly_hours)} h/wk
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-content-muted">ETA (weeks)</span>
            <span className="font-medium">{eta?.weeks ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-content-muted">Finish date</span>
            <span className="font-medium">{eta?.finish_date || "—"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
