import React from "react";
import {
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import Segmented from "./Segmented";
import { fmtInt } from "../../utils/format";

/**
 * Props:
 * - data: [{ key, count, hoursRounded }]
 * - accessor: "count" | "hoursRounded"
 * - isSmall
 * - axisTick(), gridStroke(), tooltipColors()
 * - colorAt(i)
 * - groupKeys: ["planned","playing","done", ...]
 * - genreType, onGenreTypeChange
 * - genreMetric, onGenreMetricChange
 * - genreStatus, onGenreStatusChange
 * - onBarClick(row)
 */
export default function GenresChart({
  data,
  accessor,
  isSmall,
  axisTick,
  gridStroke,
  tooltipColors,
  colorAt,
  groupKeys,
  genreType,
  onGenreTypeChange,
  genreMetric,
  onGenreMetricChange,
  genreStatus,
  onGenreStatusChange,
  onBarClick,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-content-primary">
          Genres ({genreType === "my" ? "My Genre" : "RAWG Genre"})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented
            value={genreType}
            onChange={onGenreTypeChange}
            options={[
              { value: "my", label: "My" },
              { value: "rawg", label: "RAWG" },
            ]}
          />
          <Segmented
            value={genreMetric}
            onChange={onGenreMetricChange}
            options={[
              { value: "count", label: "Count" },
              { value: "hours", label: "Hours" },
            ]}
          />
          <Segmented
            value={genreStatus}
            onChange={onGenreStatusChange}
            options={[{ value: "all", label: "All" }].concat(
              (groupKeys || []).map((g) => ({
                value: g,
                label: g[0].toUpperCase() + g.slice(1),
              }))
            )}
          />
        </div>
      </div>

      {!data?.length ? (
        <div className="text-sm text-content-muted">
          No data. Tag some games with{" "}
          <span className="font-medium">My Genre</span> to populate this chart.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="h-[22rem] w-full"
            style={{
              minWidth: isSmall ? Math.max(data.length * 64, 720) : undefined,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 32 }}
              >
                <CartesianGrid stroke={gridStroke()} vertical={false} />
                <XAxis
                  dataKey="key"
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={60}
                  tick={{ fontSize: 12, fill: axisTick() }}
                />
                <YAxis tick={{ fontSize: 12, fill: axisTick() }} />
                <RTooltip
                  cursor={{ fill: "transparent" }}
                  wrapperStyle={{ outline: "none" }}
                  contentStyle={{
                    background: tooltipColors().bg,
                    border: `1px solid ${tooltipColors().border}`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  labelFormatter={() => ""}
                  formatter={(value, _name, { payload }) => [
                    accessor === "hoursRounded"
                      ? `${fmtInt(value)} h`
                      : `${fmtInt(value)} games`,
                    payload.key,
                  ]}
                />
                <Bar dataKey={accessor} radius={[6, 6, 0, 0]}>
                  {data.map((row, i) => (
                    <Cell
                      key={row.key}
                      fill={colorAt(i)}
                      cursor="pointer"
                      onClick={() => onBarClick(row)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
