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

export interface AutoBackupEntry {
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AutoBackupRunResult {
  created: boolean;
  skippedUnchanged: boolean;
  entry: AutoBackupEntry | null;
  prunedCount: number;
}

export interface ReleaseCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  installerUrl: string | null;
  checksumsUrl: string | null;
  releaseNotes: string;
  publishedAt: string | null;
  checkedAt: string;
  fromCache: boolean;
}
