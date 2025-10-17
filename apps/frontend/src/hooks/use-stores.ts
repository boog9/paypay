"use client";

import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

import { api } from "../../lib/api";

const rawStoreSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  storeId: z.string().min(1).optional(),
  storeName: z.string().min(1).optional(),
  defaultCurrency: z.string().min(1).optional(),
});

const responseSchema = z.array(rawStoreSchema);

export type StoreSummary = {
  id: string;
  name: string;
  defaultCurrency: string | null;
};

function normalizeStore(record: z.infer<typeof rawStoreSchema>): StoreSummary | null {
  const idCandidate = record.id ?? record.storeId;
  const nameCandidate = record.name ?? record.storeName;

  if (!idCandidate || !nameCandidate) {
    return null;
  }

  return {
    id: idCandidate,
    name: nameCandidate,
    defaultCurrency: record.defaultCurrency ? record.defaultCurrency.trim().toUpperCase() : null,
  };
}

export function useStoresQuery(): UseQueryResult<StoreSummary[]> {
  const query = useQuery<StoreSummary[]>({
    queryKey: ["stores"],
    queryFn: async () => {
      const response = await api<unknown>("/api/stores", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const parsed = responseSchema.safeParse(response);
      if (!parsed.success) {
        return [];
      }

      const normalized = parsed.data
        .map((record) => normalizeStore(record))
        .filter((record): record is StoreSummary => Boolean(record));

      return normalized;
    },
    select: (data) => data ?? [],
  });

  return useMemo(() => query, [query]);
}
