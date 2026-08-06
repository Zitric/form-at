// iOS UIScrollView's canonical bounce curve, as a pure helper. Consumed by
// SwipeNavigator's at-edge dampening.
//
// Properties that matter: small displacements follow near-linearly; at
// `displacement === limit` the visible offset is exactly limit/2; the curve
// asymptotes toward `limit`, so however hard the user pulls the surface never
// travels further than `limit` from rest — that asymptote IS the "this is the
// edge" signal. Sign-preserving.
export function rubberBand(displacement: number, limit: number): number {
  if (limit === 0) return 0;
  const abs = Math.abs(displacement);
  return Math.sign(displacement) * limit * (1 - 1 / (abs / limit + 1));
}
