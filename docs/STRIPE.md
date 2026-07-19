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

## Already written for you

- **`stripe/create-payment-intent.js`** — a complete Vercel serverless function that creates a
  PaymentIntent for the chosen tier (prices set server-side, in cents, inc. GST). It's parked in
  `/stripe` so it does **not** affect the current static deploy.
- **`stripe/package.snippet.json`** — the one dependency (`stripe`) to add to a root `package.json`.

## Steps to go live

1. **Stripe account** — create one, grab the publishable + secret keys (test keys first).
2. **Activate the backend** — move `stripe/create-payment-intent.js` to `api/create-payment-intent.js`,
   add the dep from `stripe/package.snippet.json` to a root `package.json`, and set
   `STRIPE_SECRET_KEY` in Vercel → Project → Settings → Environment Variables. **Never** put the
   secret key in `index.html`. (Adding an `/api` folder turns the project into a functions project;
   Vercel keeps serving `index.html` statically and builds `/api` as functions — no build script.)
3. **Load Stripe.js** — add `<script src="https://js.stripe.com/v3"></script>` to `index.html`
   (and allow `js.stripe.com` / `api.stripe.com` if you add a CSP).
4. **Wire `processCheckout`** — replace the `TODO(stripe)` block: `POST` to
   `/api/create-payment-intent` with `{ tierLevel }`, then confirm the returned `clientSecret` with
   Stripe Elements (`stripe.confirmPayment`). Return `{ ok: true, mode: "stripe", reference }` on
   success (use the PaymentIntent id as `reference`) or `{ ok: false, error }` on failure.
5. **Verify server-side** — confirm the PaymentIntent actually succeeded (a Stripe webhook, or a
   status re-check) before trusting the client. For hard enforcement, gate competition creation
   behind a verified payment in a Cloud Function rather than the client alone.
6. **Flip the switch** — set `PAYMENTS_LIVE = true` in `index.html`. The checkout button changes
   from "Simulate payment · $X" to "Pay $X" automatically; no other client changes needed.
7. **Test** — Stripe test cards (e.g. `4242 4242 4242 4242`), confirm the `payment` record on the
   created competition reads `status: "paid"` with the PaymentIntent id, then switch to live keys.

## Notes

- Prices are **inc. GST** (consumer-facing app). If you register for GST, the `payment.gst` figure
  is captured per competition for your records.
- LMS never handles prize money — the setup fee only opens/hosts the competition. Keep that wording
  in the checkout and disclaimers.
