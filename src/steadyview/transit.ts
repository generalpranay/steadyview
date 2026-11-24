/**
 * Auto "transit mode": switch to a shake-tolerant reading layout when shaking
 * is sustained, and back once it has been calm for a while. Hysteresis
 * (different on/off thresholds and hold times) stops it flickering.
 */

export type ReadingMode = 'normal' | 'transit' | 'auto';

export interface TransitState {
  active: boolean;
  /** Seconds the shake has been above / below the relevant threshold. */
  heldFor: number;
}

export const TRANSIT = {
  /** Shake RMS (m/s²) that starts counting toward transit mode. */
  onThreshold: 0.9,
  /** Shake RMS below which we start counting toward normal mode. */
  offThreshold: 0.45,
  /** Seconds of sustained shake before switching on. */
  onAfter: 1.5,
  /** Seconds of calm before switching off. */
  offAfter: 5,
} as const;

export function nextTransitState(prev: TransitState, shake: number, dt: number): TransitState {
  if (!prev.active) {
    const heldFor = shake >= TRANSIT.onThreshold ? prev.heldFor + dt : 0;
    return heldFor >= TRANSIT.onAfter ? { active: true, heldFor: 0 } : { active: false, heldFor };
  }
  const heldFor = shake <= TRANSIT.offThreshold ? prev.heldFor + dt : 0;
  return heldFor >= TRANSIT.offAfter ? { active: false, heldFor: 0 } : { active: true, heldFor };
}
