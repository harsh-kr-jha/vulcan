"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";

interface ChartProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
}

export function Chart({ option, height = 280, className }: ChartProps) {
  return (
    <ReactECharts
      className={className}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}
