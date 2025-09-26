'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';

type Props = {
  apiBase: string;
};

type RequestState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; invoiceId: string }
  | { status: 'error'; message: string };

type CreateInvoicePayload = {
  amount: number;
  currency: string;
  metadata?: unknown;
};

function safeJsonParse<T = unknown>(raw: string): T | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function NewInvoiceForm({ apiBase }: Props) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('BTC');
  const [metadata, setMetadata] = useState('');
  const [state, setState] = useState<RequestState>({ status: 'idle' });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: 'submitting' });

    try {
      const payload: CreateInvoicePayload = {
        amount: Number(amount),
        currency
      };
      const parsed = safeJsonParse(metadata);
      if (parsed !== undefined) {
        payload.metadata = parsed;
      }

      const response = await fetch(`${apiBase.replace(/\/$/, '')}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to create invoice');
      }

      const invoice = await response.json();
      setState({ status: 'success', invoiceId: invoice.id ?? 'unknown' });
      setAmount('');
      setMetadata('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setState({ status: 'error', message });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <label htmlFor="amount" className="text-sm font-medium">
          Amount
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="currency" className="text-sm font-medium">
          Currency
        </label>
        <input
          id="currency"
          name="currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          required
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="metadata" className="text-sm font-medium">
          Metadata (JSON, optional)
        </label>
        <textarea
          id="metadata"
          name="metadata"
          value={metadata}
          onChange={(event) => setMetadata(event.target.value)}
          rows={4}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Button type="submit" disabled={state.status === 'submitting' || amount === ''}>
          {state.status === 'submitting' ? 'Creating…' : 'Create invoice'}
        </Button>
        {state.status === 'success' ? (
          <p className="text-sm text-emerald-600">Invoice created with ID {state.invoiceId}</p>
        ) : state.status === 'error' ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
