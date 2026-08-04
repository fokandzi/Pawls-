import { Capacitor } from "@capacitor/core";

/** True when the app is running inside the native Capacitor shell. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function isIOS(): boolean {
  return isNative() && Capacitor.getPlatform() === "ios";
}

export function isAndroid(): boolean {
  return isNative() && Capacitor.getPlatform() === "android";
}
