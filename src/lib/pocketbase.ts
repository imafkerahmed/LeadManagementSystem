import PocketBase from "pocketbase";

const defaultPocketBaseUrl = "https://amazoncrm-db.codix.site";

export const pocketBaseUrl = (
  process.env.NEXT_PUBLIC_POCKETBASE_URL ?? defaultPocketBaseUrl
).replace(/\/$/, "");

export function createPocketBaseClient() {
  return new PocketBase(pocketBaseUrl);
}

export async function checkPocketBaseHealth() {
  const healthUrl = new URL("/api/health", pocketBaseUrl).toString();

  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
    });

    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      healthUrl,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null as number | null,
      healthUrl,
      body: error instanceof Error ? error.message : "Unknown PocketBase error",
    };
  }
}
