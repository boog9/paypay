import { redirect } from "next/navigation";

type StorePageProps = {
  params: { storeId: string };
};

export default function StoreRedirectPage({ params }: StorePageProps) {
  const { storeId } = params;
  redirect(`/stores/${storeId}/dashboard`);
}
