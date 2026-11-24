export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'installer'
  | 'code'
  | 'other';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isHidden: boolean;
  isSymlink: boolean;
  size: number;
  modifiedMs: number;
  createdMs: number;
  extension: string;
  category: FileCategory;
}

export interface DriveInfo {
  name: string;
  mountPoint: string;
  totalSpace: number;
  availableSpace: number;
  isRemovable: boolean;
}

export interface QuickAccessItem {
  name: string;
  path: string;
  icon: string;
}

export interface TextPreview {
  content: string;
  truncated: boolean;
  totalSize: number;
  lineCount: number;
}

export interface ZipEntryInfo {
  name: string;
  size: number;
  compressedSize: number;
  isDir: boolean;
}

export interface FolderSummary {
  fileCount: number;
  dirCount: number;
  immediateSize: number;
  sampleItems: string[];
}

export interface BatchMoveItem {
  from: string;
  to: string;
}

export interface IconRequest {
  path: string;
  extension: string;
  isDir: boolean;
}

export interface OfficeParagraph {
  text: string;
  heading: boolean;
}

export interface OfficeSheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

export interface OfficeSlide {
  number: number;
  lines: string[];
}

export interface OfficePreview {
  kind: 'document' | 'spreadsheet' | 'presentation';
  title?: string | null;
  paragraphs: OfficeParagraph[];
  sheets: OfficeSheet[];
  slides: OfficeSlide[];
}

export interface ExecutableInfo {
  architecture: string;
  subsystem: string;
  fileDescription?: string | null;
  productName?: string | null;
  companyName?: string | null;
  fileVersion?: string | null;
  copyright?: string | null;
  shortcutTarget?: string | null;
}

export type FileTagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export type UiStyle = 'folio' | 'classic-explorer';

export interface UserSettings {
  uiStyle: UiStyle;
  glassOpacity: number; // 0.08 to 0.72
  showExtensions: boolean;
  doubleClickEmptyGoesBack: boolean;
  showHoverActions: boolean;
}

export type ViewMode = 'details' | 'compact' | 'medium' | 'large' | 'xlarge';
export type SortField = 'name' | 'modified' | 'size' | 'type';
export type SortDir = 'asc' | 'desc';
export type GroupBy = 'none' | 'date' | 'type';
export type WindowEffect = 'acrylic' | 'mica' | 'tabbed' | 'solid';
export type NavDirection = 'in' | 'out' | 'jump';

export interface TabState {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  navDirection: NavDirection;
  navVersion: number;
  filter: string;
  categoryFilter: FileCategory | 'all';
  recursiveSearch: boolean;
  viewMode: ViewMode;
  sortField: SortField;
  sortDir: SortDir;
  groupBy: GroupBy;
}

export interface ClipboardState {
  mode: 'copy' | 'cut';
  paths: string[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
  paneId: 'primary' | 'secondary';
}
