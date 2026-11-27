import { create } from 'zustand';
import { tauriBridge } from '../services/tauriBridge';
import type { FloatingViewerPayload, ViewerEditRequest } from '../types/viewer';

interface ViewerStoreState {
  previewPayload: FloatingViewerPayload | null;
  editRequest: ViewerEditRequest | null;
  openViewer: (payload: FloatingViewerPayload) => Promise<void>;
  closePreviewViewer: () => void;
  triggerEditRequest: (kind: 'note' | 'strategy', id: string) => void;
  clearEditRequest: () => void;
}

export const useViewerStore = create<ViewerStoreState>((set) => ({
  previewPayload: null,
  editRequest: null,

  openViewer: async (payload) => {
    const handledNatively = await tauriBridge.openFloatingViewer(payload);
    if (!handledNatively) {
      set({ previewPayload: payload });
    }
  },

  closePreviewViewer: () => set({ previewPayload: null }),

  triggerEditRequest: (kind, id) =>
    set({
      previewPayload: null,
      editRequest: { kind, id, nonce: Date.now() },
    }),

  clearEditRequest: () => set({ editRequest: null }),
}));
