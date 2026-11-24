import { initialState, paramsFor, softClamp, stepEngine, type EngineParams, type Strength } from '../engine';
import { nextTransitState, TRANSIT } from '../transit';

const FPS = 60;
const DT = 1 / FPS;

/** Deterministic pseudo-random noise (so tests are repeatable). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/**
 * Shake the device sinusoidally along screen-x with displacement amplitude
 * `ampM` metres at `hz`, and measure how well the content offset cancels it.
 * Returns residual motion as a fraction of the uncorrected motion (1 = no help).
 */
function residualRatio(hz: number, ampM: number, p: EngineParams, seconds = 6) {
  let state = initialState();
  const w = 2 * Math.PI * hz;
  let sumRes = 0;
  let sumRaw = 0;
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    // Output of a step is for the frame shown at t + DT, from the sample at t.
    const disp = ampM * Math.sin(w * (t + DT));
    const accel = -ampM * w * w * Math.sin(w * t);
    const { state: next, out } = stepEngine(state, { ux: -accel, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p);
    state = next;
    if (i > n / 2) {
      const rawPt = disp * p.pxPerMeter;
      const perceived = rawPt + out.translateX;
      sumRes += perceived * perceived;
      sumRaw += rawPt * rawPt;
    }
  }
  return Math.sqrt(sumRes / sumRaw);
}

/** Filter only: full gain, gate always open, no limiter. */
const filterOnly = (s: Strength): EngineParams => ({
  ...paramsFor(s),
  gain: 1,
  maxOffset: 1e6,
  deadzone: 0,
  gateLow: -1,
  gateHigh: 0,
  gateAttack: 1e-6,
  backoffStart: 1e6,
});

function run(p: EngineParams, frames: number, sample: (i: number) => { ux: number; uy: number; gz: number }) {
  let s = initialState();
  let maxAbs = 0;
  let last = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p);
  for (let i = 0; i < frames; i++) {
    last = stepEngine(s, { gx: 0, gy: 0, ...sample(i), dt: DT, enabled: true }, p);
    s = last.state;
    maxAbs = Math.max(maxAbs, Math.abs(last.out.translateX), Math.abs(last.out.translateY), Math.abs(last.out.rotate) * 100);
  }
  return { maxAbs, last };
}

describe('stillness', () => {
  it('a phone at rest shows a perfectly still page despite sensor noise', () => {
    const r = rng(1);
    for (const strength of ['gentle', 'balanced', 'strong'] as Strength[]) {
      // Typical phone accelerometer noise: ~0.03 m/s² RMS; gyro ~0.01 rad/s.
      const { maxAbs, last } = run(paramsFor(strength), 600, () => ({
        ux: r() * 0.1,
        uy: r() * 0.1,
        gz: r() * 0.03,
      }));
      expect(maxAbs).toBe(0);
      expect(last.out.appliedGain).toBe(0);
    }
  });

  it('a steady hand (small slow drift) does not move the page', () => {
    const r = rng(2);
    const { maxAbs } = run(paramsFor('balanced'), 600, (i) => ({
      ux: 0.15 * Math.sin((2 * Math.PI * 0.4 * i) / FPS) + r() * 0.08,
      uy: 0.1 * Math.cos((2 * Math.PI * 0.3 * i) / FPS) + r() * 0.08,
      gz: r() * 0.03,
    }));
    expect(maxAbs).toBeLessThan(0.5);
  });

  it('wakes up when walking and settles back to exactly zero after', () => {
    const p = paramsFor('balanced');
    let s = initialState();
    let woke = 0;
    for (let i = 0; i < 240; i++) {
      const r = stepEngine(s, { ux: 2.5 * Math.sin((2 * Math.PI * 2 * i) / FPS), uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p);
      s = r.state;
      woke = Math.max(woke, r.out.appliedGain);
    }
    expect(woke).toBeGreaterThan(p.gain * 0.9);
    let out = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).out;
    for (let i = 0; i < 240; i++) {
      const r = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p);
      s = r.state;
      out = r.out;
    }
    expect(out.translateX).toBe(0);
    expect(out.appliedGain).toBe(0);
  });
});

