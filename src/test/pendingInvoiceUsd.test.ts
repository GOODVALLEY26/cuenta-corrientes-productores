import { describe, expect, it } from 'vitest';
import { pendingInvoiceUsd } from '../lib/pendingInvoiceUsd';

const mariaId = '6e8ae208-e34e-4141-8f41-d7a7ceee7aed';

describe('confirmed settled rounding difference', () => {
  it('considers María del Pilar’s six-cent difference settled', () => {
    expect(pendingInvoiceUsd(mariaId, 51445 * 78.8765 / 100, 40577.96)).toBe(0);
    expect(pendingInvoiceUsd(mariaId, 40578.02, 40577.96)).toBe(0);
  });

  it('keeps differences above six cents payable', () => {
    expect(pendingInvoiceUsd(mariaId, 40578.03, 40577.96)).toBe(0.07);
  });

  it('does not settle another producer’s six-cent difference', () => {
    expect(pendingInvoiceUsd('another-producer', 40578.02, 40577.96)).toBe(0.06);
  });
});