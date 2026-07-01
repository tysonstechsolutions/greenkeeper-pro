"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface GddMilestone {
  gdd: number;
  label: string;
  color: string;
}

export interface GddDailyPoint {
  date: string;
  gdd: number;
  cumulative: number;
}

export function GddSeasonChart({
  data,
  milestones,
}: {
  data: GddDailyPoint[];
  milestones: GddMilestone[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={(date) =>
            new Date(date + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                <p className="text-sm font-medium">
                  {new Date(data.date + "T12:00:00").toLocaleDateString(
                    "en-US",
                    { month: "long", day: "numeric" }
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Daily: {data.gdd} GDD
                </p>
                <p className="text-sm font-semibold text-primary">
                  Cumulative: {data.cumulative} GDD
                </p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="cumulative"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
        {/* Milestone reference lines */}
        {milestones.slice(0, 3).map((milestone) => (
          <ReferenceLine
            key={milestone.gdd}
            y={milestone.gdd}
            stroke={milestone.color}
            strokeDasharray="5 5"
            label={{
              value: `${milestone.gdd}`,
              position: "right",
              fontSize: 10,
              fill: milestone.color,
            }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
