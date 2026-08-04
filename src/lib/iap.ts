import { Purchases, type PurchasesOfferings, type PurchasesPackage, type CustomerInfo } from "@revenuecat/purchases-capacitor";
import { isNative } from "./platform";

let initialized = false;

/** Configure RevenueCat once. The public SDK key is safe to ship in the app bundle. */
export async function initIAP(): Promise<void> {
  if (!isNative() || initialized) return;
  const apiKey = import.meta.env.VITE_REVENUECAT_API_KEY || "";
  if (!apiKey) throw new Error("RevenueCat API key is not configured");
  await Purchases.configure({ apiKey });
  initialized = true;
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!isNative()) return null;
  await initIAP();
  const offerings = await Purchases.getOfferings();
  return offerings.current || offerings.all?.["default"] ? offerings : null;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  if (!isNative()) throw new Error("In-app purchases are only available in the native app");
  await initIAP();
  const result = await Purchases.purchasePackage({ aPackage: pkg });
  return result.customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  await initIAP();
  return (await Purchases.restorePurchases()).customerInfo;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  await initIAP();
  return (await Purchases.getCustomerInfo()).customerInfo;
}
