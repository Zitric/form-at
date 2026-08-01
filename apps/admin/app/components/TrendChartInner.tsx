import { Muted } from "@form-at/ui";
import { colors } from "@form-at/ui/tokens";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { useMemo } from "react";
import { niceIntegerTicks } from "~/utils/chartTicks";
import { bucketStartDates } from "~/utils/trendDates";

interface TrendChartInnerProps {
  data: number[];
  bucketDays: number;
}

// Exported so tests can assert the container's explicit height matches this
// constant directly, rather than duplicating the magic number and risking
// drift (see TrendChart.test.tsx).
export const HEIGHT = 140;
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
  // Distinct from the empty-array case below: real buckets exist, every one
  // is genuinely 0. The chart frame stays (a tracked window where nothing
  // happened is a different fact from "never tracked"), but a bare axis
  // frame with no bars reads as broken next to a nonzero total elsewhere on
  // the card — this note makes the flatness read as deliberate.
  const isAllZero = data.length > 0 && data.every((value) => value === 0);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<{
      value: number;
      date: Date;
    }>();

  // Empty and all-zero are different facts, rendered differently:
  //   - empty (data.length === 0): nothing was ever fetched for this
  //     window — an axis frame with zero ticks would just look broken, so
  //     this says so explicitly instead of drawing a near-blank chart.
  //   - all-zero (every bucket is 0): a real 60-day window WAS tracked and
  //     genuinely nothing happened — the chart frame (axes + a flat
  //     baseline) is the honest rendering, not a "no data" message that
  //     would misrepresent "tracked, flat" as "untracked".
  // Both keep the same fixed HEIGHT so switching between charts with and
  // without data doesn't reflow the page.
  if (data.length === 0) {
    return (
      <div data-testid="trend-chart" style={{ height: HEIGHT }} className="flex items-center">
        <Muted>no data in this window</Muted>
      </div>
    );
  }

  return (
    // Explicit height, not left to flow from HEIGHT via the SVG alone —
    // @visx/responsive's ParentSize sizes its own wrapper div to
    // `height: 100%`, which resolves to 0 against a height:auto ancestor.
    // That doesn't shrink the SVG itself (its `height` attribute below is
    // the hardcoded HEIGHT constant, unaffected), but a 0-height ancestor
    // still collapses to zero space in normal document flow, so later
    // siblings (the next TerminalRow, the next chart) get positioned as if
    // this chart weren't there — painting over it. The chart was never
    // actually missing; it was rendering correctly underneath whatever
    // came after it. Confirmed via a real browser: the <rect> bars had
    // correct, non-zero, data-derived dimensions the whole time — this is
    // a layout bug, not a data or lazy-loading one.
    <div data-testid="trend-chart" className="relative" style={{ height: HEIGHT }}>
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
                      data-testid="chart-bar"
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
                  tickValues={niceIntegerTicks(maxValue)}
                  tickFormat={(v) => String(v)}
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
      {isAllZero && <Muted className="text-xs -mt-1">no activity in this window</Muted>}
    </div>
  );
}