describe('stabilizer filter', () => {
  it('cancels most fast jitter (6 Hz)', () => {
    expect(residualRatio(6, 0.0015, filterOnly('balanced'))).toBeLessThan(0.4);
  });

  it('cancels a good share of walking bob (3 Hz)', () => {
    expect(residualRatio(3, 0.003, filterOnly('balanced'))).toBeLessThan(0.7);
  });

  it('lets slow, intentional movement through (0.3 Hz)', () => {
    expect(residualRatio(0.3, 0.03, filterOnly('balanced'))).toBeGreaterThan(0.9);
  });

  it('never amplifies shake by more than ~40% at any frequency', () => {
    for (const strength of ['gentle', 'balanced', 'strong'] as Strength[]) {
      for (const hz of [0.2, 0.5, 0.8, 1, 1.3, 1.6, 2, 2.5]) {
        expect(residualRatio(hz, 0.004, filterOnly(strength))).toBeLessThan(1.4);
      }
    }
  });

  it('strong cancels more than gentle at 3 Hz', () => {
    expect(residualRatio(3, 0.003, filterOnly('strong'))).toBeLessThan(
      residualRatio(3, 0.003, filterOnly('gentle'))
    );
  });

  it('moves content opposite to the device on x, and down when the device moves up', () => {
    const p = filterOnly('balanced');
    let s = initialState();
    for (let i = 0; i < 3; i++) s = stepEngine(s, { ux: -3, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).state;
    expect(s.x).toBeLessThan(0);
    s = initialState();
    for (let i = 0; i < 3; i++) s = stepEngine(s, { ux: 0, uy: -3, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).state;
    expect(s.y).toBeGreaterThan(0);
  });

  it('counters pan: device tips forward → content shifts up; tips right → content shifts left', () => {
    const p = filterOnly('balanced');
    let s = initialState();
    for (let i = 0; i < 4; i++) s = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 1, gy: 0, dt: DT, enabled: true }, p).state;
    let out = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).out;
    expect(out.translateY).toBeLessThan(0);
    expect(Math.abs(out.translateX)).toBeLessThan(1e-9);

    s = initialState();
    for (let i = 0; i < 4; i++) s = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 1, dt: DT, enabled: true }, p).state;
    out = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).out;
    expect(out.translateX).toBeLessThan(0);
  });

  it('ignores a slow deliberate tilt (pan drifts back to centre)', () => {
    const p = filterOnly('balanced');
    let s = initialState();
    let out = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p).out;
    // Tilt steadily at 0.1 rad/s for 3 s (about 17°), like adjusting your grip.
    for (let i = 0; i < 180; i++) {
      const r = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0.1, gy: 0, dt: DT, enabled: true }, p);
      s = r.state;
      out = r.out;
    }
    // The leaky integrator holds only ~panTau worth of motion: a few points, not the full tilt.
    expect(Math.abs(out.translateY)).toBeLessThan(0.1 * p.panTau * p.panLever * p.pxPerMeter * 1.1);
  });

  it('a phone at rest with gyro noise on every axis stays perfectly still', () => {
    const r = rng(7);
    for (const strength of ['gentle', 'balanced', 'strong'] as Strength[]) {
      let s = initialState();
      let maxAbs = 0;
      for (let i = 0; i < 600; i++) {
        const step = stepEngine(
          s,
          { ux: r() * 0.08, uy: r() * 0.08, gz: r() * 0.03, gx: r() * 0.03, gy: r() * 0.03, dt: DT, enabled: true },
          paramsFor(strength)
        );
        s = step.state;
        maxAbs = Math.max(maxAbs, Math.abs(step.out.translateX), Math.abs(step.out.translateY));
      }
      expect(maxAbs).toBe(0);
    }
  });

  it('pan sway is limited and never amplified beyond the soft limit', () => {
    const p = paramsFor('strong');
    let s = initialState();
    for (let i = 0; i < 600; i++) {
      const r = stepEngine(
        s,
        { ux: 3 * Math.sin(i * 0.6), uy: 0, gz: 0, gx: 4 * Math.sin(i * 0.9), gy: 4 * Math.cos(i * 0.7), dt: DT, enabled: true },
        p
      );
      s = r.state;
      expect(Math.abs(r.out.translateX)).toBeLessThanOrEqual(p.maxOffset);
      expect(Math.abs(r.out.translateY)).toBeLessThanOrEqual(p.maxOffset);
    }
  });

  it('counter-rotates: device turns CCW → content turns CW', () => {
    const { out } = stepEngine(initialState(), { ux: 0, uy: 0, gz: 1, gx: 0, gy: 0, dt: DT, enabled: true }, filterOnly('balanced'));
    expect(out.rotate).toBeGreaterThan(0);
  });
});

