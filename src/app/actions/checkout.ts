"use server";

import { headers } from "next/headers";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { getStripe } from "@/lib/billing/stripe";
import { getSessionUser } from "@/lib/supabase/server";
import { CREDIT_BUNDLES, type CreditBundleId } from "@/lib/types/billing";

const bundleSchema = z.enum(["bundle_starter", "bundle_pro", "bundle_sprint"]);

/**
 * Creates a Stripe Checkout Session in payment mode (one-time purchase).
 * Strictly zero recurring subscriptions.
 */
export async function createCheckoutSessionAction(
  bundleId: CreditBundleId | string,
): Promise<ActionResult<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "You are signed out. Sign in and try again." };
  }

  const parsed = bundleSchema.safeParse(bundleId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid credit bundle selected." };
  }

  const bundle = CREDIT_BUNDLES[parsed.data];
  if (!bundle) {
    return { ok: false, error: "Credit bundle not found." };
  }

  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      error:
        "Stripe test-mode is not configured. Add STRIPE_SECRET_KEY to your .env.local to test payments.",
    };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ||
    headerList.get("referer")?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: bundle.priceCents,
            product_data: {
              name: `ApplyOS ${bundle.name} (${bundle.credits} Credits)`,
              description: bundle.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        bundleId: bundle.id,
        credits: String(bundle.credits),
      },
      success_url: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?billing=cancelled`,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return { ok: true, data: { url: session.url } };
  } catch (error) {
    console.error("Failed to create Stripe checkout session", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not initiate checkout session. Try again.",
    };
  }
}
