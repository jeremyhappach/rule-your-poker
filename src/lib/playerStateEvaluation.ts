import { setSessionPlayerIntent } from "@/lib/sessionPlayerIntent";

/** Queue a seated player for the next authoritative participation boundary. */
export async function handlePlayerRejoin(playerId: string): Promise<boolean> {
  try {
    await setSessionPlayerIntent(playerId, "rejoin");
    return true;
  } catch (error) {
    console.error("Rejoin request failed:", error);
    return false;
  }
}
