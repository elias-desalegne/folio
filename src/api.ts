import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type {
  BatchMoveItem,
  DriveInfo,
  ExecutableInfo,
  FileEntry,
  FolderSummary,
  IconRequest,
  OfficePreview,
  QuickAccessItem,
  TextPreview,
  WindowEffect,
  ZipEntryInfo,
} from './types';

export const api = {
  listDirectory: (path: string, showHidden: boolean) =>
    invoke<FileEntry[]>('list_directory', { path, showHidden }),

  getDrives: () => invoke<DriveInfo[]>('get_drives'),

  getQuickAccess: () => invoke<QuickAccessItem[]>('get_quick_access'),

  getStartupPath: () => invoke<string | null>('get_startup_path'),

  isDefaultFileManager: () => invoke<boolean>('is_default_file_manager'),

  setDefaultFileManager: (enable: boolean) =>
    invoke<boolean>('set_default_file_manager', { enable }),

  searchRecursive: (root: string, query: string, maxResults = 300) =>
    invoke<FileEntry[]>('search_recursive', { root, query, maxResults }),

  readTextPreview: (path: string, maxBytes = 131072) =>
    invoke<TextPreview>('read_text_preview', { path, maxBytes }),

  inspectZip: (path: string) => invoke<ZipEntryInfo[]>('inspect_zip', { path }),

  extractZip: (path: string) => invoke<string>('extract_zip', { path }),

  getFolderSummary: (path: string) => invoke<FolderSummary>('get_folder_summary', { path }),

  openFile: (path: string) => invoke<void>('open_file', { path }),

  openWithDialog: (path: string) => invoke<void>('open_with_dialog', { path }),

  revealInExplorer: (path: string) => invoke<void>('reveal_in_explorer', { path }),

  openInTerminal: (path: string) => invoke<void>('open_in_terminal', { path }),

  createFolder: (parent: string, name: string) =>
    invoke<string>('create_folder', { parent, name }),

  createFile: (parent: string, name: string) =>
    invoke<string>('create_file', { parent, name }),

  renameEntry: (oldPath: string, newName: string) =>
    invoke<string>('rename_entry', { oldPath, newName }),

  deleteEntries: (paths: string[], permanent: boolean) =>
    invoke<void>('delete_entries', { paths, permanent }),

  copyEntries: (sources: string[], destDir: string) =>
    invoke<string[]>('copy_entries', { sources, destDir }),

  moveEntries: (sources: string[], destDir: string) =>
    invoke<string[]>('move_entries', { sources, destDir }),

  batchMove: (moves: BatchMoveItem[]) => invoke<BatchMoveItem[]>('batch_move', { moves }),

  watchDirectory: (path: string) => invoke<void>('watch_directory', { path }),

  openSpecialFolder: (target: 'recycle-bin' | 'network') =>
    invoke<void>('open_special_folder', { target }),

  showNativeProperties: (path: string) => invoke<void>('show_native_properties', { path }),

  listGalleryImages: (maxResults = 400) =>
    invoke<FileEntry[]>('list_gallery_images', { maxResults }),

  calculateFolderSize: (path: string) =>
    invoke<number>('calculate_folder_size', { path }),

  compressToZip: (paths: string[], destDir: string, zipName: string) =>
    invoke<string>('compress_to_zip', { paths, destDir, zipName }),

  setWindowEffect: (effect: WindowEffect) => invoke<void>('set_window_effect', { effect }),

  getFileIcons: (requests: IconRequest[]) =>
    invoke<Record<string, string>>('get_file_icons', { requests }),

  inspectOfficeDocument: (path: string) =>
    invoke<OfficePreview>('inspect_office_document', { path }),

  inspectExecutable: (path: string) =>
    invoke<ExecutableInfo>('inspect_executable', { path }),

  listSubfolders: (path: string) => invoke<string[]>('list_subfolders', { path }),

  toAssetUrl: (path: string) => convertFileSrc(path),
};
