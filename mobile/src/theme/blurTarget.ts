import { createRef } from 'react';
import type { View } from 'react-native';

/**
 * Shared ref for expo-blur's Android `blurTarget`. SDK 56's BlurView no longer
 * blurs on Android unless it's given a ref to a `BlurTargetView` wrapping the
 * content behind it. The root layout wraps the app in one BlurTargetView and
 * every glass surface (LiquidGlass, perfil header) points here — a module ref,
 * not context, since there is exactly one target for the whole app.
 */
export const blurTargetRef = createRef<View>();
