import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

export type UiSlice = {
  toast: string | null;
  setToast: (msg: string | null) => void;
  /** The set whose share modal is currently open. `null` means the modal is
   * closed. Storing the set itself rather than just the id avoids a lookup
   * from inside <ShareModal>. */
  shareSet: MusicSet | null;
  openShareModal: (set: MusicSet) => void;
  closeShareModal: () => void;
};

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  toast: null,
  setToast: (msg) => set({ toast: msg }),
  shareSet: null,
  openShareModal: (s) => set({ shareSet: s }),
  closeShareModal: () => set({ shareSet: null }),
});
