import { create } from 'zustand';
import { tauriBridge } from '../services/tauriBridge';
import type { FloatingViewerPayload, ViewerEditRequest } from '../types/viewer';

export interface NoteLinkRequest {
  tradeId?: string | null;
  ongoingTradeId?: string | null;
  pair?: string | null;
  session?: string | null;
  suggestedTitle?: string;
  nonce: number;
}

interface ViewerStoreState {
  previewPayload: FloatingViewerPayload | null;
  previewPinned: boolean;
  editRequest: ViewerEditRequest | null;
  navigateRequest: ViewerEditRequest | null;
  noteLinkRequest: NoteLinkRequest | null;
  openViewer: (payload: FloatingViewerPayload) => Promise<void>;
  setPreviewPinned: (pinned: boolean) => void;
  closePreviewViewer: () => void;
  triggerEditRequest: (kind: 'note' | 'strategy', id: string) => void;
  clearEditRequest: () => void;
  triggerNavigateRequest: (kind: 'note' | 'strategy', id: string) => void;
  clearNavigateRequest: () => void;
  triggerNoteLinkRequest: (req: Omit<NoteLinkRequest, 'nonce'>) => void;
  clearNoteLinkRequest: () => void;
}

export const useViewerStore = create<ViewerStoreState>((set) => ({
  previewPayload: null,
  previewPinned: false,
  editRequest: null,
  navigateRequest: null,
  noteLinkRequest: null,

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

  triggerNavigateRequest: (kind, id) =>
    set({
      navigateRequest: { kind, id, nonce: Date.now() },
    }),

  clearNavigateRequest: () => set({ navigateRequest: null }),

  triggerNoteLinkRequest: (req) =>
    set({
      noteLinkRequest: { ...req, nonce: Date.now() },
    }),

  clearNoteLinkRequest: () => set({ noteLinkRequest: null }),
}));
