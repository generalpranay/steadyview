/**
 * SteadyView stabilizer engine (the "gimbal").
 *
 * Pure functions only (no React, no native calls) so the same code runs on the
 * UI thread as a worklet and in Jest as plain JS.
 *
 * Model: the on-screen content is a mass on a damped spring anchored to the
 * screen centre. Device shake pushes the mass the opposite way, so fast jitter
 * is cancelled while the spring pulls the page home for slow, intentional
 * movement (a high-pass filter with corner ≈ sqrt(k)/2π Hz).
 *
 * Calm-first design (v2):
 * - Stillness gate: below a shake threshold the gimbal fades out completely,
 *   so a phone at rest — or resting in a steady hand — shows a perfectly still
 *   page. Sensor noise never reaches the screen.
 * - Small, soft corrections: offsets are a few points, eased by a soft limiter.
 *   Large corrections made the page "float", which reads as more shaking.
 * - Generous deadzone on the input to swallow sensor noise.
 *
 * Coordinate conventions
 * - Input `u` is the NEGATIVE of the device's linear acceleration in device
 *   axes (x → right edge, y → top edge), m/s². Reanimated reports this sign on
 *   both platforms (see useSteadyMotion.ts).
 * - Output offsets are in screen points (x → right, y → DOWN).
 * - Output rotation is in radians, clockwise positive (React Native `rotate`).
 * - Gyro rates follow the right-hand rule about device axes (x right, y top,
 *   z out of the screen), rad/s.
 *
 * Pan (sway): in a vehicle the phone also tips forward/back and side to side.
 * The hand pivots a little behind the screen, so a tilt of θ slides the screen
 * by about panLever·θ. Tilt comes from a leaky gyro integrator (like roll), so
 * slow deliberate tilting is ignored and only sway is countered.
 */

export type Strength = 'gentle' | 'balanced' | 'strong';

export interface EngineParams {
  /** Spring stiffness k (1/s²). Corner frequency ≈ sqrt(k)/2π Hz. */
  stiffness: number;
  /** Damping c (1/s). Residual shake at f Hz ≈ c / (2πf). */
  damping: number;
  /** 0..1 — fraction of the measured shake to cancel. */
  gain: number;
  /** Soft limit for translation, in points. */
  maxOffset: number;
  /** Soft limit for counter-rotation, in radians. */
  maxRoll: number;
  /** Points per metre (≈160 pt per inch → ~6300). */
  pxPerMeter: number;
  /** Accel below this (m/s²) is treated as sensor noise and faded out. */
  deadzone: number;
  /** Gyro rate below this (rad/s) is treated as noise. */
  gyroDeadzone: number;
  /** Time constant (s) of the bias tracker that removes residual DC/gravity leak. */
  biasTau: number;
  /** Time constant (s) of the leaky gyro integrator (high-pass for roll). */
  rollTau: number;
  /** Estimated pivot distance behind the screen (m) that turns tilt into sway. */
  panLever: number;
  /** Time constant (s) of the leaky tilt integrator (high-pass for pan). */
  panTau: number;
  /** Shake RMS (m/s²) below which the gimbal is fully asleep. */
  gateLow: number;
  /** Shake RMS (m/s²) above which the gimbal is fully awake. */
  gateHigh: number;
  /** Seconds for the gate to wake up / fall asleep. */
  gateAttack: number;
  gateRelease: number;
  /** Extra latency compensation (s); see README "latency lead". */
  lead: number;
  /** Shake RMS (m/s²) where adaptive gain starts backing off. */
  backoffStart: number;
  /** How quickly gain backs off above backoffStart (m/s²). */
  backoffSpan: number;
}

export interface EngineState {
  x: number; // offset, pt (screen x)
  vx: number;
  y: number; // offset, pt (screen y, down)
  vy: number;
  bx: number; // bias estimate, m/s²
  by: number;
  roll: number; // rad, clockwise
  tiltX: number; // rad, recent tip about device x (forward/back)
  tiltY: number; // rad, recent tip about device y (side to side)
  energy: number; // EMA of |u|², (m/s²)²
  gate: number; // 0 (asleep) .. 1 (awake)
}

