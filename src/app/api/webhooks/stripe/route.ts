import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/billing/stripe";
import { getAdminClient } from "@/lib/supabase/admin";
import { CREDIT_BUNDLES, type CreditBundleId } from "@/lib/types/billing";

/**
 * Stripe webhook handler for one-time credit bundle purchases.
 * Idempotently credits the user's account in Supabase via credit_user_credits.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("stripe-signature");

  const bodyText = await req.text();
  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
    } else {
      // In development / testing without webhook secret, parse raw payload
      event = JSON.parse(bodyText) as Stripe.Event;
    }
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;
    const bundleId = session.metadata?.bundleId as CreditBundleId | undefined;
    const credits = Number(
      session.metadata?.credits ||
        (bundleId && CREDIT_BUNDLES[bundleId]?.credits) ||
        0,
    );

    if (userId && credits > 0) {
      const admin = getAdminClient();
      if (!admin) {
        console.error("Supabase service role admin client is not available");
        return NextResponse.json(
          { error: "Database admin client unavailable" },
          { status: 500 },
        );
      }

      const bundleName = (bundleId && CREDIT_BUNDLES[bundleId]?.name) || `${credits} Credits`;

      // Call credit_user_credits function in Postgres
      const { data, error } = await admin.rpc("credit_user_credits", {
        p_user_id: userId,
        p_amount: credits,
        p_reference_type: "PURCHASE",
        p_reference_id: session.id,
        p_description: `Purchased ${bundleName} (${session.id.slice(-8)})`,
        p_tier: "pro_credits",
      });

      if (error) {
        console.error("Failed to credit user balance in Supabase", error);
        return NextResponse.json(
          { error: "Failed to update credits ledger" },
          { status: 500 },
        );
      }

      console.info(
        `Successfully credited ${credits} credits to user ${userId} for session ${session.id}`,
      );
    }
  }

  return NextResponse.json({ received: true });
}
