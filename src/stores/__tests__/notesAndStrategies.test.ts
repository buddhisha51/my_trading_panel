import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_TIPTAP_DOC } from '../../types/canvas';
import { useNotesStore } from '../notesStore';
import { useStrategiesStore } from '../strategiesStore';

describe('notesStore & strategiesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotesStore.setState({
      notes: [],
      loading: false,
      saving: false,
      filters: { query: '', pair: null, session: null },
      attachmentsByNoteId: {},
    });
    useStrategiesStore.setState({
      strategies: [],
      loading: false,
      saving: false,
      checkedRuleIdsByStrategy: {},
      attachmentsByStrategyId: {},
    });
  });

  it('saves, filters by FTS tokens/pair/session, attaches screenshot path, and deletes notes', async () => {
    const saved = await useNotesStore.getState().saveNote({
      id: 'nt_test_1',
      title: 'EURUSD London Sweep',
      bodyJson: EMPTY_TIPTAP_DOC,
      bodyText: 'Bearish OB + FVG reaction below Asian high',
      canvasJson: null,
      tags: ['ob', 'fvg'],
      pair: 'eurusd',
      session: 'London Open',
      isPinned: false,
    });

    expect(saved.pair).toBe('EURUSD');
    expect(useNotesStore.getState().notes).toHaveLength(1);

    const att = await useNotesStore
      .getState()
      .attachFileToNote(
        {
          id: 'nt_test_1',
          title: saved.title,
          bodyJson: saved.bodyJson,
          bodyText: saved.bodyText,
          canvasJson: null,
          tags: saved.tags,
          pair: saved.pair,
          session: saved.session,
          isPinned: saved.isPinned,
        },
        [137, 80, 78, 71],
        'image/png',
        800,
        500,
      );
    expect(att.relativePath).toMatch(/^notes\/nt_test_1\/.+\.png$/);

    await useNotesStore.getState().setFilters({ query: 'asian fvg', pair: 'EURUSD' });
    expect(useNotesStore.getState().notes).toHaveLength(1);

    await useNotesStore.getState().setFilters({ query: 'nas100_nonexistent' });
    expect(useNotesStore.getState().notes).toHaveLength(0);

    await useNotesStore.getState().deleteNote('nt_test_1');
    await useNotesStore.getState().setFilters({ query: '', pair: null, session: null });
    expect(useNotesStore.getState().notes).toHaveLength(0);
  });

  it('persists strategies with checklist rules and tracks execution checks cleanly', async () => {
    const strat = await useStrategiesStore.getState().saveStrategy({
      name: 'ICT 2022 Model',
      description: 'Sweep + MSS + FVG',
      bodyJson: EMPTY_TIPTAP_DOC,
      canvasJson: null,
      tags: ['ny-am'],
      isActive: true,
      sortOrder: 0,
      checklist: [
        { name: 'Sweep liquidity', description: null, sortOrder: 0, isRequired: true },
        { name: 'MSS displacement', description: null, sortOrder: 1, isRequired: true },
      ],
    });

    expect(strat.checklist).toHaveLength(2);
    const rule1 = strat.checklist[0].id;
    useStrategiesStore.getState().toggleChecklistExecution(strat.id, rule1);
    expect(useStrategiesStore.getState().checkedRuleIdsByStrategy[strat.id]).toEqual([rule1]);

    useStrategiesStore.getState().resetChecklistExecution(strat.id);
    expect(useStrategiesStore.getState().checkedRuleIdsByStrategy[strat.id]).toEqual([]);
  });
});
