import Stripe from "stripe";

export function createStripe(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}
