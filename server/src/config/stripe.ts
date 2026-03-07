import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function createPaymentLink(
  invoiceNumber: string,
  amountCents: number,
  currency: string = 'usd'
): Promise<{ id: string; url: string } | null> {
  if (!stripe) {
    console.warn('[Stripe] STRIPE_SECRET_KEY not set — skipping payment link');
    return null;
  }

  const product = await stripe.products.create({
    name: `Invoice ${invoiceNumber}`,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency: currency.toLowerCase(),
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { invoice_number: invoiceNumber },
  });

  return { id: paymentLink.id, url: paymentLink.url };
}

export function getStripeInstance(): Stripe | null {
  return stripe;
}

export default stripe;
