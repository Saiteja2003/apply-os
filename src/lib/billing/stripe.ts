import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Returns a configured Stripe SDK client, or null if STRIPE_SECRET_KEY is
 * missing. Designed to never crash compilation or server boots when keys
 * are not yet provisioned in test environments.
 */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return null;
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia" as any,
      typescript: true,
    });
  }

  return stripeInstance;
}
