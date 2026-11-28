export interface NoteItem {
  id: string;
  title: string;
  bodyJson: string;
  bodyText: string;
  canvasJson: string | null;
  tags: string[];
  pair: string | null;
  session: string | null;
  isPinned: boolean;
  tradeId?: string | null;
  ongoingTradeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotePayload {
  id?: string;
  title: string;
  bodyJson: string;
  bodyText: string;
  canvasJson: string | null;
  tags: string[];
  pair: string | null;
  session: string | null;
  isPinned: boolean;
  tradeId?: string | null;
  ongoingTradeId?: string | null;
}

export interface ChecklistRule {
  id: string;
  strategyId?: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  createdAt?: string;
}

export interface StrategyItem {
  id: string;
  name: string;
  description: string | null;
  bodyJson: string;
  canvasJson: string | null;
  tags: string[];
  isActive: boolean;
  sortOrder: number;
  checklist: ChecklistRule[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistRuleInput {
  id?: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
}

export interface UpsertStrategyPayload {
  id?: string;
  name: string;
  description: string | null;
  bodyJson: string;
  canvasJson: string | null;
  tags: string[];
  isActive: boolean;
  sortOrder: number;
  checklist: ChecklistRuleInput[];
}

export type AttachmentOwnerType = 'notes' | 'strategies';

export interface AttachmentItem {
  id: string;
  ownerId: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: string;
}

export interface SaveAttachmentPayload {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  bytes: number[];
  mimeType: string;
  width?: number | null;
  height?: number | null;
}
