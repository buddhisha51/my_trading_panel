import { create } from 'zustand';
import { tauriBridge } from '../services/tauriBridge';
import type { FloatingViewerPayload, ViewerEditRequest } from '../types/viewer';

interface ViewerStoreState {
  previewPayload: FloatingViewerPayload | null;
  previewPinned: boolean;
  editRequest: ViewerEditRequest | null;
  openViewer: (payload: FloatingViewerPayload) => Promise<void>;
  setPreviewPinned: (pinned: boolean) => void;
  closePreviewViewer: () => void;
  triggerEditRequest: (kind: 'note' | 'strategy', id: string) => void;
  clearEditRequest: () => void;
}

export const useViewerStore = create<ViewerStoreState>((set) => ({
  previewPayload: null,
  previewPinned: false,
  editRequest: null,

  openViewer: async (payload) => {
    const handledNatively = await tauriBridge.openFloatingViewer(payload);
    if (!handledNatively) {
      set({ previewPayload: payload });
    }
  },

  setPreviewPinned: (pinned) => set({ previewPinned: pinned }),

  closePreviewViewer: () => set({ previewPayload: null, previewPinned: false }),

  triggerEditRequest: (kind, id) =>
    set({
      previewPayload: null,
      previewPinned: false,
      editRequest: { kind, id, nonce: Date.now() },
    }),

  clearEditRequest: () => set({ editRequest: null }),
}));
