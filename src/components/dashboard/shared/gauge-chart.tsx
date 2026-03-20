"use client";

import { cn } from "@/lib/utils";

interface GaugeChartProps {
  value: number;
  max?: number;
  label?: string;
  suffix?: string;
  size?: number;
  className?: string;
}

export function GaugeChart({
  value,
  max = 100,
  label,
  suffix = "%",
  size = 160,
  className,
}: GaugeChartProps) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - pct);

  let color = "var(--success)";
  if (pct < 0.5) color = "var(--destructive)";
  else if (pct < 0.75) color = "var(--warning)";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        width={size}
        height={size / 2 + 20}
        viewBox={`0 0 ${size} ${size / 2 + 20}`}
      >
        {/* Background arc */}
        <path
          d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
          style={{ fontSize: size / 5 }}
        >
          {value.toFixed(1)}{suffix}
        </text>
      </svg>
      {label && (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
