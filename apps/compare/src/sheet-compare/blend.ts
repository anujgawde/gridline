/* The blend slider runs 0–100. In the middle both revisions are fully drawn;
   towards either end the other one fades out. */
export function blendOpacities(blend: number) {
  const t = blend / 100;
  return { from: Math.min(1, 2 - 2 * t), to: Math.min(1, 2 * t) };
}

/* Which revision the slider is leaning towards, and how far the other has
   faded. */
export function blendLabel(blend: number, from: number, to: number) {
  if (blend === 50) return "both";
  return blend < 50 ? `REV ${from} ${100 - 2 * blend}%` : `REV ${to} ${2 * blend - 100}%`;
}
