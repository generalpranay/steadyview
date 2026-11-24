import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  SensorType,
  cancelAnimation,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { initialState, paramsFor, stepEngine, type Strength } from './engine';

/** Shared values the gimbal writes and SteadyView reads. Owned by the screen. */
export interface GimbalValues {
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  rotate: SharedValue<number>;
  /** Smoothed shake level, m/s² RMS. Readable from JS for UI decisions. */
  shake: SharedValue<number>;
  /** 0 = asleep (phone still), up to the strength's gain when active. */
  appliedGain: SharedValue<number>;
  /** Latest normalised motion input, for the diagnostics readout. */
  input: SharedValue<{ ux: number; uy: number; gz: number }>;
}

export function useGimbalValues(): GimbalValues {
  return {
    translateX: useSharedValue(0),
    translateY: useSharedValue(0),
    rotate: useSharedValue(0),
    shake: useSharedValue(0),
    appliedGain: useSharedValue(0),
    input: useSharedValue({ ux: 0, uy: 0, gz: 0 }),
  };
}

/**
 * Platform adapter notes (verified against react-native-reanimated 4.7 source):
 * - Both platforms are normalised to iOS sign conventions, m/s² and rad/s.
 * - Android ACCELEROMETER is TYPE_LINEAR_ACCELERATION (gravity removed).
 * - iOS ACCELEROMETER is raw CMAccelerometerData (gravity included), so we
 *   subtract the GRAVITY sensor (CMDeviceMotion.gravity) there.
 * - `adjustToInterfaceOrientation` (default true) remaps axes when the UI rotates.
 */
const SUBTRACT_GRAVITY = Platform.OS === 'ios';

interface DriverProps {
  values: GimbalValues;
  strength: Strength;
  leadMs?: number;
  onAvailability?: (available: boolean) => void;
}

/**
 * Runs the motion sensors and the stabilizer every frame on the UI thread.
 * Mount it only while the gimbal is on: unmounting stops the sensors (saving
 * battery) and eases the page back to centre — the page itself never remounts.
 */
export function GimbalDriver({ values, strength, leadMs = 0, onAvailability }: DriverProps) {
  const accel = useAnimatedSensor(SensorType.ACCELEROMETER, { interval: 'auto' });
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 'auto' });

  // useAnimatedSensor replaces its shared value inside an effect after mount;
  // re-render once so the frame callback captures the live one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted) onAvailability?.(accel.isAvailable);
  }, [mounted, accel.isAvailable, onAvailability]);

  const paramsSV = useSharedValue(paramsFor(strength, leadMs));
  useEffect(() => {
    paramsSV.value = paramsFor(strength, leadMs);
  }, [strength, leadMs, paramsSV]);

  const state = useSharedValue(initialState());
  const accelSV = accel.sensor;
  const gravitySV = gravity.sensor;
  const gyroSV = gyro.sensor;
  const { translateX, translateY, rotate, shake, appliedGain, input } = values;

  const onFrame = useCallback(
    (frame: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      const dt = (frame.timeSincePreviousFrame ?? 16.7) / 1000;
      const a = accelSV.value;
      const g = gravitySV.value;
      const r = gyroSV.value;
      const ux = SUBTRACT_GRAVITY ? a.x - g.x : a.x;
      const uy = SUBTRACT_GRAVITY ? a.y - g.y : a.y;

      const { state: next, out } = stepEngine(
        state.value,
        { ux, uy, gz: r.z, gx: r.x, gy: r.y, dt, enabled: true },
        paramsSV.value
      );
      state.value = next;
      translateX.value = out.translateX;
      translateY.value = out.translateY;
      rotate.value = out.rotate;
      shake.value = out.shake;
      appliedGain.value = out.appliedGain;
      input.value = { ux, uy, gz: r.z };
    },
    [accelSV, gravitySV, gyroSV, state, paramsSV, translateX, translateY, rotate, shake, appliedGain, input]
  );

  useFrameCallback(onFrame);

  // On unmount (gimbal switched off): glide back to centre and zero the meters.
  useEffect(() => {
    return () => {
      for (const v of [translateX, translateY, rotate]) {
        cancelAnimation(v);
        v.value = withTiming(0, { duration: 250 });
      }
      shake.value = 0;
      appliedGain.value = 0;
    };
  }, [translateX, translateY, rotate, shake, appliedGain]);

  return null;
}
