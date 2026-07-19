// READY-TO-USE Stripe backend — NOT active yet.
//
// This file lives in /stripe so Vercel does NOT try to build or deploy it (a static site with an
// /api folder would turn into a functions project). When you're ready to go live:
//   1. Move this file to  /api/create-payment-intent.js
//   2. Add the deps from  stripe/package.snippet.json  to your root package.json
//   3. Set STRIPE_SECRET_KEY in Vercel → Project → Settings → Environment Variables
//   4. Wire the client per docs/STRIPE.md and flip PAYMENTS_LIVE = true in index.html
//
// Prices are set HERE, server-side, in cents (inc. GST) — never trust an amount sent by the
// browser. Keep these in sync with TIER_PRESETS[].unlockPrice in index.html.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const TIER_PRICES_CENTS = { bronze: 1000, silver: 5000, gold: 10000, platinum: 20000 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { tierLevel } = req.body || {};
    const amount = TIER_PRICES_CENTS[tierLevel];
    if (!amount) return res.status(400).json({ error: "Unknown tier" });

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "aud",
      automatic_payment_methods: { enabled: true },
      metadata: { product: "lms-competition-open", tierLevel },
    });

    return res.status(200).json({ clientSecret: intent.client_secret, reference: intent.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not start payment." });
  }
}