export interface EngineInput {
  /** Motion input, m/s² (negative of device linear acceleration). */
  ux: number;
  uy: number;
  /** Gyro rate about the screen normal, rad/s, counter-clockwise positive. */
  gz: number;
  /** Gyro rate about device x (top edge tipping toward the viewer), rad/s. */
  gx: number;
  /** Gyro rate about device y, rad/s. */
  gy: number;
  /** Seconds since previous frame. */
  dt: number;
  /** When false the content eases back to centre. */
  enabled: boolean;
}

export interface EngineOutput {
  translateX: number;
  translateY: number;
  rotate: number;
  /** Shake RMS in m/s² (smoothed). */
  shake: number;
  /** Gain actually applied after the gate and adaptive back-off (0..1). */
  appliedGain: number;
}

const SHARED = {
  pxPerMeter: 6300,
  deadzone: 0.12,
  gyroDeadzone: 0.04,
  biasTau: 1.0,
  rollTau: 0.3,
  panLever: 0.03,
  panTau: 0.3,
  // Wake only for real shake (vehicle, walking), not normal handling.
  gateLow: 0.3,
  gateHigh: 0.7,
  gateAttack: 0.25,
  gateRelease: 0.6,
  lead: 0,
  backoffStart: 3.0,
  backoffSpan: 4.0,
};

export function paramsFor(strength: Strength, leadMs = 0): EngineParams {
  'worklet';
  const base = { ...SHARED, lead: leadMs / 1000 };
  switch (strength) {
    case 'gentle': // ~1.6 Hz corner, ζ≈0.8 — a slight nudge, settles fast
      return { ...base, stiffness: 101, damping: 16, gain: 0.3, maxOffset: 4, maxRoll: 0.006 };
    case 'strong': // ~0.9 Hz corner, ζ≈0.7 — cancels the most
      return { ...base, stiffness: 32, damping: 7.9, gain: 0.75, maxOffset: 14, maxRoll: 0.016 };
    case 'balanced':
    default: // ~1.2 Hz corner, ζ≈0.75 — halfway between the two
      return { ...base, stiffness: 56.8, damping: 11.3, gain: 0.5, maxOffset: 8, maxRoll: 0.01 };
  }
}

export function initialState(): EngineState {
  'worklet';
  return { x: 0, vx: 0, y: 0, vy: 0, bx: 0, by: 0, roll: 0, tiltX: 0, tiltY: 0, energy: 0, gate: 0 };
}

/** Smooth limiter: linear near zero, asymptotically approaches ±limit. */
export function softClamp(v: number, limit: number): number {
  'worklet';
  if (limit <= 0) return 0;
  return limit * Math.tanh(v / limit);
}

/** Fades out values smaller than the deadzone instead of a hard cut. */
export function softDeadzone(v: number, dz: number): number {
  'worklet';
  if (dz <= 0) return v;
  const v2 = v * v;
  return v * (v2 / (v2 + dz * dz));
}

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

