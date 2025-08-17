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
import EllipsisTick from "./EllipsisTick";
import { fmtInt } from "../../utils/format";

/**
 * Props:
 * - data: [{name, display, value, count}]
 * - isSmall, isPhone
 * - axisTick(), gridStroke(), tooltipColors()
 * - colorAt(i)
 * - onBarClick(status)
 */
export default function HoursByStatusChart({
  data,
  isSmall,
  isPhone,
  axisTick,
  gridStroke,
  tooltipColors,
  colorAt,
  onBarClick,
}) {
  if (!data?.length) {
    return (
      <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold text-content-primary">Hours by status</h2>
        <div className="text-sm text-content-muted">No data.</div>
      </section>
    );
  }

  const bottomForTicks = isPhone ? 44 : isSmall ? 32 : 36;
  const topForPlot = 16;

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-content-primary">Hours by status</h2>
      </div>

      {isPhone ? (
        <div className="overflow-x-auto">
          <div
            className="h-64"
            style={{ minWidth: Math.max(data.length * 120, 640) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{
                  top: topForPlot,
                  right: 8,
                  left: 0,
                  bottom: bottomForTicks,
                }}
                barCategoryGap={16}
                barGap={4}
              >
                <CartesianGrid stroke={gridStroke()} vertical={false} />
                <XAxis
                  dataKey="display"
                  interval={0}
                  tick={
                    <EllipsisTick
                      angle={-18}
                      maxChars={18}
                      color={axisTick()}
                    />
                  }
                  tickLine={false}
                  height={bottomForTicks}
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
                    `${fmtInt(value)} h`,
                    `${payload.name} (${fmtInt(payload.count)} games)`,
                  ]}
                />
                <Bar dataKey="value" barSize={22} radius={[6, 6, 0, 0]}>
                  {data.map((row, i) => (
                    <Cell
                      key={i}
                      fill={colorAt(i)}
                      cursor="pointer"
                      onClick={() => onBarClick(row.name)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{
                top: topForPlot,
                right: 8,
                left: 0,
                bottom: bottomForTicks,
              }}
              barCategoryGap={16}
              barGap={4}
            >
              <CartesianGrid stroke={gridStroke()} vertical={false} />
              <XAxis
                dataKey="display"
                interval={0}
                tick={
                  <EllipsisTick angle={-18} maxChars={22} color={axisTick()} />
                }
                tickLine={false}
                height={bottomForTicks}
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
                  `${fmtInt(value)} h`,
                  `${payload.name} (${fmtInt(payload.count)} games)`,
                ]}
              />
              <Bar dataKey="value" barSize={28} radius={[6, 6, 0, 0]}>
                {data.map((row, i) => (
                  <Cell
                    key={i}
                    fill={colorAt(i)}
                    cursor="pointer"
                    onClick={() => onBarClick(row.name)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
