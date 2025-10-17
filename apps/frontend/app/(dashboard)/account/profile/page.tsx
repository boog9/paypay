import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";

export const metadata: Metadata = {
  title: "Profile",
  description: "View and update your PayPay account details.",
};

export default function AccountProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Update personal information and notification preferences associated with your PayPay account.
        </p>
      </header>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Profile editing will be available once backend integration is complete.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contact support if you need to update your organization email or change ownership rights.
        </CardContent>
      </Card>
    </div>
  );
}
