export const RIPOSTE = {
  range: 245,
  window: 0.65,
  perfectWindow: 0.85,
  contact: 0.32,
  duration: 0.76,
  damage: 16,
  perfectDamage: 20,
  pressure: 58,
  perfectPressure: 74,
} as const;
export function nonlethalDamage(hp: number, damage: number): number {
  return Math.max(0, Math.min(damage, hp - 1));
}
/** Recoil, forward burst, cut, follow-through and return; simulation owns displacement. */
export function riposteTravel(age: number): number {
  const smooth = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  };
  return age < 0.12
    ? 0
    : age < 0.3
      ? smooth((age - 0.12) / 0.18)
      : age < 0.46
        ? 1
        : 1 - smooth((age - 0.46) / 0.25);
}
