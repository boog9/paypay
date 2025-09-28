import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '../../../components/ui/button';
import { getBffApiBaseUrl } from '../../../lib/bff';
import { NewInvoiceForm } from './new-invoice-form';

export const metadata: Metadata = {
  title: 'Create invoice'
};

export default function NewInvoicePage() {
  const apiBaseUrl = getBffApiBaseUrl();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create invoice</h1>
        <p className="text-sm text-muted-foreground">
          Proxy a Greenfield invoice request through the BFF. Provide an amount and currency to
          generate a payable invoice for your configured BTCPay store.
        </p>
      </div>
      <NewInvoiceForm apiBaseUrl={apiBaseUrl} />
      <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
        <span>Need to inspect health?</span>
        <Button asChild variant="link" className="h-auto p-0">
          <Link href="/health">Check service status</Link>
        </Button>
      </div>
    </div>
  );
}