describe('limits and safety', () => {
  it('never exceeds the soft limits, even under violent shake', () => {
    for (const strength of ['gentle', 'balanced', 'strong'] as Strength[]) {
      const p = paramsFor(strength);
      let s = initialState();
      for (let i = 0; i < 600; i++) {
        const r = stepEngine(s, { ux: 40 * Math.sin(i), uy: 40 * Math.cos(i * 1.3), gz: 5, gx: 0, gy: 0, dt: DT, enabled: true }, p);
        s = r.state;
        expect(Math.abs(r.out.translateX)).toBeLessThanOrEqual(p.maxOffset);
        expect(Math.abs(r.out.translateY)).toBeLessThanOrEqual(p.maxOffset);
        expect(Math.abs(r.out.rotate)).toBeLessThanOrEqual(p.maxRoll);
        expect(Number.isFinite(r.out.translateX)).toBe(true);
      }
    }
  });

  it('keeps corrections small (calm feel): at most 14 pt and ~1°', () => {
    for (const strength of ['gentle', 'balanced', 'strong'] as Strength[]) {
      expect(paramsFor(strength).maxOffset).toBeLessThanOrEqual(14);
      expect(paramsFor(strength).maxRoll).toBeLessThanOrEqual(0.016);
    }
  });

  it('gentle only nudges the page; balanced sits between gentle and strong', () => {
    const [g, b, st] = (['gentle', 'balanced', 'strong'] as Strength[]).map((x) => paramsFor(x));
    expect(g.maxOffset).toBeLessThanOrEqual(4);
    expect(g.gain).toBeLessThanOrEqual(0.3);
    for (const key of ['gain', 'maxOffset', 'maxRoll'] as const) {
      expect(b[key]).toBeGreaterThan(g[key]);
      expect(b[key]).toBeLessThan(st[key]);
    }
  });

  it('gentle moves the text far less than strong under the same vehicle shake', () => {
    const shake = (i: number) => ({
      ux: 2.5 * Math.sin((2 * Math.PI * 3 * i) / FPS),
      uy: 2 * Math.cos((2 * Math.PI * 2.2 * i) / FPS),
      gz: 0,
    });
    const gentle = run(paramsFor('gentle'), 600, shake).maxAbs;
    const strong = run(paramsFor('strong'), 600, shake).maxAbs;
    expect(gentle).toBeGreaterThan(0);
    expect(gentle).toBeLessThan(strong * 0.5);
  });

  it('backs off gain when shaking is extreme', () => {
    const p = paramsFor('balanced');
    let s = initialState();
    let gain = 1;
    for (let i = 0; i < 120; i++) {
      const r = stepEngine(s, { ux: 12 * Math.sin(i * 1.7), uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: true }, p);
      s = r.state;
      gain = r.out.appliedGain;
    }
    expect(gain).toBeLessThan(p.gain * 0.7);
  });

  it('returns to exactly centre when disabled', () => {
    const p = paramsFor('balanced');
    let s = { ...initialState(), x: 15, y: -10, roll: 0.01, gate: 1, energy: 4 };
    let out = stepEngine(s, { ux: 0, uy: 0, gz: 0, gx: 0, gy: 0, dt: DT, enabled: false }, p).out;
    for (let i = 0; i < 180; i++) {
      const r = stepEngine(s, { ux: 2, uy: 2, gz: 1, gx: 0, gy: 0, dt: DT, enabled: false }, p);
      s = r.state;
      out = r.out;
    }
    expect(out.translateX).toBe(0);
    expect(out.translateY).toBe(0);
    expect(out.rotate).toBe(0);
  });

  it('survives a long frame (app resumed) without blowing up', () => {
    const p = paramsFor('strong');
    const r = stepEngine({ ...initialState(), gate: 1 }, { ux: 5, uy: -5, gz: 2, gx: 0, gy: 0, dt: 2.5, enabled: true }, p);
    expect(Math.abs(r.out.translateX)).toBeLessThanOrEqual(p.maxOffset);
    expect(Number.isFinite(r.state.vx)).toBe(true);
  });

  it('softClamp is identity near zero and bounded', () => {
    expect(softClamp(1, 40)).toBeCloseTo(1, 1);
    expect(softClamp(1000, 40)).toBeLessThanOrEqual(40);
    expect(softClamp(-1000, 40)).toBeGreaterThanOrEqual(-40);
    expect(softClamp(40, 40)).toBeLessThan(31);
  });
});

describe('auto text enlarge (transit)', () => {
  it('turns on after sustained shake and off after sustained calm', () => {
    let s = { active: false, heldFor: 0 };
    for (let t = 0; t < TRANSIT.onAfter - 0.25; t += 0.25) s = nextTransitState(s, 2, 0.25);
    expect(s.active).toBe(false);
    s = nextTransitState(s, 2, 0.25);
    s = nextTransitState(s, 2, 0.25);
    expect(s.active).toBe(true);

    s = nextTransitState(s, 0.1, 1);
    s = nextTransitState(s, 2, 0.25);
    expect(s.active).toBe(true);

    for (let t = 0; t <= TRANSIT.offAfter; t += 0.25) s = nextTransitState(s, 0.1, 0.25);
    expect(s.active).toBe(false);
  });
});
