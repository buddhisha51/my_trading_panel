import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Layers,
  Pin,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { tauriBridge } from '../../services/tauriBridge';
import { useNotesStore } from '../../stores/notesStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  EMPTY_TIPTAP_DOC,
  parseCanvasDocument,
  type CanvasDocument,
} from '../../types/canvas';
import type { NoteItem } from '../../types/notes';
import { generateUlid } from '../../utils/id';
import {
  blobToImagePayload,
  launchWindowsScreenSnip,
} from '../../utils/imageClipboard';
import { RichTextEditor } from '../editor/RichTextEditor';

const DrawingCanvas = lazy(() =>
  import('../canvas/DrawingCanvas').then((m) => ({ default: m.DrawingCanvas })),
);

const SESSION_OPTIONS = ['', 'Asian', 'London Open', 'NY AM', 'London Close', 'NY PM'];

interface NoteDraft {
  id: string;
  title: string;
  bodyJson: string;
  bodyText: string;
  canvasDoc: CanvasDocument;
  tagsText: string;
  pair: string;
  session: string;
  isPinned: boolean;
}

function toNoteDraft(note: NoteItem): NoteDraft {
  return {
    id: note.id,
    title: note.title,
    bodyJson: note.bodyJson || EMPTY_TIPTAP_DOC,
    bodyText: note.bodyText,
    canvasDoc: parseCanvasDocument(note.canvasJson),
    tagsText: note.tags.join(', '),
    pair: note.pair ?? '',
    session: note.session ?? '',
    isPinned: note.isPinned,
  };
}

function createNewNoteDraft(): NoteDraft {
  return {
    id: generateUlid(),
    title: '',
    bodyJson: EMPTY_TIPTAP_DOC,
    bodyText: '',
    canvasDoc: parseCanvasDocument(null),
    tagsText: '',
    pair: '',
    session: '',
    isPinned: false,
  };
}

