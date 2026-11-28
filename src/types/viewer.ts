import type { CanvasToolSettings } from './canvas';
import type { AttachmentItem, NoteItem, StrategyItem } from './notes';
import type { TimeFormat } from './settings';

export interface ViewerSiblingItem {
  id: string;
  title: string;
}

export type FloatingViewerPayload =
  | {
      kind: 'note';
      note: NoteItem;
      attachments: AttachmentItem[];
      canvasTools: CanvasToolSettings;
      displayTimezone: string;
      timeFormat: TimeFormat;
      siblings?: ViewerSiblingItem[];
      currentIndex?: number;
    }
  | {
      kind: 'strategy';
      strategy: StrategyItem;
      attachments: AttachmentItem[];
      checkedRuleIds: string[];
      canvasTools: CanvasToolSettings;
      displayTimezone: string;
      timeFormat: TimeFormat;
      siblings?: ViewerSiblingItem[];
      currentIndex?: number;
    };

export interface ViewerEditRequest {
  kind: 'note' | 'strategy';
  id: string;
  nonce: number;
}
