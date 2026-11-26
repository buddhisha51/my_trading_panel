import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type { AttachmentItem, NoteItem, UpsertNotePayload } from '../types/notes';

interface NotesFilters {
  query: string;
  pair: string | null;
  session: string | null;
}

interface NotesState {
  notes: NoteItem[];
  loading: boolean;
  saving: boolean;
  filters: NotesFilters;
  attachmentsByNoteId: Record<string, AttachmentItem[]>;

  setFilters: (patch: Partial<NotesFilters>) => Promise<void>;
  loadNotes: () => Promise<void>;
  saveNote: (payload: UpsertNotePayload) => Promise<NoteItem>;
  togglePinNote: (note: NoteItem) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  loadNoteAttachments: (noteId: string) => Promise<AttachmentItem[]>;
  attachFileToNote: (
    noteDraft: UpsertNotePayload & { id: string },
    fileBytes: number[],
    mimeType: string,
    width?: number | null,
    height?: number | null,
  ) => Promise<AttachmentItem>;
  removeNoteAttachment: (noteId: string, attachmentId: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>()(
  immer((set, get) => ({
    notes: [],
    loading: false,
    saving: false,
    filters: { query: '', pair: null, session: null },
    attachmentsByNoteId: {},

    setFilters: async (patch) => {
      set((s) => {
        Object.assign(s.filters, patch);
      });
      await get().loadNotes();
    },

    loadNotes: async () => {
      set((s) => {
        s.loading = true;
      });
      try {
        const filters = get().filters;
        const rows = await tauriBridge.listNotes(filters);
        const attachmentEntries = await Promise.all(
          rows.map(async (row) => {
            try {
              const list = await tauriBridge.listAttachments('notes', row.id);
              return [row.id, list] as const;
            } catch {
              return [row.id, [] as AttachmentItem[]] as const;
            }
          }),
        );
        set((s) => {
          s.notes = rows;
          for (const [noteId, list] of attachmentEntries) {
            s.attachmentsByNoteId[noteId] = list;
          }
          s.loading = false;
        });
      } catch {
        set((s) => {
          s.loading = false;
        });
      }
    },

    saveNote: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const saved = await tauriBridge.upsertNote(payload);
        await get().loadNotes();
        return saved;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    togglePinNote: async (note) => {
      await get().saveNote({
        id: note.id,
        title: note.title,
        bodyJson: note.bodyJson,
        bodyText: note.bodyText,
        canvasJson: note.canvasJson,
        tags: note.tags,
        pair: note.pair,
        session: note.session,
        isPinned: !note.isPinned,
      });
    },

    deleteNote: async (id) => {
      await tauriBridge.deleteNote(id);
      set((s) => {
        s.notes = s.notes.filter((n) => n.id !== id);
        delete s.attachmentsByNoteId[id];
      });
    },

    loadNoteAttachments: async (noteId) => {
      const list = await tauriBridge.listAttachments('notes', noteId);
      set((s) => {
        s.attachmentsByNoteId[noteId] = list;
      });
      return list;
    },

    attachFileToNote: async (noteDraft, fileBytes, mimeType, width = null, height = null) => {
      // Ensure parent row exists before saving FK-referenced attachment row
      if (!get().notes.some((n) => n.id === noteDraft.id)) {
        await get().saveNote(noteDraft);
      }
      const saved = await tauriBridge.saveAttachment({
        ownerType: 'notes',
        ownerId: noteDraft.id,
        bytes: fileBytes,
        mimeType,
        width,
        height,
      });
      set((s) => {
        const cur = s.attachmentsByNoteId[noteDraft.id] ?? [];
        s.attachmentsByNoteId[noteDraft.id] = [saved, ...cur];
      });
      return saved;
    },

    removeNoteAttachment: async (noteId, attachmentId) => {
      await tauriBridge.deleteAttachment('notes', attachmentId);
      set((s) => {
        const cur = s.attachmentsByNoteId[noteId] ?? [];
        s.attachmentsByNoteId[noteId] = cur.filter((a) => a.id !== attachmentId);
      });
    },
  })),
);
