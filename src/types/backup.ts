export interface BackupManifest {
  appIdentifier: string;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  tableCounts: Record<string, number>;
  attachmentCount: number;
}

export interface BackupExportResponse {
  filePath: string;
  filename: string;
  bytes: number[];
  manifest: BackupManifest;
}

export interface BackupImportSummary {
  mode: 'merge' | 'replace';
  tablesRestored: number;
  rowsRestored: number;
  attachmentsRestored: number;
}

export type BackupRestoreMode = 'merge' | 'replace';
