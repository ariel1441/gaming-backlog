import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartEmpty from "./ChartEmpty";
import { fmtInt } from "../../utils/format";

export default function DateTimelineChart({
  data,
  axisTick,
  gridStroke,
  tooltipColors,
  onBarClick,
}) {
  const handleBarClick = (dateType, row) => {
    const year = row?.year ?? row?.payload?.year;
    onBarClick?.(dateType, year);
  };

  return (
    <div className="h-72">
      {data?.length ? (
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
            <RTooltip
              cursor={{ fill: "transparent" }}
              wrapperStyle={{ outline: "none" }}
              contentStyle={{
                background: tooltipColors().bg,
                border: `1px solid ${tooltipColors().border}`,
                borderRadius: 8,
              }}
              labelStyle={{ color: tooltipColors().text }}
              itemStyle={{ color: tooltipColors().text }}
              formatter={(value, name) => [fmtInt(value), name]}
            />
            <Legend wrapperStyle={{ color: axisTick(), fontSize: 12 }} />
            <Bar
              dataKey="started"
              name="Started"
              fill="var(--chart-1)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(row) => handleBarClick("started", row)}
            />
            <Bar
              dataKey="finished"
              name="Finished"
              fill="var(--chart-2)"
              radius={[6, 6, 0, 0]}
              cursor="pointer"
              onClick={(row) => handleBarClick("finished", row)}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty message="Add start or finish dates to see a timeline." />
      )}
    </div>
  );
}
