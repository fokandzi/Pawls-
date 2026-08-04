import { createServerFn } from "@tanstack/react-start";
import { getStripe } from "../lib/stripe";

// Revenue math: Stripe web fees are ~3% (€8 => ~€7.76 net); Apple IAP under
// the Small Business Program and Google Play (first $1M) are ~15% (€7.99 => ~€6.80 net).
// The €50K/month target should therefore be modeled against the blended web/native mix.

type CheckoutInput = {
  bookingId: number;
  serviceName: string;
  priceCents: number;
  providerName: string;
};

type MembershipCheckoutInput = {
  breederId: number;
  tier: "plus" | "premium";
  priceCents: number;
};

type CheckoutResult =
  | { url: string }
  | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: unknown): CheckoutInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid checkout data");
    }
    const d = data as Record<string, unknown>;

    const bookingId = Number(d.bookingId);
    const serviceName = String(d.serviceName ?? "").trim();
    const priceCents = Number(d.priceCents);
    const providerName = String(d.providerName ?? "").trim();

    if (!bookingId) throw new Error("bookingId is required");
    if (!serviceName) throw new Error("serviceName is required");
    if (!priceCents || priceCents <= 0) throw new Error("priceCents must be positive");
    if (!providerName) throw new Error("providerName is required");

    return { bookingId, serviceName, priceCents, providerName };
  })
  .handler(async ({ data, request }): Promise<CheckoutResult> => {
    // Gracefully handle missing Stripe key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { error: "Payments not configured" };
    }

    const stripe = getStripe();

    // Determine host from the incoming request
    let host = "http://localhost:3000";
    try {
      const reqHost = request?.headers?.get?.("host");
      if (reqHost) {
        host = `https://${reqHost}`;
      }
    } catch {
      // fall back to localhost
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${host}/book/booking-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${host}/book`,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: data.serviceName,
                description: `Service by ${data.providerName}`,
              },
              unit_amount: data.priceCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId: String(data.bookingId),
          providerName: data.providerName,
        },
      });

      if (!session.url) {
        return { error: "Failed to create checkout session" };
      }

      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return { error: message };
    }
  });

type PlusCheckoutInput = Record<string, never>;

export const createPlusCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown): PlusCheckoutInput => {
    // No input needed — fixed price for Pawls Plus
    return {};
  })
  .handler(async (): Promise<CheckoutResult> => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { error: "Payments not configured" };
    }

    const stripe = getStripe();

    let host = "http://localhost:3000";
    try {
      const reqHost = process.env.VERCEL_URL || process.env.PUBLIC_HOST;
      if (reqHost) {
        host = `https://${reqHost}`;
      }
    } catch {
      // fall back to localhost
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: `${host}/plus/success`,
        cancel_url: `${host}/plus`,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: "Pawls Plus",
                description: "Unlimited swipes, advanced filters, priority booking, verified badge — €8/month",
              },
              unit_amount: 800,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          plan: "pawnder-plus",
        },
      });

      if (!session.url) {
        return { error: "Failed to create checkout session" };
      }

      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return { error: message };
    }
  });

export const createMembershipCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown): MembershipCheckoutInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid checkout data");
    }
    const d = data as Record<string, unknown>;

    const breederId = Number(d.breederId);
    const tier = String(d.tier ?? "").trim();
    const priceCents = Number(d.priceCents);

    if (!breederId) throw new Error("breederId is required");
    if (tier !== "plus" && tier !== "premium") throw new Error("tier must be 'plus' or 'premium'");
    if (!priceCents || priceCents <= 0) throw new Error("priceCents must be positive");

    return { breederId, tier: tier as "plus" | "premium", priceCents };
  })
  .handler(async ({ data }): Promise<CheckoutResult> => {
    // Gracefully handle missing Stripe key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { error: "Payments not configured" };
    }

    const stripe = getStripe();

    // Determine host for success/cancel URLs
    let host = "http://localhost:3000";
    try {
      const reqHost = process.env.VERCEL_URL || process.env.PUBLIC_HOST;
      if (reqHost) {
        host = `https://${reqHost}`;
      }
    } catch {
      // fall back to localhost
    }

    const tierLabel = data.tier === "premium" ? "Premium" : "Plus";
    const priceEuros = (data.priceCents / 100).toFixed(0);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: `${host}/breed/${data.breederId}?upgraded=true`,
        cancel_url: `${host}/breed/membership`,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Pawls ${tierLabel} Membership`,
                description: `${tierLabel} breeder membership — €${priceEuros}/month`,
              },
              unit_amount: data.priceCents,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          breederId: String(data.breederId),
          tier: data.tier,
        },
      });

      if (!session.url) {
        return { error: "Failed to create checkout session" };
      }

      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return { error: message };
    }
  });
