// iOS UIScrollView's canonical bounce curve, lifted into a tiny pure helper
// so it's unit-testable and reusable across surfaces that want the same
// edge-resistance feel. Currently consumed by SwipeNavigator's at-edge
// dampening; the next gesture that needs an asymptotic drag (e.g. a future
// pull-to-refresh) can re-use it without copy-pasting the formula.
//
// Properties of the curve:
//   - Small displacements follow near-linearly (no jarring resistance for
//     a small overscroll).
//   - At `displacement === limit`, the visible offset is exactly limit/2 —
//     the user has reached the "half-pulled-back" point.
//   - The curve asymptotes toward `limit` as displacement grows, so no
//     matter how hard the user pulls, the surface never travels further than
//     `limit` from rest. That's the implicit "this is the edge" signal.
//   - Sign-preserving: negative input → negative output, same magnitude
//     curve.
export function rubberBand(displacement: number, limit: number): number {
  if (limit === 0) return 0;
  const abs = Math.abs(displacement);
  return Math.sign(displacement) * limit * (1 - 1 / (abs / limit + 1));
}
