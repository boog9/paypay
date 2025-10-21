"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type StorePageProps = {
  params: { storeId: string };
};

export default function StoreRedirectPage({ params }: StorePageProps) {
  const router = useRouter();
  const { storeId } = params;

  useEffect(() => {
    router.replace(`/stores/${storeId}/dashboard`);
  }, [router, storeId]);

  return null;
}
