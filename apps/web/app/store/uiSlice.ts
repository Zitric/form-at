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
  /** Mobile full-screen "now playing" overlay open/closed flag. Mini-player
   *  tap sets this true; close button + route changes set it false.
   *  <FullPlayer> renders null when this is true but `nowPlaying` is null,
   *  so the overlay can't end up empty if something opens it racily. */
  fullPlayerOpen: boolean;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
};

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  toast: null,
  setToast: (msg) => set({ toast: msg }),
  shareSet: null,
  openShareModal: (s) => set({ shareSet: s }),
  closeShareModal: () => set({ shareSet: null }),
  fullPlayerOpen: false,
  openFullPlayer: () => set({ fullPlayerOpen: true }),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
});
