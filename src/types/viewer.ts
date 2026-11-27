import type { CanvasToolSettings } from './canvas';
import type { AttachmentItem, NoteItem, StrategyItem } from './notes';
import type { TimeFormat } from './settings';

export type FloatingViewerPayload =
  | {
      kind: 'note';
      note: NoteItem;
      attachments: AttachmentItem[];
      canvasTools: CanvasToolSettings;
      displayTimezone: string;
      timeFormat: TimeFormat;
    }
  | {
      kind: 'strategy';
      strategy: StrategyItem;
      attachments: AttachmentItem[];
      checkedRuleIds: string[];
      canvasTools: CanvasToolSettings;
      displayTimezone: string;
      timeFormat: TimeFormat;
    };

export interface ViewerEditRequest {
  kind: 'note' | 'strategy';
  id: string;
  nonce: number;
}
