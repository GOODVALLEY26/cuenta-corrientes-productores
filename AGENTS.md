# Architecture rules

- Calculate pending invoice USD through `src/lib/pendingInvoiceUsd.ts` for both the account and its PDF data, so scoped settlement adjustments do not alter stored invoices or advances.