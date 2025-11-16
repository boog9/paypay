import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StoreSettingsForm } from "../StoreSettingsForm";

const { pushMock, replaceMock, refreshMock, toastMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("../../../../../../../../lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

vi.mock("../../../../../../../../components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

const { bffFetch } = await import("../../../../../../../../lib/bff-fetch");
const mockFetch = vi.mocked(bffFetch);

describe("StoreSettingsForm", () => {
  const initial = {
    storeId: "store-123",
    name: "Demo Store",
    website: "https://demo.example",
    defaultCurrency: "USD",
  };

  beforeEach(() => {
    mockFetch.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    toastMock.mockReset();
  });

  it("renders the initial settings", () => {
    render(<StoreSettingsForm initial={initial} />);

    expect(screen.getByLabelText(/Store ID/i)).toHaveValue("store-123");
    expect(screen.getByLabelText(/Store name/i)).toHaveValue("Demo Store");
    expect(screen.getByLabelText(/Store website/i)).toHaveValue("https://demo.example");
    expect(screen.getByLabelText(/Default currency/i)).toHaveValue("USD");
  });

  it("submits updates via PUT and applies returned values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        storeId: "store-123",
        name: "Updated Store",
        website: "https://updated.example",
        defaultCurrency: "EUR",
      }),
    } as unknown as Response);

    render(<StoreSettingsForm initial={initial} />);

    fireEvent.change(screen.getByLabelText(/Store name/i), { target: { value: "Updated Store" } });
    fireEvent.change(screen.getByLabelText(/Default currency/i), { target: { value: "EUR" } });

    fireEvent.submit(screen.getByRole("button", { name: /Save settings/i }).closest("form")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stores/store-123",
        expect.objectContaining({ method: "PUT" })
      );
    });

    const requestInit = mockFetch.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    expect(requestInit?.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(JSON.parse((requestInit?.body as string) ?? "{}")).toEqual({
      name: "Updated Store",
      website: "https://demo.example",
      defaultCurrency: "EUR",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Store name/i)).toHaveValue("Updated Store");
    });
    expect(screen.getByLabelText(/Default currency/i)).toHaveValue("EUR");
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith({ title: "Settings saved", variant: "success" });
  });

  it("sends DELETE request when archiving and redirects afterwards", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: vi.fn(),
    } as unknown as Response);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StoreSettingsForm initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: /Archive this store/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stores/store-123",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/stores");
    expect(refreshMock).toHaveBeenCalled();
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith({ title: "Store archived", variant: "success" });

    confirmSpy.mockRestore();
  });

  it("deletes the store when confirmed from the delete button", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: vi.fn(),
    } as unknown as Response);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StoreSettingsForm initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: /Delete this store/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stores/store-123",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith({ title: "Store deleted", variant: "success" });
    expect(pushMock).toHaveBeenCalledWith("/stores");
    expect(refreshMock).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
