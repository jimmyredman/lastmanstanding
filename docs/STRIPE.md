# Stripe payments — going live

The competition-open checkout is **fully built**. In beta it runs a **simulated** payment (no
card, no charge). Switching to real Stripe payments is a small, contained change.

## What's already in place

- **Checkout UX** — `CheckoutModal` in `index.html` shows the tier, the one-off setup fee (inc.
  GST, with the GST component broken out), and a confirm button. It handles free opens, the beta
  simulated payment, and (once switched on) the live charge — no UI work left to do.
- **Pricing** — `TIER_PRESETS[].unlockPrice` (AUD, **inc. GST**): Bronze 10, Silver 50, Gold 100,
  Platinum 200. A host's first competition at the free-trial tier (`FREE_TRIAL_TIER = "bronze"`)
  is free; `gstOf()` computes the GST component (1/11 of a GST-inclusive total).
- **Payment record** — every competition stores a `payment` map:
  `{ status, amount, gst, currency: "AUD", tierLevel, mode, reference }`.
  `status` is `free` | `simulated` | `paid`; `mode` is `free` | `beta-sim` | `stripe`.
- **The switch** — `PAYMENTS_LIVE` (top of `index.html`). `false` = beta simulated. `true` = live.
- **The integration point** — the clearly-marked block in `processCheckout({ tierLevel, amount })`.

## The contract `processCheckout` must satisfy

Called only for paid opens (free opens skip it). It must:

- return `{ ok: true, mode: "stripe", reference }` on a **successful** payment, where `reference`
  is the Stripe PaymentIntent / Checkout Session id, **or**
- return `{ ok: false, error }` (or throw) on failure — the modal shows the message and does **not**
  create the competition.

`amount` is the GST-inclusive total in **dollars** (convert to cents for Stripe: `amount * 100`).

## Steps to go live

1. **Stripe account** — create one, grab the publishable + secret keys (test keys first).
2. **Backend endpoint** — Stripe needs a server; the app is currently static. Options:
   - a Vercel Serverless Function (requires the project to allow functions), or
   - a small Cloud Function / other backend.
   It creates a Checkout Session or PaymentIntent for `amount * 100` AUD and returns the client
   secret / session URL. **Never** put the secret key in `index.html`.
3. **Wire `processCheckout`** — replace the `TODO(stripe)` block: call your endpoint, run
   `stripe.confirmPayment` (or redirect to Checkout), and return the contract shape above.
4. **Verify server-side** — confirm the PaymentIntent succeeded (webhook or a status check) before
   trusting the client. For hard enforcement, gate competition creation behind a verified payment
   in Firestore rules or a Cloud Function rather than the client alone.
5. **Flip the switch** — set `PAYMENTS_LIVE = true`. The checkout button changes from
   "Simulate payment" to "Pay $X" automatically; no other code changes needed.
6. **Test** — Stripe test cards (e.g. `4242 4242 4242 4242`), confirm the `payment` record on the
   created competition reads `status: "paid"`, then switch to live keys.

## Notes

- Prices are **inc. GST** (consumer-facing app). If you register for GST, the `payment.gst` figure
  is captured per competition for your records.
- LMS never handles prize money — the setup fee only opens/hosts the competition. Keep that wording
  in the checkout and disclaimers.
