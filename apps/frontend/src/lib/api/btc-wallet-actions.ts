import { bffFetch } from "@/lib/bff-fetch";

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const message = response.status === 403 ? "Insufficient permissions" : "Request failed";
    throw new Error(message);
  }
}

export async function rescanBtcWallet(
  storeId: string,
  payload: { startingIndex?: number; gapLimit?: number; batchSize?: number }
): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin/actions/rescan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  await assertOk(response);
}

export async function pruneBtcWalletHistory(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin/actions/prune-history`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function clearBtcWalletHistory(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin/actions/clear-history`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function replaceBtcWallet(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin/actions/replace`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function removeBtcWallet(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin/actions/remove`, {
    method: "POST"
  });
  await assertOk(response);
}
