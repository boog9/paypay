import { redirect } from "next/navigation";

type StorePageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function StoreRedirectPage({ params }: StorePageProps) {
  const { storeId } = await params;
  redirect(`/tenants/${storeId}`);
}
