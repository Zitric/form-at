import { colors } from "@form-at/ui/tokens";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { useMemo } from "react";
import { bucketStartDates } from "~/utils/trendDates";

interface TrendChartInnerProps {
  data: number[];
  bucketDays: number;
}

const HEIGHT = 140;
const MARGIN = { top: 8, right: 8, bottom: 28, left: 32 };

const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// The real visx implementation — dynamically imported by TrendChart.tsx so
// this module (and all of visx) never lands in the SSR bundle. One <rect>
// per weekly bucket rather than a line/area: 9 discrete points don't
// genuinely interpolate between each other, and discrete bars make
// per-bucket hover trivial (no nearest-point math). Mirrors the ASCII-bar
// convention apps/web's public set-detail page already uses for the same
// shape of data (apps/web/app/utils/fmt.ts's asciiBar) — same idea, real
// rendering, no shared code between the two apps.
export function TrendChartInner({ data, bucketDays }: TrendChartInnerProps) {
  const dates = useMemo(() => bucketStartDates(data.length, bucketDays), [data.length, bucketDays]);
  const maxValue = Math.max(1, ...data);
  const latest = data.at(-1) ?? 0;
  const peak = Math.max(0, ...data);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{
      value: number;
      date: Date;
    }>();

  return (
    <div className="relative">
      <ParentSize>
        {({ width }) => {
          const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
          const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

          const xScale = scaleBand<number>({
            domain: data.map((_, i) => i),
            range: [0, innerWidth],
            padding: 0.3,
          });
          const yScale = scaleLinear<number>({
            domain: [0, maxValue],
            range: [innerHeight, 0],
          });

          return (
            <svg width={width} height={HEIGHT} aria-hidden="true">
              <Group top={MARGIN.top} left={MARGIN.left}>
                {data.map((value, i) => {
                  const date = dates[i] ?? new Date();
                  const barWidth = xScale.bandwidth();
                  const barHeight = innerHeight - yScale(value);
                  const barX = xScale(i) ?? 0;
                  const barY = innerHeight - barHeight;
                  return (
                    <rect
                      key={date.getTime()}
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.max(0, barHeight)}
                      className="transition-colors"
                      fill={tooltipData?.date === date ? colors.purple : colors.gold}
                      onPointerEnter={() =>
                        showTooltip({
                          tooltipData: { value, date },
                          tooltipLeft: barX + barWidth / 2,
                          tooltipTop: barY,
                        })
                      }
                      onPointerLeave={hideTooltip}
                    />
                  );
                })}
                <AxisBottom
                  top={innerHeight}
                  scale={xScale}
                  numTicks={Math.min(data.length, 5)}
                  tickFormat={(i) => shortDateFormat.format(dates[i as number] ?? new Date())}
                  stroke={colors.grey}
                  tickStroke={colors.grey}
                  tickLabelProps={() => ({
                    fill: colors.grey,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textAnchor: "middle",
                  })}
                />
                <AxisLeft
                  scale={yScale}
                  numTicks={3}
                  stroke={colors.grey}
                  tickStroke={colors.grey}
                  tickLabelProps={() => ({
                    fill: colors.grey,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textAnchor: "end",
                    dx: -4,
                    dy: 3,
                  })}
                />
              </Group>
            </svg>
          );
        }}
      </ParentSize>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          unstyled
          top={tooltipTop}
          left={tooltipLeft}
          className="bg-black border border-grey/30 text-white font-mono text-xs px-2 py-1 pointer-events-none"
        >
          {tooltipData.value} · {shortDateFormat.format(tooltipData.date)}
        </TooltipWithBounds>
      )}
      {/* Canvas/SVG bars carry no information for screen readers — this
          mirrors the same figures in text so the data exists in the
          accessibility tree either way. */}
      <p className="sr-only">
        {data.length} weeks, latest {latest}, peak {peak}
      </p>
    </div>
  );
}
