import type { FileCategory, FileEntry, FileTagColor, GroupBy, SortDir, SortField } from '../types';

export const FILE_TAGS: Record<FileTagColor, { label: string; color: string; glow: string }> = {
  red: { label: 'Important', color: '#f87171', glow: 'rgba(248, 113, 113, 0.35)' },
  orange: { label: 'Work', color: '#fb923c', glow: 'rgba(251, 146, 60, 0.35)' },
  yellow: { label: 'Review', color: '#facc15', glow: 'rgba(250, 204, 21, 0.35)' },
  green: { label: 'Done', color: '#4ade80', glow: 'rgba(74, 222, 128, 0.35)' },
  blue: { label: 'Personal', color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.35)' },
  purple: { label: 'Project', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.35)' },
};

export const FILE_TAG_ORDER: FileTagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export const CATEGORY_META: Record<
  FileCategory,
  { label: string; folderName: string; color: string }
> = {
  folder: { label: 'Folders', folderName: 'Folders', color: '#93b8dc' },
  image: { label: 'Images', folderName: 'Images', color: '#60a5fa' },
  document: { label: 'Docs & PDFs', folderName: 'Documents', color: '#a5b4fc' },
  archive: { label: 'Archives', folderName: 'Archives', color: '#c4b5fd' },
  installer: { label: 'Installers', folderName: 'Installers', color: '#67e8f9' },
  video: { label: 'Videos', folderName: 'Videos', color: '#818cf8' },
  audio: { label: 'Audio', folderName: 'Audio', color: '#5eead4' },
  code: { label: 'Code & Text', folderName: 'Code', color: '#7dd3fc' },
  other: { label: 'Other', folderName: 'Other', color: '#94a3b8' },
};

export const CATEGORY_ORDER: FileCategory[] = [
  'image',
  'document',
  'archive',
  'installer',
  'video',
  'audio',
  'code',
  'other',
];

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${sizes[i]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return '—';
  const date = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (ms >= startOfToday) return `Today, ${time}`;
  if (ms >= startOfYesterday) return `Yesterday, ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function getDateBucket(ms: number): string {
  if (!ms) return 'Unknown Date';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (ms >= startOfToday) return 'Today';
  if (ms >= startOfToday - day) return 'Yesterday';
  if (ms >= startOfToday - 7 * day) return 'Earlier This Week';
  if (ms >= startOfToday - 30 * day) return 'Earlier This Month';
  const d = new Date(ms);
  if (d.getFullYear() === now.getFullYear()) return 'Earlier This Year';
  return 'Older';
}

export function getPathBasename(p: string): string {
  if (p === 'velo://home') return 'Home';
  if (p === 'velo://this-pc') return 'This PC';
  if (p === 'velo://gallery') return 'Gallery';
  const cleaned = p.replace(/[\\/]+$/, '');
  if (!cleaned) return p;
  if (/^[A-Za-z]:$/.test(cleaned)) return `OS (${cleaned})`;
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function getParentPath(p: string): string | null {
  if (p.startsWith('velo://')) return null;
  const cleaned = p.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(cleaned)) return 'velo://this-pc';
  const idx = Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/'));
  if (idx < 0) return null;
  const parent = cleaned.slice(0, idx);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent || null;
}

export function getPathBreadcrumbs(p: string): { label: string; path: string }[] {
  if (p === 'velo://home') return [{ label: 'Home', path: 'velo://home' }];
  if (p === 'velo://this-pc') return [{ label: 'This PC', path: 'velo://this-pc' }];
  if (p === 'velo://gallery') return [{ label: 'Gallery', path: 'velo://gallery' }];

  const normalized = p.replace(/\//g, '\\').replace(/\\+$/, '');
  if (!normalized) return [];
  const parts = normalized.split('\\').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [
    { label: 'This PC', path: 'velo://this-pc' },
  ];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0 && /^[A-Za-z]:$/.test(part)) {
      acc = `${part}\\`;
      crumbs.push({ label: `OS (${part})`, path: acc });
    } else {
      acc = acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`;
      crumbs.push({ label: part, path: acc });
    }
  }
  return crumbs;
}

