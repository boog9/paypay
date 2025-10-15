import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../components/ui/card";

export const metadata: Metadata = {
  title: "Two-factor authentication",
};

export default function TwoFactorPlaceholderPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">
          Detailed configuration will connect to the backend once the security APIs are implemented.
        </p>
      </header>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            You will be able to register TOTP secrets, download recovery codes, and revoke active authenticators from this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          For now, contact your administrator to enable or reset two-factor authentication.
        </CardContent>
      </Card>
    </div>
  );
}
