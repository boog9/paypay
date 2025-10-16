import type { Metadata } from "next";
import { DashboardContent } from "../../../src/components/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
