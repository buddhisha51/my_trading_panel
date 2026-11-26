import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  Edit3,
  Layers,
  Plus,
  RotateCcw,
  Square,
  Star,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useStrategiesStore } from '../../stores/strategiesStore';
import {
  EMPTY_TIPTAP_DOC,
  parseCanvasDocument,
  type CanvasDocument,
} from '../../types/canvas';
import type { StrategyItem } from '../../types/notes';
import { generateUlid } from '../../utils/id';
import { blobToImagePayload } from '../../utils/imageClipboard';
import { evaluateSetupChecklist, gradeColor } from '../../utils/strategyGrade';
import { RichTextEditor } from '../editor/RichTextEditor';

const DrawingCanvas = lazy(() =>
  import('../canvas/DrawingCanvas').then((m) => ({ default: m.DrawingCanvas })),
);

interface EditableRule {
  id: string;
  name: string;
  description: string | null;
  isRequired: boolean;
}

interface StrategyDraft {
  id: string;
  name: string;
  description: string;
  bodyJson: string;
  canvasDoc: CanvasDocument;
  tagsText: string;
  isActive: boolean;
  sortOrder: number;
  checklist: EditableRule[];
}

function toStrategyDraft(s: StrategyItem): StrategyDraft {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    bodyJson: s.bodyJson || EMPTY_TIPTAP_DOC,
    canvasDoc: parseCanvasDocument(s.canvasJson),
    tagsText: s.tags.join(', '),
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    checklist: s.checklist.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      isRequired: c.isRequired,
    })),
  };
}

function createNewStrategyDraft(nextOrder: number): StrategyDraft {
  return {
    id: generateUlid(),
    name: '',
    description: '',
    bodyJson: EMPTY_TIPTAP_DOC,
    canvasDoc: parseCanvasDocument(null),
    tagsText: '',
    isActive: true,
    sortOrder: nextOrder,
    checklist: [
      { id: generateUlid(), name: 'HTF Bias / DOL Aligned', description: null, isRequired: true },
      { id: generateUlid(), name: 'BSL/SSL Liquidity Sweep', description: null, isRequired: true },
      { id: generateUlid(), name: 'MSS / CISD + FVG Displacement', description: null, isRequired: true },
      { id: generateUlid(), name: 'Inside Active Killzone', description: null, isRequired: false },
    ],
  };
}