function parseTagsCsv(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function QuickNotesWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);

  const notes = useNotesStore((s) => s.notes);
  const loading = useNotesStore((s) => s.loading);
  const saving = useNotesStore((s) => s.saving);
  const filters = useNotesStore((s) => s.filters);
  const attachmentsByNoteId = useNotesStore((s) => s.attachmentsByNoteId);

  const loadNotes = useNotesStore((s) => s.loadNotes);
  const setFilters = useNotesStore((s) => s.setFilters);
  const saveNote = useNotesStore((s) => s.saveNote);
  const togglePinNote = useNotesStore((s) => s.togglePinNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const loadNoteAttachments = useNotesStore((s) => s.loadNoteAttachments);
  const attachFileToNote = useNotesStore((s) => s.attachFileToNote);
  const removeNoteAttachment = useNotesStore((s) => s.removeNoteAttachment);

  const [searchInput, setSearchInput] = useState(filters.query);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Debounced FTS5 search
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (searchInput !== filters.query) {
        void setFilters({ query: searchInput });
      }
    }, 160);
    return () => window.clearTimeout(id);
  }, [filters.query, searchInput, setFilters]);

  const draftToPayload = (d: NoteDraft) => {
    const hasShapes =
      d.canvasDoc.shapes.length > 0 || Boolean(d.canvasDoc.backgroundAttachmentPath);
    return {
      id: d.id,
      title: d.title.trim() || 'Untitled Note',
      bodyJson: d.bodyJson,
      bodyText: d.bodyText,
      canvasJson: hasShapes ? JSON.stringify(d.canvasDoc) : null,
      tags: parseTagsCsv(d.tagsText),
      pair: d.pair.trim() || null,
      session: d.session || null,
      isPinned: d.isPinned,
    };
  };

  const handleOpenNote = (note: NoteItem) => {
    const next = toNoteDraft(note);
    setDraft(next);
    const hasCanvas =
      next.canvasDoc.shapes.length > 0 || Boolean(next.canvasDoc.backgroundAttachmentPath);
    setShowCanvas(hasCanvas);
    void loadNoteAttachments(note.id);
  };

  const handleCreateNote = () => {
    setDraft(createNewNoteDraft());
    setShowCanvas(false);
  };

  const handleSaveCurrent = async (currentDraft: NoteDraft = draft!) => {
    if (!currentDraft) return;
    await saveNote(draftToPayload(currentDraft));
  };

  const handleAttachBlob = async (blob: Blob, openCanvas = true): Promise<string | null> => {
    if (!draft) return null;
    const payload = await blobToImagePayload(blob);
    const saved = await attachFileToNote(
      draftToPayload(draft),
      payload.bytes,
      payload.mimeType,
      payload.width,
      payload.height,
    );
    if (openCanvas) {
      const updatedCanvas: CanvasDocument = {
        ...draft.canvasDoc,
        backgroundAttachmentPath: saved.relativePath,
      };
      const nextDraft: NoteDraft = { ...draft, canvasDoc: updatedCanvas };
      setDraft(nextDraft);
      setShowCanvas(true);
      await saveNote(draftToPayload(nextDraft));
    }
    return saved.relativePath;
  };

  if (draft) {
    const attachments = attachmentsByNoteId[draft.id] ?? [];

    return (
      <div data-lock-open="true" className="space-y-2 text-[11px]">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => {
              const isEmptyUnsaved =
                !notes.some((n) => n.id === draft.id) &&
                !draft.title.trim() &&
                !draft.bodyText.trim() &&
                draft.canvasDoc.shapes.length === 0 &&
                !draft.canvasDoc.backgroundAttachmentPath;
              if (isEmptyUnsaved) {
                setDraft(null);
              } else {
                void handleSaveCurrent(draft).then(() => setDraft(null));
              }
            }}
            className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, isPinned: !draft.isPinned })}
              title={draft.isPinned ? 'Unpin note' : 'Pin note'}
              className={`rounded border p-1 ${draft.isPinned
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
            >
              <Pin className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setShowCanvas((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium ${showCanvas
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                }`}
            >
              <Layers className="h-3 w-3" />
              {showCanvas ? 'Hide Canvas' : 'ICT Canvas'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveCurrent(draft)}
              className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Title & Metadata */}
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Note title (e.g. NY AM EURUSD Sweep + FVG)..."
          className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-100 placeholder:font-normal placeholder:text-slate-600"
        />

        <div className="grid grid-cols-3 gap-1.5">
          <select
            aria-label="Note Pair"
            value={draft.pair}
            onChange={(e) => setDraft({ ...draft, pair: e.target.value })}
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[10px] text-slate-200"
          >
            <option value="">Pair (Any)</option>
            {Array.from(new Set([...watchlistPairs, ...(draft.pair ? [draft.pair] : [])])).map(
              (p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ),
            )}
          </select>

          <select
            aria-label="Note Session"
            value={draft.session}
            onChange={(e) => setDraft({ ...draft, session: e.target.value })}
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-200"
          >
            {SESSION_OPTIONS.map((s) => (
              <option key={s || 'any'} value={s}>
                {s || 'Session (Any)'}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={draft.tagsText}
            onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
            placeholder="tags: fvg, bsl"
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-200 placeholder:text-slate-600"
          />
        </div>

        {/* Rich Text Editor (TipTap) */}
        <RichTextEditor
          docId={draft.id}
          initialBodyJson={draft.bodyJson}
          onChange={(bodyJson, bodyText) =>
            setDraft((prev) => (prev ? { ...prev, bodyJson, bodyText } : null))
          }
          onPasteImage={(file) => void handleAttachBlob(file, true)}
        />

        {/* Attachments Strip + Quick Actions */}
        <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/60 p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <ImageIcon className="h-3 w-3" />
              Screenshots ({attachments.length})
            </span>
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAttachBlob(f, true);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
              >
                <Upload className="h-3 w-3" />
                Attach
              </button>
              <button
                type="button"
                onClick={() => void launchWindowsScreenSnip()}
                className="inline-flex items-center gap-0.5 rounded border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 text-blue-300 hover:bg-blue-500/25"
              >
                <Camera className="h-3 w-3" />
                Snip
              </button>
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pt-1">
              {attachments.map((att) => {
                const src = tauriBridge.resolveAttachmentSrc(att.relativePath);
                const isCanvasBg = draft.canvasDoc.backgroundAttachmentPath === att.relativePath;
                return (
                  <div
                    key={att.id}
                    className={`group relative h-14 w-20 shrink-0 overflow-hidden rounded border ${isCanvasBg ? 'border-blue-500' : 'border-slate-700'
                      } bg-slate-900`}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt="Chart screenshot"
                        className="h-full w-full cursor-pointer object-cover"
                        title="Click to annotate on ICT Canvas"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            canvasDoc: {
                              ...draft.canvasDoc,
                              backgroundAttachmentPath: att.relativePath,
                            },
                          });
                          setShowCanvas(true);
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-slate-500">
                        Img
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void removeNoteAttachment(draft.id, att.id);
                        if (isCanvasBg) {
                          setDraft({
                            ...draft,
                            canvasDoc: { ...draft.canvasDoc, backgroundAttachmentPath: null },
                          });
                        }
                      }}
                      title="Delete attachment"
                      className="absolute top-0.5 right-0.5 hidden rounded bg-slate-950/90 p-0.5 text-rose-400 group-hover:block"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive Konva ICT Canvas */}
        {showCanvas && (
          <Suspense
            fallback={
              <div className="rounded border border-slate-800 bg-slate-950/70 p-4 text-center text-[10px] text-slate-400">
                Loading ICT Drawing Canvas...
              </div>
            }
          >
            <DrawingCanvas
              key={draft.id}
              document={draft.canvasDoc}
              onChange={(nextCanvas) => setDraft({ ...draft, canvasDoc: nextCanvas })}
              onSaveScreenshotFile={(blob) => handleAttachBlob(blob, false)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[11px]">
      {/* Search & New Button */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search notes (FTS5)..."
            className="w-full rounded border border-slate-800 bg-slate-950 py-1 pr-2 pl-6 text-[11px] text-slate-100 placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={handleCreateNote}
          className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {/* Pair & Session Filters */}
      <div className="grid grid-cols-2 gap-1.5">
        <select
          aria-label="Filter Notes by Pair"
          value={filters.pair ?? ''}
          onChange={(e) => void setFilters({ pair: e.target.value || null })}
          className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[10px] text-slate-300"
        >
          <option value="">All Pairs</option>
          {watchlistPairs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter Notes by Session"
          value={filters.session ?? ''}
          onChange={(e) => void setFilters({ session: e.target.value || null })}
          className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300"
        >
          {SESSION_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All Sessions'}
            </option>
          ))}
        </select>
      </div>

      {/* Notes Feed */}
      {loading && notes.length === 0 ? (
        <div className="py-4 text-center text-[10px] text-slate-500">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-[10px] text-slate-500">
          No notes match. Click &ldquo;+ New&rdquo; to capture live market structure or markups.
        </div>
      ) : (
        <div className="space-y-1.5">
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => handleOpenNote(n)}
              className="group cursor-pointer rounded-md border border-slate-800 bg-slate-950/75 p-2 transition-colors hover:border-slate-700 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    {n.isPinned && <Pin className="h-3 w-3 shrink-0 text-amber-400" />}
                    <span className="truncate font-semibold text-slate-100">
                      {n.title || 'Untitled Note'}
                    </span>
                  </div>
                  {n.bodyText && (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-400">
                      {n.bodyText}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5 opacity-80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void togglePinNote(n);
                    }}
                    title={n.isPinned ? 'Unpin' : 'Pin note'}
                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-amber-300"
                  >
                    <Pin className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteNote(n.id);
                    }}
                    title="Delete note"
                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px]">
                {n.pair && (
                  <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-blue-300">
                    {n.pair}
                  </span>
                )}
                {n.session && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                    {n.session}
                  </span>
                )}
                {n.canvasJson && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                    Canvas
                  </span>
                )}
                {n.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
