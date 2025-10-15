'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';

const STORAGE_KEY = 'paypay.portal.apiKey';

export function PortalClient() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (value) {
        setApiKey(value);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors; the API key banner will simply not render.
    }
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!apiKey) {
    return null;
  }

  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText) {
      setCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
      <h2 className="text-base font-semibold text-primary">BTCPay API key provisioned</h2>
      <p className="mt-2 text-muted-foreground">
        Copy and store this key securely. It is shown only once and will not be available later.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <code className="flex-1 break-all rounded-md bg-background px-3 py-2 text-xs">{apiKey}</code>
        <Button type="button" onClick={handleCopy} variant="outline" size="sm">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
