const SETTLED_ROUNDING_PRODUCER_ID = '6e8ae208-e34e-4141-8f41-d7a7ceee7aed';

export function pendingInvoiceUsd(producerId: string, advancesUsd: number, invoicedUsd: number): number {
  const pendingCents = Math.max(0, Math.round((advancesUsd - invoicedUsd) * 100));
  // This producer's confirmed six-cent difference is considered settled.
  if (producerId === SETTLED_ROUNDING_PRODUCER_ID && pendingCents <= 6) return 0;
  return pendingCents / 100;
}