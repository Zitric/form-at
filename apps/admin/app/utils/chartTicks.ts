// All trend data is integer counts (plays, installs, subscribers) — half an
// install doesn't exist, so the y-axis must never show fractional ticks.
// d3/visx's default `scale.ticks(count)` picks "nice" steps from
// {1, 2, 5} × 10^n independent of whether the domain is integer-valued,
// which produces exactly the fractional ticks this fixes (e.g. a [0, 2]
// domain at numTicks=3 picks step 0.5 → 0, 0.5, 1, 1.5, 2). This computes
// the same "nice step" idea but constrained to whole-number steps, so small
// ranges (e.g. max 2) don't over-produce ticks either.
export function niceIntegerTicks(maxValue: number, targetCount = 4): number[] {
  if (maxValue <= 0) return [0];

  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const rawStep = maxValue / targetCount;
  const step = niceSteps.find((s) => s >= rawStep) ?? Math.ceil(rawStep);

  const ticks: number[] = [];
  for (let v = 0; v <= maxValue; v += step) ticks.push(v);
  return ticks;
}
