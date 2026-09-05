export type AccountEntryDraft = {
  requestId: string;
  profileId: string;
  type: "Deposit" | "Payout";
  amount: string;
  notes: string;
};

export function accountDraftKey(actorId: string, profileId: string): string {
  return `ptown:pending-account-entry:${actorId}:${profileId}`;
}

export function loadAccountDraft(storage: Pick<Storage, 'getItem'>, key: string): AccountEntryDraft | null {
  const saved = storage.getItem(key);
  if (!saved) return null;
  const draft = JSON.parse(saved) as AccountEntryDraft;
  if (!draft.requestId || !draft.profileId || !["Deposit", "Payout"].includes(draft.type) ||
      typeof draft.amount !== "string" || typeof draft.notes !== "string") {
    throw new Error("The pending entry could not be read.");
  }
  return draft;
}

export function saveAccountDraft(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, draft: AccountEntryDraft): AccountEntryDraft {
  // Never replace an entry whose successful response may have been lost.
  const pending = loadAccountDraft(storage, key);
  if (pending) return pending;
  storage.setItem(key, JSON.stringify(draft));
  return draft;
}