/** 0 below lo, 1 above hi, smooth in between. */
function smoothstep(lo: number, hi: number, v: number): number {
  'worklet';
  if (hi <= lo) return v >= hi ? 1 : 0;
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Max integration step; larger frames are split into sub-steps for stability. */
const MAX_SUBSTEP = 1 / 120;
/** Frames longer than this (app paused, first frame) are treated as this long. */
const MAX_DT = 1 / 20;
/** Largest tilt (rad) the pan integrator tracks. */
const MAX_TILT = 0.1;
/** Below this many points the output snaps to exactly zero. */
const SNAP = 0.05;

export function stepEngine(
  prev: EngineState,
  input: EngineInput,
  p: EngineParams
): { state: EngineState; out: EngineOutput } {
  'worklet';
  const dt = clamp(input.dt, 0, MAX_DT);
  const s: EngineState = { ...prev };
  let hx = 0;
  let hy = 0;

  if (dt > 0) {
    // 1. Remove slow bias (gravity leak on iOS, sensor offset) with a tracker.
    const ab = Math.min(1, dt / p.biasTau);
    s.bx += (input.ux - s.bx) * ab;
    s.by += (input.uy - s.by) * ab;
    hx = softDeadzone(input.ux - s.bx, p.deadzone);
    hy = softDeadzone(input.uy - s.by, p.deadzone);

    // 2. Shake energy (≈0.4 s window).
    const ae = Math.min(1, dt / 0.4);
    s.energy += (hx * hx + hy * hy - s.energy) * ae;

    // 3. Stillness gate with separate wake / sleep speeds.
    const target = input.enabled ? smoothstep(p.gateLow, p.gateHigh, Math.sqrt(s.energy)) : 0;
    const tau = target > s.gate ? p.gateAttack : p.gateRelease;
    s.gate += (target - s.gate) * Math.min(1, dt / tau);
    if (s.gate < 0.02 && target === 0) s.gate = 0;
  }

  const shake = Math.sqrt(Math.max(0, s.energy));
  const over = Math.max(0, shake - p.backoffStart);
  const appliedGain = (p.gain * s.gate) / (1 + over / p.backoffSpan);

  if (dt > 0) {
    // Forcing in screen points/s². Want offset = −(device displacement) in
    // screen space. u = −a_device, so screen x: F = u.x; screen y (down): F = −u.y.
    const fx = hx * p.pxPerMeter * appliedGain;
    const fy = -hy * p.pxPerMeter * appliedGain;

    // 4. Spring-damper, semi-implicit Euler with sub-steps.
    const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP));
    const h = dt / n;
    const hardLimit = p.maxOffset * 3;
    for (let i = 0; i < n; i++) {
      const axp = fx - p.stiffness * s.x - p.damping * s.vx;
      const ayp = fy - p.stiffness * s.y - p.damping * s.vy;
      s.vx += axp * h;
      s.vy += ayp * h;
      s.x = clamp(s.x + s.vx * h, -hardLimit, hardLimit);
      s.y = clamp(s.y + s.vy * h, -hardLimit, hardLimit);
    }

    // 5. Roll: leaky integrator of gyro z. Device turns CCW → content turns CW.
    const leak = Math.min(1, dt / p.rollTau);
    const gz = softDeadzone(input.gz, p.gyroDeadzone) * appliedGain;
    s.roll = clamp(s.roll * (1 - leak) + gz * dt, -p.maxRoll * 3, p.maxRoll * 3);

    // 6. Pan: leaky integrators of gyro x / y give the recent tilt.
    const panLeak = Math.min(1, dt / p.panTau);
    const gx = softDeadzone(input.gx, p.gyroDeadzone) * appliedGain;
    const gy = softDeadzone(input.gy, p.gyroDeadzone) * appliedGain;
    s.tiltX = clamp(s.tiltX * (1 - panLeak) + gx * dt, -MAX_TILT, MAX_TILT);
    s.tiltY = clamp(s.tiltY * (1 - panLeak) + gy * dt, -MAX_TILT, MAX_TILT);

    // 7. Fully asleep and back at centre → exactly still.
    if (s.gate === 0 && Math.abs(s.x) < SNAP && Math.abs(s.y) < SNAP && Math.abs(s.vx) < 1 && Math.abs(s.vy) < 1) {
      s.x = 0;
      s.y = 0;
      s.vx = 0;
      s.vy = 0;
      s.roll = 0;
      s.tiltX = 0;
      s.tiltY = 0;
    }
  }

  // Tip about +x moves the screen down (screen +y); about +y moves it right.
  // Shift the content the opposite way.
  const panPx = p.panLever * p.pxPerMeter;
  return {
    state: s,
    out: {
      translateX: softClamp(s.x + s.vx * p.lead - s.tiltY * panPx, p.maxOffset),
      translateY: softClamp(s.y + s.vy * p.lead - s.tiltX * panPx, p.maxOffset),
      rotate: softClamp(s.roll, p.maxRoll),
      shake,
      appliedGain,
    },
  };
}