export function StrategiesWidget() {
  const strategies = useStrategiesStore((s) => s.strategies);
  const loading = useStrategiesStore((s) => s.loading);
  const saving = useStrategiesStore((s) => s.saving);
  const checkedRuleIdsByStrategy = useStrategiesStore((s) => s.checkedRuleIdsByStrategy);

  const loadStrategies = useStrategiesStore((s) => s.loadStrategies);
  const saveStrategy = useStrategiesStore((s) => s.saveStrategy);
  const deleteStrategy = useStrategiesStore((s) => s.deleteStrategy);
  const toggleChecklistExecution = useStrategiesStore((s) => s.toggleChecklistExecution);
  const resetChecklistExecution = useStrategiesStore((s) => s.resetChecklistExecution);
  const attachFileToStrategy = useStrategiesStore((s) => s.attachFileToStrategy);

  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StrategyDraft | null>(null);
  const [showEditCanvas, setShowEditCanvas] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleRequired, setNewRuleRequired] = useState(true);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  useEffect(() => {
    if (!selectedStrategyId && strategies.length > 0) {
      setSelectedStrategyId(strategies[0].id);
    } else if (
      selectedStrategyId &&
      strategies.length > 0 &&
      !strategies.some((s) => s.id === selectedStrategyId)
    ) {
      setSelectedStrategyId(strategies[0].id);
    }
  }, [selectedStrategyId, strategies]);

  const draftToPayload = (d: StrategyDraft) => {
    const hasCanvas =
      d.canvasDoc.shapes.length > 0 || Boolean(d.canvasDoc.backgroundAttachmentPath);
    return {
      id: d.id,
      name: d.name.trim() || 'Untitled Playbook',
      description: d.description.trim() || null,
      bodyJson: d.bodyJson,
      canvasJson: hasCanvas ? JSON.stringify(d.canvasDoc) : null,
      tags: Array.from(
        new Set(
          d.tagsText
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ),
      isActive: d.isActive,
      sortOrder: d.sortOrder,
      checklist: d.checklist.map((r, idx) => ({
        id: r.id,
        name: r.name.trim() || `Rule #${idx + 1}`,
        description: r.description,
        sortOrder: idx,
        isRequired: r.isRequired,
      })),
    };
  };

  const handleSaveDraft = async (closeAfter = false) => {
    if (!draft) return;
    const saved = await saveStrategy(draftToPayload(draft));
    setSelectedStrategyId(saved.id);
    if (closeAfter) {
      setDraft(null);
    }
  };

  const handleAttachBlobToDraft = async (blob: Blob): Promise<string | null> => {
    if (!draft) return null;
    const decoded = await blobToImagePayload(blob);
    const saved = await attachFileToStrategy(
      draftToPayload(draft),
      decoded.bytes,
      decoded.mimeType,
    );
    const nextCanvas: CanvasDocument = {
      ...draft.canvasDoc,
      backgroundAttachmentPath: saved.relativePath,
    };
    const nextDraft = { ...draft, canvasDoc: nextCanvas };
    setDraft(nextDraft);
    setShowEditCanvas(true);
    await saveStrategy(draftToPayload(nextDraft));
    return saved.relativePath;
  };

  const handleAddChecklistRule = () => {
    if (!draft) return;
    const trimmed = newRuleText.trim();
    if (!trimmed) return;
    setDraft({
      ...draft,
      checklist: [
        ...draft.checklist,
        { id: generateUlid(), name: trimmed, description: null, isRequired: newRuleRequired },
      ],
    });
    setNewRuleText('');
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    if (!draft) return;
    const target = idx + dir;
    if (target < 0 || target >= draft.checklist.length) return;
    const copy = [...draft.checklist];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setDraft({ ...draft, checklist: copy });
  };

  if (draft) {
    return (
      <div data-lock-open="true" className="space-y-2.5 text-[11px]">
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => void handleSaveDraft(true)}
            className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Done
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowEditCanvas((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium ${showEditCanvas
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                }`}
            >
              <Layers className="h-3 w-3" />
              Diagram
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveDraft(false)}
              className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Playbook Name (e.g. ICT 2022 Model NY AM)..."
          className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-100"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Short summary..."
            className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"
          />
          <input
            type="text"
            value={draft.tagsText}
            onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
            placeholder="Tags: silver bullet, ny am"
            className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"
          />
        </div>

        {/* Checklist Template Builder */}
        <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/70 p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-slate-200">
              Confluence Checklist ({draft.checklist.length})
            </span>
            <span className="text-slate-500">★ = Required for A+</span>
          </div>

          <div className="space-y-1">
            {draft.checklist.map((rule, idx) => (
              <div
                key={rule.id}
                className="flex items-center gap-1 rounded border border-slate-800/90 bg-slate-900/75 px-1.5 py-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = draft.checklist.map((r) =>
                      r.id === rule.id ? { ...r, isRequired: !r.isRequired } : r,
                    );
                    setDraft({ ...draft, checklist: next });
                  }}
                  title={rule.isRequired ? 'Required (click for optional)' : 'Optional (click for required)'}
                  className={`rounded p-0.5 ${rule.isRequired ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                    }`}
                >
                  <Star className="h-3 w-3" fill={rule.isRequired ? 'currentColor' : 'none'} />
                </button>
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => {
                    const next = draft.checklist.map((r) =>
                      r.id === rule.id ? { ...r, name: e.target.value } : r,
                    );
                    setDraft({ ...draft, checklist: next });
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-100 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveRule(idx, -1)}
                  className="rounded p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === draft.checklist.length - 1}
                  onClick={() => moveRule(idx, 1)}
                  className="rounded p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      checklist: draft.checklist.filter((r) => r.id !== rule.id),
                    })
                  }
                  className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => setNewRuleRequired((v) => !v)}
              title="Mark new rule as Required"
              className={`rounded border p-1 ${newRuleRequired
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
            >
              <Star className="h-3 w-3" fill={newRuleRequired ? 'currentColor' : 'none'} />
            </button>
            <input
              type="text"
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddChecklistRule();
                }
              }}
              placeholder="Add confluence condition..."
              className="flex-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddChecklistRule}
              className="rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-700"
            >
              Add
            </button>
          </div>
        </div>

        <RichTextEditor
          docId={draft.id}
          initialBodyJson={draft.bodyJson}
          placeholder="Document entry criteria, invalidation, targets..."
          onChange={(bodyJson) => setDraft((prev) => (prev ? { ...prev, bodyJson } : null))}
          onPasteImage={(file) => void handleAttachBlobToDraft(file)}
        />

        {showEditCanvas && (
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
              onSaveScreenshotFile={(blob) => handleAttachBlobToDraft(blob)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  const activeStrategy =
    strategies.find((s) => s.id === selectedStrategyId) ?? strategies[0] ?? null;

  const checkedSet = new Set(
    activeStrategy ? checkedRuleIdsByStrategy[activeStrategy.id] ?? [] : [],
  );
  const evaluation = activeStrategy
    ? evaluateSetupChecklist(activeStrategy.checklist, checkedSet)
    : null;

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Playbook Selector & New Playbook Button */}
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Select Strategy Playbook"
          value={activeStrategy?.id ?? ''}
          onChange={(e) => setSelectedStrategyId(e.target.value)}
          disabled={strategies.length === 0}
          className="flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 disabled:opacity-50"
        >
          {strategies.length === 0 ? (
            <option value="">No playbooks yet</option>
          ) : (
            strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          onClick={() => {
            setDraft(createNewStrategyDraft(strategies.length));
            setShowEditCanvas(false);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {loading && strategies.length === 0 ? (
        <div className="py-4 text-center text-[10px] text-slate-500">Loading playbooks...</div>
      ) : !activeStrategy ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-[10px] text-slate-500">
          Create an ICT playbook with your A+ confluence rules to grade setups live.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Strategy Header + Live Grade Pill */}
          <div className="flex items-start justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/75 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-slate-100">{activeStrategy.name}</div>
              {activeStrategy.description && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {activeStrategy.description}
                </p>
              )}
              {activeStrategy.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {activeStrategy.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-400"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const nextDraft = toStrategyDraft(activeStrategy);
                  setDraft(nextDraft);
                  setShowEditCanvas(
                    nextDraft.canvasDoc.shapes.length > 0 ||
                    Boolean(nextDraft.canvasDoc.backgroundAttachmentPath),
                  );
                }}
                title="Edit playbook & checklist"
                className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <Edit3 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void deleteStrategy(activeStrategy.id)}
                title="Delete playbook"
                className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Interactive Live Execution Checklist + Grade */}
          {evaluation && (
            <div className="space-y-2 rounded-md border border-slate-800 bg-slate-950/80 p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-xs font-bold"
                    style={{
                      backgroundColor: `${gradeColor(evaluation.grade)}25`,
                      color: gradeColor(evaluation.grade),
                    }}
                  >
                    Grade {evaluation.grade}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {evaluation.totalMet}/{evaluation.total} ({evaluation.scorePercent}%)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => resetChecklistExecution(activeStrategy.id)}
                  title="Uncheck all conditions for next setup"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>

              <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${evaluation.scorePercent}%`,
                    backgroundColor: gradeColor(evaluation.grade),
                  }}
                />
              </div>

              <div className="space-y-1">
                {activeStrategy.checklist.map((rule) => {
                  const checked = checkedSet.has(rule.id);
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => toggleChecklistExecution(activeStrategy.id, rule.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left transition-colors ${checked
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-slate-100'
                          : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                        }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {checked ? (
                          <CheckSquare className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Square className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        )}
                        <span className="truncate text-[11px]">{rule.name}</span>
                      </div>
                      {rule.isRequired && (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-300">
                          REQ
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
