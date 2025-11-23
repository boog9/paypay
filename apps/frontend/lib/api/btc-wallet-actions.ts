import { bffFetch } from "@/lib/bff-fetch";

const BTC_WALLET_CODE = "btc";

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;

  let message: string | null = null;
  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      message = payload.message.trim();
    }
  } catch {
    // Ignore body parsing errors and fall back to a generic message.
  }

  if (!message) {
    message = response.status === 403 ? "Insufficient permissions" : response.statusText || "Request failed";
  }

  throw new Error(message);
}

export async function rescanBtcWallet(
  storeId: string,
  payload: { startIndex: number; gapLimit: number; batchSize: number }
): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/${BTC_WALLET_CODE}/actions/rescan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  await assertOk(response);
}

export async function pruneBtcWalletHistory(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/${BTC_WALLET_CODE}/actions/prune-history`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function clearBtcWalletHistory(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/${BTC_WALLET_CODE}/actions/clear-history`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function replaceBtcWallet(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/${BTC_WALLET_CODE}/actions/replace`, {
    method: "POST"
  });
  await assertOk(response);
}

export async function removeBtcWallet(storeId: string): Promise<void> {
  const response = await bffFetch(`/api/stores/${storeId}/wallets/${BTC_WALLET_CODE}/actions/remove`, {
    method: "POST"
  });
  await assertOk(response);
}
