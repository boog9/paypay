import { bffFetch } from "@/lib/bff-fetch";

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type AuthUserResponse = {
  user: AuthUser;
};

function parseAuthUser(payload: unknown): AuthUser {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid auth response payload.");
  }

  const record = payload as Record<string, unknown>;
  const user = record.user;

  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("Auth response is missing user data.");
  }

  const userRecord = user as Record<string, unknown>;
  const id = userRecord.id;
  const email = userRecord.email;
  const name = userRecord.name;

  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Auth response is missing a valid user id.");
  }

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Auth response is missing a valid user email.");
  }

  const normalizedName = typeof name === "string" && name.trim() ? name.trim() : null;

  return { id: id.trim(), email: email.trim(), name: normalizedName } satisfies AuthUser;
}

export async function getCurrentUserSafe(): Promise<AuthUser | null> {
  const response = await bffFetch("/api/auth/me", { cache: "no-store" });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load auth session (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  const user = parseAuthUser(payload);

  return user;
}
