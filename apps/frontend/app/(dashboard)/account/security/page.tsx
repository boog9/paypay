import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";

export const metadata: Metadata = {
  title: "Security",
  description: "Manage account security features including two-factor authentication.",
};

export default function AccountSecurityPage() {
  const isTwoFactorEnabled = false;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground">
          Control your authentication factors, monitor login activity, and harden access to the PayPay portal.
        </p>
      </header>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Two-factor authentication</CardTitle>
          <CardDescription>
            Protect your account with a TOTP authenticator. We recommend enabling 2FA for all administrators.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              Status: {isTwoFactorEnabled ? "Enabled" : "Disabled"}
            </p>
            <p className="text-xs text-muted-foreground">
              Configure 2FA in your profile to require verification on every sign in.
            </p>
          </div>
          <Button asChild>
            <Link href="/account/security/2fa">
              {isTwoFactorEnabled ? "Manage" : "Enable 2FA"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
