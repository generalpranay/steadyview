import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { GimbalValues } from './useSteadyMotion';

interface Props {
  values: GimbalValues;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Wraps content (including native views like a WebView) and applies the
 * gimbal offset as a GPU transform. Transforms don't trigger layout, and touch
 * hit-testing follows them, so scrolling and taps keep working.
 */
export function SteadyView({ values, style, children }: Props) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: values.translateX.value },
      { translateY: values.translateY.value },
      { rotate: `${values.rotate.value}rad` },
    ],
  }));

  return <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>;
}
