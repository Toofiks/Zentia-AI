# Zentia AI - Stripe Setup Guide

To accept payments and offer the "Pro Plan" / "Enterprise Plan", follow these steps:

## 1. Create a Stripe Account
If you don't have one, register at [stripe.com](https://stripe.com/).

## 2. Get your API Keys
1. Go to your Stripe Dashboard -> Developers -> API Keys.
2. Copy the **Secret key**.
3. Paste it into your Zentia `.env` file as `STRIPE_SECRET_KEY`.

## 3. Create your Products
1. Go to "Products" in Stripe.
2. Click "Add product".
3. **Product 1 (Pro Plan)**:
   - Name: Zentia Pro
   - Pricing model: Standard pricing
   - Price: $29.00 USD
   - Billing period: Monthly
4. Click "Save product".
5. Find the **API ID** for the price you just created (it starts with `price_...`).
6. Paste it into your `.env` file as `STRIPE_PRICE_ID_PRO`.
7. **Product 2 (Enterprise Plan)**: Repeat the steps above and save the price ID as `STRIPE_PRICE_ID_ENTERPRISE`.

## 4. Setup Webhooks (Critical for automatic upgrades)
1. Go to Developers -> Webhooks.
2. Click "Add an endpoint".
3. **Endpoint URL**: `https://your-domain.com/api/stripe/webhook` (replace with your actual deployed domain or ngrok URL).
4. **Events to listen to**: Select `checkout.session.completed`.
5. Click "Add endpoint".
6. Click "Reveal" to show the **Signing secret** (starts with `whsec_...`).
7. Paste it into your `.env` file as `STRIPE_WEBHOOK_SECRET`.

## 5. Restart your Server
Run `npm start` or `pm2 restart zentia` to apply the `.env` changes. Payments will now work securely!