export function joinWinPath(base: string, child: string): string {
  if (base.endsWith('\\') || base.endsWith('/')) {
    return `${base}${child}`;
  }
  return `${base}\\${child}`;
}

export function isImagePreviewable(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(ext);
}

export function isVideoPreviewable(ext: string): boolean {
  return ['mp4', 'webm', 'mov', 'm4v', 'ogg'].includes(ext);
}

export function isAudioPreviewable(ext: string): boolean {
  return ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].includes(ext);
}

export function isPdfPreviewable(ext: string): boolean {
  return ext === 'pdf';
}

export function isZipInspectable(ext: string): boolean {
  return ['zip', 'jar', 'apk', 'whl', 'nupkg', 'vsix', 'crx'].includes(ext);
}

export function isOfficePreviewable(ext: string): boolean {
  return ['docx', 'xlsx', 'pptx', 'odt', 'epub', 'rtf'].includes(ext);
}

export function isExecutableInspectable(ext: string): boolean {
  return ['exe', 'dll', 'msi', 'lnk', 'scr', 'sys'].includes(ext);
}

export function isFontPreviewable(ext: string): boolean {
  return ['ttf', 'otf', 'woff', 'woff2'].includes(ext);
}

export function isMarkdownFile(ext: string): boolean {
  return ext === 'md' || ext === 'markdown';
}

export function isCsvFile(ext: string): boolean {
  return ext === 'csv' || ext === 'tsv';
}

export function isHtmlFile(ext: string): boolean {
  return ext === 'html' || ext === 'htm';
}

export function isTextPreviewable(ext: string, category: FileCategory): boolean {
  if (category === 'code') return true;
  return [
    'txt',
    'md',
    'markdown',
    'csv',
    'tsv',
    'log',
    'json',
    'jsonc',
    'xml',
    'yml',
    'yaml',
    'ini',
    'env',
    'cfg',
    'conf',
    'srt',
    'vtt',
    'reg',
    'inf',
    'nfo',
    'patch',
    'diff',
    'bat',
    'cmd',
    'ps1',
    'psm1',
    'vbs',
    'properties',
    'gitignore',
    'editorconfig',
    'dockerfile',
    'makefile',
    'cmake',
    'gradle',
    'prisma',
    'graphql',
    'proto',
    'tex',
    'bib',
  ].includes(ext);
}

export function sortEntries(
  entries: FileEntry[],
  sortField: SortField,
  sortDir: SortDir
): FileEntry[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    // Folders always first
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;

    let cmp = 0;
    switch (sortField) {
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'modified':
        cmp = a.modifiedMs - b.modifiedMs;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'type':
        cmp = (a.extension || a.category).localeCompare(b.extension || b.category);
        if (cmp === 0) {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        break;
    }
    return cmp * dir;
  });
}

export type DisplayRow =
  | { kind: 'group'; id: string; label: string; count: number }
  | { kind: 'entry'; entry: FileEntry };

export function buildDisplayRows(
  entries: FileEntry[],
  groupBy: GroupBy,
  collapsedGroups: Set<string>
): DisplayRow[] {
  if (groupBy === 'none') {
    return entries.map((entry) => ({ kind: 'entry', entry }));
  }

  const groups = new Map<string, FileEntry[]>();
  const bucketOrder: string[] =
    groupBy === 'date'
      ? ['Today', 'Yesterday', 'Earlier This Week', 'Earlier This Month', 'Earlier This Year', 'Older', 'Unknown Date']
      : ['Folders', ...CATEGORY_ORDER.map((c) => CATEGORY_META[c].label)];

  for (const entry of entries) {
    const key =
      groupBy === 'date'
        ? getDateBucket(entry.modifiedMs)
        : CATEGORY_META[entry.category]?.label || 'Other';
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const rows: DisplayRow[] = [];
  for (const key of bucketOrder) {
    const list = groups.get(key);
    if (!list || list.length === 0) continue;
    rows.push({ kind: 'group', id: key, label: key, count: list.length });
    if (!collapsedGroups.has(key)) {
      for (const entry of list) {
        rows.push({ kind: 'entry', entry });
      }
    }
  }
  return rows;
}
