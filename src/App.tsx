import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Copy, Edit3, FolderArchive, Scissors, Trash2, X } from 'lucide-react';
import type {
  BatchMoveItem,
  ClipboardState,
  ContextMenuState,
  DriveInfo,
  FileCategory,
  FileEntry,
  FileTagColor,
  GroupBy,
  NavDirection,
  QuickAccessItem,
  SortDir,
  SortField,
  TabState,
  UserSettings,
  ViewMode,
  WindowEffect,
} from './types';
import { api } from './api';
import { getParentPath, sortEntries } from './utils/format';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { CommandBar } from './components/CommandBar';
import { CategoryBar } from './components/CategoryBar';
import { FilePane } from './components/FilePane';
import { SpecialViews } from './components/SpecialViews';
import { PreviewPane } from './components/PreviewPane';
import { QuickLookModal } from './components/QuickLookModal';
import { TidyModal } from './components/TidyModal';
import { BatchRenameModal } from './components/BatchRenameModal';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenu } from './components/ContextMenu';
import { StatusBar } from './components/StatusBar';
import { SettingsPopover } from './components/SettingsPopover';

const PINNED_STORAGE_KEY = 'velo.pinnedPaths.v1';
const EFFECT_STORAGE_KEY = 'velo.windowEffect.v1';
const TAGS_STORAGE_KEY = 'velo.fileTags.v1';
const RECENT_STORAGE_KEY = 'velo.recentPaths.v1';
const SETTINGS_STORAGE_KEY = 'velo.userSettings.v1';

const DEFAULT_SETTINGS: UserSettings = {
  uiStyle: 'folio',
  glassOpacity: 0.15,
  showExtensions: true,
  doubleClickEmptyGoesBack: true,
  showHoverActions: true,
};

function createTab(path: string): TabState {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    path,
    history: [path],
    historyIndex: 0,
    navDirection: 'jump',
    navVersion: 0,
    filter: '',
    categoryFilter: 'all',
    recursiveSearch: false,
    viewMode: 'details',
    sortField: 'modified',
    sortDir: 'desc',
    groupBy: 'none',
  };
}

function isVirtualPath(p: string): boolean {
  return p.startsWith('velo://');
}

export const App: React.FC = () => {
  const [quickAccess, setQuickAccess] = useState<QuickAccessItem[]>([]);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [windowEffect, setWindowEffect] = useState<WindowEffect>(() => {
    return (localStorage.getItem(EFFECT_STORAGE_KEY) as WindowEffect) || 'acrylic';
  });
  const [fileTags, setFileTags] = useState<Record<string, FileTagColor>>(() => {
    try {
      return JSON.parse(localStorage.getItem(TAGS_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [recentPaths, setRecentPaths] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}'),
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appReady, setAppReady] = useState(false);

  const [tabs, setTabs] = useState<TabState[]>(() => [createTab('')]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [secondaryTab, setSecondaryTab] = useState<TabState>(() => createTab(''));
  const [splitPane, setSplitPane] = useState(false);
  const [activePane, setActivePane] = useState<'primary' | 'secondary'>('primary');
  const [previewPane, setPreviewPane] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const [primaryEntries, setPrimaryEntries] = useState<FileEntry[]>([]);
  const [primaryLoading, setPrimaryLoading] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [primarySelected, setPrimarySelected] = useState<Set<string>>(new Set());

  const [secondaryEntries, setSecondaryEntries] = useState<FileEntry[]>([]);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [secondarySelected, setSecondarySelected] = useState<Set<string>>(new Set());

  // Instant in-memory directory cache for 0ms Back/Forward/revisit
  const dirCacheRef = useRef<Map<string, FileEntry[]>>(new Map());
  const typeAheadRef = useRef<{ buffer: string; timer: number | null }>({
    buffer: '',
    timer: null,
  });

  // Render-synced animation state: only bumps when the new folder's entries are actually ready (ZERO 1st-visit flicker!)
  const [primaryAnim, setPrimaryAnim] = useState<{ dir: NavDirection; key: number }>({
    dir: 'jump',
    key: 0,
  });
  const [secondaryAnim, setSecondaryAnim] = useState<{ dir: NavDirection; key: number }>({
    dir: 'jump',
    key: 0,
  });
  const lastRenderedPathRef = useRef<{ primary: string; secondary: string }>({
    primary: '',
    secondary: '',
  });
  const loadSeqRef = useRef<{ primary: number; secondary: number }>({
    primary: 0,
    secondary: 0,
  });

  const [folderSizes, setFolderSizes] = useState<Record<string, number>>({});
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<BatchMoveItem[][]>([]);

  const [searching, setSearching] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [quickLookEntry, setQuickLookEntry] = useState<FileEntry | null>(null);
  const [tidyOpen, setTidyOpen] = useState(false);
  const [lastTidyUndo, setLastTidyUndo] = useState<BatchMoveItem[] | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pathInputTrigger, setPathInputTrigger] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const primaryTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const currentTab = activePane === 'primary' ? primaryTab : secondaryTab;

  const updateTab = useCallback(
    (pane: 'primary' | 'secondary', updater: (t: TabState) => TabState) => {
      if (pane === 'primary') {
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? updater(t) : t)));
      } else {
        setSecondaryTab((prev) => updater(prev));
      }
    },
    [activeTabId]
  );

  // Initial load: quick access, drives, startup CLI path (or Downloads)
  useEffect(() => {
    api.setWindowEffect(windowEffect).catch(() => {});
    Promise.all([api.getQuickAccess(), api.getDrives(), api.getStartupPath().catch(() => null)])
      .then(([qa, dr, startupPath]) => {
        setQuickAccess(qa);
        setDrives(dr);
        const downloads = qa.find((q) => q.name === 'Downloads');
        const desktop = qa.find((q) => q.name === 'Desktop');
        const startPath = startupPath || downloads?.path || desktop?.path || 'velo://home';
        const secondPath = desktop?.path || 'velo://this-pc';
        const firstTab = createTab(startPath);
        setTabs([firstTab]);
        setActiveTabId(firstTab.id);
        setSecondaryTab(createTab(secondPath));
        requestAnimationFrame(() => setAppReady(true));
      })
      .catch(() => {
        const fallback = createTab('C:\\');
        setTabs([fallback]);
        setActiveTabId(fallback.id);
        setSecondaryTab(createTab('C:\\'));
        setAppReady(true);
      });
  }, []);

  // Single-instance listener: opening a folder from Windows opens it as a new tab (or focuses existing tab)
  useEffect(() => {
    const unlisten = listen<string>('open-path', (event) => {
      const incoming = event.payload;
      if (!incoming) return;
      setTabs((prev) => {
        const existing = prev.find((t) => t.path.toLowerCase() === incoming.toLowerCase());
        if (existing) {
          setActiveTabId(existing.id);
          setActivePane('primary');
          return prev;
        }
        const nt = createTab(incoming);
        setActiveTabId(nt.id);
        setActivePane('primary');
        return [...prev, nt];
      });
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Load directory or recursive search for a pane
  const loadPane = useCallback(
    async (pane: 'primary' | 'secondary', tab: TabState, hidden: boolean) => {
      if (!tab.path) return;
      const setEntries = pane === 'primary' ? setPrimaryEntries : setSecondaryEntries;
      const setLoading = pane === 'primary' ? setPrimaryLoading : setSecondaryLoading;
      const setError = pane === 'primary' ? setPrimaryError : setSecondaryError;
      const setAnim = pane === 'primary' ? setPrimaryAnim : setSecondaryAnim;

      const seq = ++loadSeqRef.current[pane];
      const pathChanged =
        lastRenderedPathRef.current[pane].toLowerCase() !== tab.path.toLowerCase();

      const commitAnimIfPathChanged = () => {
        if (pathChanged) {
          lastRenderedPathRef.current[pane] = tab.path;
          setAnim((prev) => ({ dir: tab.navDirection, key: prev.key + 1 }));
        }
      };

      if (isVirtualPath(tab.path)) {
        setEntries([]);
        setLoading(false);
        setError(null);
        commitAnimIfPathChanged();
        return;
      }

      if (tab.recursiveSearch && tab.filter.trim().length > 0) {
        setLoading(true);
        setSearching(true);
        setError(null);
        try {
          const res = await api.searchRecursive(tab.path, tab.filter.trim(), 300);
          if (loadSeqRef.current[pane] !== seq) return;
          setEntries(res);
        } catch (e) {
          if (loadSeqRef.current[pane] !== seq) return;
          setError(String(e));
        } finally {
          if (loadSeqRef.current[pane] === seq) {
            setLoading(false);
            setSearching(false);
          }
        }
        return;
      }

      const cacheKey = `${tab.path.toLowerCase()}|${hidden ? '1' : '0'}`;
      const cached = dirCacheRef.current.get(cacheKey);
      if (cached) {
        setEntries(cached);
        setLoading(false);
        commitAnimIfPathChanged();
      } else {
        // Keep current folder visible for the few milliseconds Rust reads the new folder,
        // then swap entries + trigger glide animation together in one atomic render (zero flicker!)
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.listDirectory(tab.path, hidden);
        if (loadSeqRef.current[pane] !== seq) return;
        dirCacheRef.current.set(cacheKey, res);
        setEntries(res);
        if (!cached) {
          commitAnimIfPathChanged();
        }
      } catch (e) {
        if (loadSeqRef.current[pane] !== seq) return;
        setError(String(e));
        if (!cached) {
          setEntries([]);
          commitAnimIfPathChanged();
        }
      } finally {
        if (loadSeqRef.current[pane] === seq) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Trigger primary pane load
  useEffect(() => {
    const delay = primaryTab.recursiveSearch && primaryTab.filter ? 220 : 0;
    const timer = window.setTimeout(() => {
      loadPane('primary', primaryTab, showHidden);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    primaryTab.path,
    primaryTab.recursiveSearch,
    primaryTab.recursiveSearch ? primaryTab.filter : '',
    showHidden,
    loadPane,
  ]);

  // Trigger secondary pane load
  useEffect(() => {
    if (!splitPane) return;
    const delay = secondaryTab.recursiveSearch && secondaryTab.filter ? 220 : 0;
    const timer = window.setTimeout(() => {
      loadPane('secondary', secondaryTab, showHidden);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    splitPane,
    secondaryTab.path,
    secondaryTab.recursiveSearch,
    secondaryTab.recursiveSearch ? secondaryTab.filter : '',
    showHidden,
    loadPane,
  ]);

  // Track recent real folders
  useEffect(() => {
    if (!currentTab.path || isVirtualPath(currentTab.path)) return;
    setRecentPaths((prev) => {
      const lower = currentTab.path.toLowerCase();
      const filtered = prev.filter((p) => p.toLowerCase() !== lower);
      const next = [currentTab.path, ...filtered].slice(0, 8);
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [currentTab.path]);

  // Watch active folder for live filesystem updates
  useEffect(() => {
    if (currentTab.path && !isVirtualPath(currentTab.path)) {
      api.watchDirectory(currentTab.path).catch(() => {});
    }
  }, [currentTab.path]);

  useEffect(() => {
    const unlisten = listen<string>('fs-changed', (event) => {
      const changedPath = event.payload;
      if (changedPath === primaryTab.path && !primaryTab.recursiveSearch) {
        loadPane('primary', primaryTab, showHidden);
      }
      if (splitPane && changedPath === secondaryTab.path && !secondaryTab.recursiveSearch) {
        loadPane('secondary', secondaryTab, showHidden);
      }
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [primaryTab, secondaryTab, splitPane, showHidden, loadPane]);

  const refreshActive = useCallback(() => {
    loadPane('primary', primaryTab, showHidden);
    if (splitPane) loadPane('secondary', secondaryTab, showHidden);
    api.getDrives().then(setDrives).catch(() => {});
  }, [primaryTab, secondaryTab, splitPane, showHidden, loadPane]);

  const navigateTo = useCallback(
    (
      destPath: string,
      pane: 'primary' | 'secondary' = activePane,
      direction: NavDirection = 'jump'
    ) => {
      updateTab(pane, (t) => {
        if (t.path.toLowerCase() === destPath.toLowerCase()) return t;
        const sliced = t.history.slice(0, t.historyIndex + 1);
        sliced.push(destPath);
        return {
          ...t,
          path: destPath,
          history: sliced,
          historyIndex: sliced.length - 1,
          navDirection: direction,
          navVersion: t.navVersion + 1,
          filter: '',
          categoryFilter: 'all',
          recursiveSearch: false,
        };
      });
      if (pane === 'primary') setPrimarySelected(new Set());
      else setSecondarySelected(new Set());
      setRenamingPath(null);
    },
    [activePane, updateTab]
  );

  const goBack = useCallback(
    (pane: 'primary' | 'secondary' = activePane) => {
      updateTab(pane, (t) => {
        if (t.historyIndex <= 0) return t;
        const nextIdx = t.historyIndex - 1;
        return {
          ...t,
          path: t.history[nextIdx],
          historyIndex: nextIdx,
          navDirection: 'out',
          navVersion: t.navVersion + 1,
          filter: '',
          categoryFilter: 'all',
          recursiveSearch: false,
        };
      });
      if (pane === 'primary') setPrimarySelected(new Set());
      else setSecondarySelected(new Set());
    },
    [activePane, updateTab]
  );

  const goForward = useCallback(
    (pane: 'primary' | 'secondary' = activePane) => {
      updateTab(pane, (t) => {
        if (t.historyIndex >= t.history.length - 1) return t;
        const nextIdx = t.historyIndex + 1;
        return {
          ...t,
          path: t.history[nextIdx],
          historyIndex: nextIdx,
          navDirection: 'in',
          navVersion: t.navVersion + 1,
          filter: '',
          categoryFilter: 'all',
          recursiveSearch: false,
        };
      });
      if (pane === 'primary') setPrimarySelected(new Set());
      else setSecondarySelected(new Set());
    },
    [activePane, updateTab]
  );

  const goUp = useCallback(
    (pane: 'primary' | 'secondary' = activePane) => {
      const targetTab = pane === 'primary' ? primaryTab : secondaryTab;
      const parent = getParentPath(targetTab.path);
      if (parent) navigateTo(parent, pane, 'out');
    },
    [activePane, primaryTab, secondaryTab, navigateTo]
  );

  const handleDoubleClickEmpty = useCallback(
    (pane: 'primary' | 'secondary') => {
      if (!userSettings.doubleClickEmptyGoesBack) return;
      const targetTab = pane === 'primary' ? primaryTab : secondaryTab;
      if (targetTab.historyIndex > 0) {
        goBack(pane);
      } else {
        goUp(pane);
      }
    },
    [userSettings.doubleClickEmptyGoesBack, primaryTab, secondaryTab, goBack, goUp]
  );

  // Filter & sort entries
  const filterAndSort = useCallback(
    (entries: FileEntry[], tab: TabState) => {
      let list = entries;
      if (userSettings.uiStyle !== 'classic-explorer' && tab.categoryFilter !== 'all') {
        list = list.filter((e) => e.category === tab.categoryFilter);
      }
      if (!tab.recursiveSearch && tab.filter.trim()) {
        const q = tab.filter.trim().toLowerCase();
        list = list.filter((e) => e.name.toLowerCase().includes(q));
      }
      return sortEntries(list, tab.sortField, tab.sortDir);
    },
    [userSettings.uiStyle]
  );

  const visiblePrimary = useMemo(
    () => filterAndSort(primaryEntries, primaryTab),
    [primaryEntries, primaryTab, filterAndSort]
  );

  const visibleSecondary = useMemo(
    () => filterAndSort(secondaryEntries, secondaryTab),
    [secondaryEntries, secondaryTab, filterAndSort]
  );

  const activeEntries = activePane === 'primary' ? primaryEntries : secondaryEntries;
  const activeVisible = activePane === 'primary' ? visiblePrimary : visibleSecondary;
  const activeSelected = activePane === 'primary' ? primarySelected : secondarySelected;
  const setActiveSelected = activePane === 'primary' ? setPrimarySelected : setSecondarySelected;

  const selectedEntryObjects = useMemo(() => {
    return activeVisible.filter((e) => activeSelected.has(e.path));
  }, [activeVisible, activeSelected]);

  const primarySelectedEntry = selectedEntryObjects[0] || null;
  const selectedTotalSize = useMemo(
    () => selectedEntryObjects.reduce((acc, e) => acc + (e.isDir ? 0 : e.size), 0),
    [selectedEntryObjects]
  );

  const cutPathsSet = useMemo(
    () => new Set(clipboard?.mode === 'cut' ? clipboard.paths : []),
    [clipboard]
  );

  // Actions
  const handleOpenEntry = useCallback(
    (entry: FileEntry, pane: 'primary' | 'secondary' = activePane) => {
      if (entry.isDir) {
        navigateTo(entry.path, pane, 'in');
      } else {
        api.openFile(entry.path).catch((e) => showToast(String(e)));
      }
    },
    [activePane, navigateTo, showToast]
  );

  const handleCreateFolder = useCallback(async () => {
    if (isVirtualPath(currentTab.path)) return;
    try {
      const created = await api.createFolder(currentTab.path, 'New folder');
      await loadPane(activePane, currentTab, showHidden);
      setActiveSelected(new Set([created]));
      setRenamingPath(created);
    } catch (e) {
      showToast(String(e));
    }
  }, [currentTab, activePane, showHidden, loadPane, setActiveSelected, showToast]);

  const handleCreateTextFile = useCallback(async () => {
    if (isVirtualPath(currentTab.path)) return;
    try {
      const created = await api.createFile(currentTab.path, 'New Text Document.txt');
      await loadPane(activePane, currentTab, showHidden);
      setActiveSelected(new Set([created]));
      setRenamingPath(created);
    } catch (e) {
      showToast(String(e));
    }
  }, [currentTab, activePane, showHidden, loadPane, setActiveSelected, showToast]);

  const handleRenameCommit = useCallback(
    async (oldPath: string, newName: string) => {
      setRenamingPath(null);
      if (!newName.trim()) return;
      try {
        const renamed = await api.renameEntry(oldPath, newName.trim());
        if (renamed !== oldPath) {
          setUndoStack((prev) => [...prev.slice(-19), [{ from: renamed, to: oldPath }]]);
        }
        refreshActive();
        setActiveSelected(new Set([renamed]));
      } catch (e) {
        showToast(String(e));
      }
    },
    [refreshActive, setActiveSelected, showToast]
  );

  const handleBatchRenameApply = useCallback(
    async (renames: { oldPath: string; newName: string }[]) => {
      const undoItems: BatchMoveItem[] = [];
      for (const r of renames) {
        try {
          const renamed = await api.renameEntry(r.oldPath, r.newName);
          if (renamed !== r.oldPath) {
            undoItems.push({ from: renamed, to: r.oldPath });
          }
        } catch (e) {
          showToast(String(e));
        }
      }
      if (undoItems.length > 0) {
        setUndoStack((prev) => [...prev.slice(-19), undoItems]);
        showToast(`Renamed ${undoItems.length} items (Ctrl+Z to undo)`);
      }
      refreshActive();
    },
    [refreshActive, showToast]
  );

  const handleDuplicate = useCallback(async () => {
    if (activeSelected.size === 0 || isVirtualPath(currentTab.path)) return;
    try {
      const created = await api.copyEntries(Array.from(activeSelected), currentTab.path);
      refreshActive();
      setActiveSelected(new Set(created));
      showToast(`Duplicated ${created.length} item${created.length === 1 ? '' : 's'}`);
    } catch (e) {
      showToast(String(e));
    }
  }, [activeSelected, currentTab.path, refreshActive, setActiveSelected, showToast]);

  const handleCompressZip = useCallback(async () => {
    if (activeSelected.size === 0 || isVirtualPath(currentTab.path)) return;
    const paths = Array.from(activeSelected);
    const first = selectedEntryObjects[0];
    const base =
      paths.length === 1 && first
        ? first.name.replace(/\.[^/.]+$/, '')
        : 'Archive';
    try {
      showToast('Compressing to ZIP...');
      const created = await api.compressToZip(paths, currentTab.path, base);
      refreshActive();
      setActiveSelected(new Set([created]));
      showToast(`Created ${created.split(/[\\/]/).pop()}`);
    } catch (e) {
      showToast(String(e));
    }
  }, [activeSelected, currentTab.path, selectedEntryObjects, refreshActive, setActiveSelected, showToast]);

  const handleCalcFolderSize = useCallback(
    async (entry: FileEntry) => {
      if (!entry.isDir) return;
      showToast(`Calculating size of ${entry.name}...`);
      try {
        const size = await api.calculateFolderSize(entry.path);
        setFolderSizes((prev) => ({ ...prev, [entry.path]: size }));
      } catch (e) {
        showToast(String(e));
      }
    },
    [showToast]
  );

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await api.batchMove(last);
      setUndoStack((prev) => prev.slice(0, -1));
      refreshActive();
      showToast(`Undid last action (${last.length} item${last.length === 1 ? '' : 's'})`);
    } catch (e) {
      showToast(String(e));
    }
  }, [undoStack, refreshActive, showToast]);

  const handleCopy = useCallback(() => {
    if (activeSelected.size === 0) return;
    const paths = Array.from(activeSelected);
    setClipboard({ mode: 'copy', paths });
    showToast(`Copied ${paths.length} item${paths.length === 1 ? '' : 's'}`);
  }, [activeSelected, showToast]);

  const handleCut = useCallback(() => {
    if (activeSelected.size === 0) return;
    const paths = Array.from(activeSelected);
    setClipboard({ mode: 'cut', paths });
    showToast(`Cut ${paths.length} item${paths.length === 1 ? '' : 's'}`);
  }, [activeSelected, showToast]);

  const handlePaste = useCallback(async () => {
    if (!clipboard || clipboard.paths.length === 0 || isVirtualPath(currentTab.path)) return;
    try {
      if (clipboard.mode === 'copy') {
        await api.copyEntries(clipboard.paths, currentTab.path);
        showToast(`Pasted ${clipboard.paths.length} item(s)`);
      } else {
        await api.moveEntries(clipboard.paths, currentTab.path);
        setClipboard(null);
        showToast(`Moved ${clipboard.paths.length} item(s)`);
      }
      refreshActive();
    } catch (e) {
      showToast(String(e));
    }
  }, [clipboard, currentTab.path, refreshActive, showToast]);

  const handleDelete = useCallback(
    async (permanent: boolean) => {
      if (activeSelected.size === 0) return;
      const paths = Array.from(activeSelected);
      if (permanent) {
        const ok = window.confirm(
          `Permanently delete ${paths.length} item${paths.length === 1 ? '' : 's'}? This cannot be undone.`
        );
        if (!ok) return;
      }
      try {
        await api.deleteEntries(paths, permanent);
        setActiveSelected(new Set());
        refreshActive();
        showToast(
          permanent
            ? `Permanently deleted ${paths.length} item(s)`
            : `Moved ${paths.length} item(s) to Recycle Bin`
        );
      } catch (e) {
        showToast(String(e));
      }
    },
    [activeSelected, setActiveSelected, refreshActive, showToast]
  );

  const handleDropEntries = useCallback(
    async (sourcePaths: string[], destDir: string, copy = false) => {
      if (isVirtualPath(destDir)) return;
      try {
        if (copy) {
          await api.copyEntries(sourcePaths, destDir);
          showToast(`Copied ${sourcePaths.length} item(s)`);
        } else {
          await api.moveEntries(sourcePaths, destDir);
          showToast(`Moved ${sourcePaths.length} item(s)`);
        }
        refreshActive();
      } catch (e) {
        showToast(String(e));
      }
    },
    [refreshActive, showToast]
  );

  const handlePinToggle = useCallback(
    (p: string) => {
      if (!p || isVirtualPath(p)) return;
      setPinnedPaths((prev) => {
        const exists = prev.some((x) => x.toLowerCase() === p.toLowerCase());
        const next = exists
          ? prev.filter((x) => x.toLowerCase() !== p.toLowerCase())
          : [...prev, p];
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
        showToast(exists ? 'Unpinned from sidebar' : 'Pinned to sidebar');
        return next;
      });
    },
    [showToast]
  );

  const handlePinAdd = useCallback(
    (p: string) => {
      if (!p || isVirtualPath(p)) return;
      setPinnedPaths((prev) => {
        if (prev.some((x) => x.toLowerCase() === p.toLowerCase())) return prev;
        const next = [...prev, p];
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
        showToast('Pinned folder to sidebar');
        return next;
      });
    },
    [showToast]
  );

  const handleMovePin = useCallback((p: string, delta: -1 | 1) => {
    setPinnedPaths((prev) => {
      const idx = prev.findIndex((x) => x.toLowerCase() === p.toLowerCase());
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSetTag = useCallback(
    (paths: string[], color: FileTagColor | null) => {
      if (paths.length === 0) return;
      setFileTags((prev) => {
        const next = { ...prev };
        for (const p of paths) {
          const key = p.toLowerCase();
          if (color) next[key] = color;
          else delete next[key];
        }
        localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      showToast(color ? `Tagged ${paths.length} item${paths.length === 1 ? '' : 's'}` : 'Cleared tag');
    },
    [showToast]
  );

  const handleSelectEffect = useCallback((next: WindowEffect) => {
    setWindowEffect(next);
    localStorage.setItem(EFFECT_STORAGE_KEY, next);
    api.setWindowEffect(next).catch(() => {});
  }, []);

  const resetClassicIncompatibleTabFilters = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) =>
        t.categoryFilter !== 'all' || t.recursiveSearch
          ? { ...t, categoryFilter: 'all', recursiveSearch: false }
          : t
      )
    );
    setSecondaryTab((prev) =>
      prev.categoryFilter !== 'all' || prev.recursiveSearch
        ? { ...prev, categoryFilter: 'all', recursiveSearch: false }
        : prev
    );
  }, []);

  const handleUpdateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      if (patch.uiStyle === 'classic-explorer') {
        resetClassicIncompatibleTabFilters();
      }
      setUserSettings((prev) => {
        const next = { ...prev, ...patch };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [resetClassicIncompatibleTabFilters]
  );

  const handleToggleUiStyle = useCallback(() => {
    setUserSettings((prev) => {
      const nextStyle: UserSettings['uiStyle'] =
        prev.uiStyle === 'classic-explorer' ? 'folio' : 'classic-explorer';
      if (nextStyle === 'classic-explorer') {
        resetClassicIncompatibleTabFilters();
      }
      const next: UserSettings = { ...prev, uiStyle: nextStyle };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      showToast(
        nextStyle === 'classic-explorer'
          ? 'Switched to Original Windows 11 Explorer UI'
          : 'Switched to Folio Modern UI'
      );
      return next;
    });
  }, [showToast, resetClassicIncompatibleTabFilters]);

  const handleCycleEffect = useCallback(() => {
    const order: WindowEffect[] = ['acrylic', 'mica', 'tabbed', 'solid'];
    const next = order[(order.indexOf(windowEffect) + 1) % order.length];
    handleSelectEffect(next);
  }, [windowEffect, handleSelectEffect]);

  const handleNewTab = useCallback(() => {
    const nt = createTab(primaryTab.path);
    setTabs((prev) => [...prev, nt]);
    setActiveTabId(nt.id);
    setActivePane('primary');
  }, [primaryTab.path]);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabId) {
          const fallback = next[Math.max(0, idx - 1)] || next[0];
          setActiveTabId(fallback.id);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const handleSortChange = useCallback(
    (pane: 'primary' | 'secondary', field: SortField) => {
      updateTab(pane, (t) => ({
        ...t,
        sortField: field,
        sortDir: t.sortField === field ? (t.sortDir === 'asc' ? 'desc' : 'asc') : 'asc',
      }));
    },
    [updateTab]
  );

  const handleExecuteTidy = useCallback(
    async (moves: BatchMoveItem[]) => {
      try {
        const undoMap = await api.batchMove(moves);
        setLastTidyUndo(undoMap);
        refreshActive();
        showToast(`Organized ${undoMap.length} files cleanly`);
      } catch (e) {
        showToast(String(e));
      }
    },
    [refreshActive, showToast]
  );

  const handleUndoTidy = useCallback(async () => {
    if (!lastTidyUndo || lastTidyUndo.length === 0) return;
    try {
      await api.batchMove(lastTidyUndo);
      setLastTidyUndo(null);
      refreshActive();
      showToast('Restored files to their original locations');
    } catch (e) {
      showToast(String(e));
    }
  }, [lastTidyUndo, refreshActive, showToast]);

  const handleExtractZip = useCallback(
    async (entry: FileEntry) => {
      try {
        await api.extractZip(entry.path);
        refreshActive();
        showToast(`Extracted ${entry.name}`);
      } catch (e) {
        showToast(String(e));
      }
    },
    [refreshActive, showToast]
  );

  const handleInvertSelection = useCallback(() => {
    const next = new Set<string>();
    for (const e of activeVisible) {
      if (!activeSelected.has(e.path)) next.add(e.path);
    }
    setActiveSelected(next);
  }, [activeVisible, activeSelected, setActiveSelected]);

  const handleProperties = useCallback(
    (path: string) => {
      api.showNativeProperties(path).catch((e) => showToast(String(e)));
    },
    [showToast]
  );

  const stepQuickLook = useCallback(
    (delta: number) => {
      if (!quickLookEntry || activeVisible.length === 0) return;
      const idx = activeVisible.findIndex((e) => e.path === quickLookEntry.path);
      if (idx === -1) return;
      const nextIdx = (idx + delta + activeVisible.length) % activeVisible.length;
      const nextEntry = activeVisible[nextIdx];
      setQuickLookEntry(nextEntry);
      setActiveSelected(new Set([nextEntry.path]));
    },
    [quickLookEntry, activeVisible, setActiveSelected]
  );

  // Global keyboard shortcuts + Explorer type-ahead jump
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (quickLookEntry) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (isInput && target) {
            target.blur();
          } else {
            setQuickLookEntry(null);
          }
          return;
        }
        if (isInput) return;
        if (e.key === ' ') {
          e.preventDefault();
          setQuickLookEntry(null);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          stepQuickLook(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          stepQuickLook(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleOpenEntry(quickLookEntry);
          setQuickLookEntry(null);
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setPathInputTrigger((n) => n + 1);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        updateTab(activePane, (t) => ({ ...t, recursiveSearch: true }));
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
        return;
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setSplitPane((s) => !s);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPreviewPane((p) => !p);
        return;
      }
      if (e.altKey && e.key === 'Enter' && primarySelectedEntry) {
        e.preventDefault();
        handleProperties(primarySelectedEntry.path);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowHidden((h) => !h);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateFolder();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
        return;
      }
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        goUp();
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        refreshActive();
        return;
      }

      if (isInput || paletteOpen || tidyOpen) return;

      if (e.key === ' ') {
        if (primarySelectedEntry) {
          e.preventDefault();
          setQuickLookEntry(primarySelectedEntry);
        }
        return;
      }

      if (e.key === 'Enter' && primarySelectedEntry) {
        e.preventDefault();
        handleOpenEntry(primarySelectedEntry);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        goBack();
        return;
      }

      if (e.key === 'F2') {
        if (activeSelected.size > 1) {
          e.preventDefault();
          setBatchRenameOpen(true);
        } else if (primarySelectedEntry) {
          e.preventDefault();
          setRenamingPath(primarySelectedEntry.path);
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        handleDelete(e.shiftKey);
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setActiveSelected(new Set(activeVisible.map((x) => x.path)));
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCut();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (activeVisible.length === 0) return;
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const currIdx = primarySelectedEntry
          ? activeVisible.findIndex((x) => x.path === primarySelectedEntry.path)
          : -1;
        const nextIdx =
          currIdx === -1
            ? delta > 0
              ? 0
              : activeVisible.length - 1
            : Math.max(0, Math.min(activeVisible.length - 1, currIdx + delta));
        setActiveSelected(new Set([activeVisible[nextIdx].path]));
        return;
      }

      // Windows Explorer type-ahead jump when typing plain characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const ta = typeAheadRef.current;
        if (ta.timer) window.clearTimeout(ta.timer);
        ta.buffer = (ta.buffer + e.key).toLowerCase();
        ta.timer = window.setTimeout(() => {
          ta.buffer = '';
        }, 700);
        const match = activeVisible.find((x) => x.name.toLowerCase().startsWith(ta.buffer));
        if (match) {
          setActiveSelected(new Set([match.path]));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    quickLookEntry,
    stepQuickLook,
    handleOpenEntry,
    activePane,
    updateTab,
    handleNewTab,
    handleCloseTab,
    activeTabId,
    handleCreateFolder,
    goBack,
    goForward,
    goUp,
    refreshActive,
    paletteOpen,
    tidyOpen,
    primarySelectedEntry,
    activeSelected,
    handleDelete,
    handleProperties,
    handleDuplicate,
    handleUndo,
    activeVisible,
    setActiveSelected,
    handleCopy,
    handleCut,
    handlePaste,
  ]);

  // Native mouse side-buttons (Back / Forward)
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [goBack, goForward]);

  const ctxTargetPath = contextMenu?.entry?.path || currentTab.path;
  const ctxIsPinned = pinnedPaths.some((p) => p.toLowerCase() === ctxTargetPath.toLowerCase());

  const pinnedSet = useMemo(
    () => new Set(pinnedPaths.map((p) => p.toLowerCase())),
    [pinnedPaths]
  );
  const isCurrentPinned = Boolean(
    currentTab.path && !isVirtualPath(currentTab.path) && pinnedSet.has(currentTab.path.toLowerCase())
  );
  const quickLookIndex = useMemo(() => {
    if (!quickLookEntry) return -1;
    return activeVisible.findIndex((e) => e.path === quickLookEntry.path);
  }, [quickLookEntry, activeVisible]);
  const primaryFilterKey = primaryTab.categoryFilter;
  const secondaryFilterKey = secondaryTab.categoryFilter;

  const renderPrimaryContent = () => {
    if (primaryTab.path === 'velo://home') {
      return (
        <SpecialViews
          mode="home"
          quickAccess={quickAccess}
          pinnedPaths={pinnedPaths}
          drives={drives}
          navDirection={primaryAnim.dir}
          navKey={primaryAnim.key}
          onNavigate={(p, dir) => navigateTo(p, 'primary', dir || 'in')}
          onQuickLook={setQuickLookEntry}
          onOpenExternal={(e) => handleOpenEntry(e, 'primary')}
        />
      );
    }
    if (primaryTab.path === 'velo://this-pc') {
      return (
        <SpecialViews
          mode="this-pc"
          quickAccess={quickAccess}
          pinnedPaths={pinnedPaths}
          drives={drives}
          navDirection={primaryAnim.dir}
          navKey={primaryAnim.key}
          onNavigate={(p, dir) => navigateTo(p, 'primary', dir || 'in')}
          onQuickLook={setQuickLookEntry}
          onOpenExternal={(e) => handleOpenEntry(e, 'primary')}
        />
      );
    }
    if (primaryTab.path === 'velo://gallery') {
      return (
        <SpecialViews
          mode="gallery"
          quickAccess={quickAccess}
          pinnedPaths={pinnedPaths}
          drives={drives}
          navDirection={primaryAnim.dir}
          navKey={primaryAnim.key}
          onNavigate={(p, dir) => navigateTo(p, 'primary', dir || 'in')}
          onQuickLook={setQuickLookEntry}
          onOpenExternal={(e) => handleOpenEntry(e, 'primary')}
        />
      );
    }
    return (
      <FilePane
        paneId="primary"
        isActivePane={activePane === 'primary'}
        path={primaryTab.path}
        entries={visiblePrimary}
        loading={primaryLoading}
        error={primaryError}
        viewMode={primaryTab.viewMode}
        sortField={primaryTab.sortField}
        sortDir={primaryTab.sortDir}
        groupBy={primaryTab.groupBy}
        selectedPaths={primarySelected}
        cutPaths={cutPathsSet}
        renamingPath={activePane === 'primary' ? renamingPath : null}
        pinnedSet={pinnedSet}
        fileTags={fileTags}
        showExtensions={userSettings.showExtensions}
        showHoverActions={
          userSettings.showHoverActions && userSettings.uiStyle !== 'classic-explorer'
        }
        filterKey={primaryFilterKey}
        onActivatePane={() => setActivePane('primary')}
        onSelect={(sel) => setPrimarySelected(sel)}
        onOpenEntry={(entry) => handleOpenEntry(entry, 'primary')}
        onSortChange={(f) => handleSortChange('primary', f)}
        onContextMenu={(e, entry) =>
          setContextMenu({ x: e.clientX, y: e.clientY, entry, paneId: 'primary' })
        }
        onRenameCommit={handleRenameCommit}
        onRenameCancel={() => setRenamingPath(null)}
        onDropEntries={handleDropEntries}
        onQuickLook={setQuickLookEntry}
        onPinToggle={handlePinToggle}
        onDoubleClickEmpty={() => handleDoubleClickEmpty('primary')}
        navDirection={primaryAnim.dir}
        navKey={primaryAnim.key}
        folderSizes={folderSizes}
      />
    );
  };

  return (
    <div
      className={`app-shell style-${userSettings.uiStyle} effect-${windowEffect} ${
        appReady ? 'app-ready' : 'app-booting'
      }`}
      style={
        windowEffect !== 'solid'
          ? ({ '--glass-alpha': String(userSettings.glassOpacity) } as React.CSSProperties)
          : undefined
      }
    >
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          setActiveTabId(id);
          setActivePane('primary');
        }}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
      />

      <Toolbar
        uiStyle={userSettings.uiStyle}
        path={currentTab.path}
        canBack={currentTab.historyIndex > 0}
        canForward={currentTab.historyIndex < currentTab.history.length - 1}
        canUp={getParentPath(currentTab.path) !== null}
        isCurrentPinned={isCurrentPinned}
        onBack={() => goBack(activePane)}
        onForward={() => goForward(activePane)}
        onUp={() => goUp(activePane)}
        onNavigate={(p) => navigateTo(p, activePane, 'jump')}
        onRefresh={refreshActive}
        onTogglePinCurrent={() => handlePinToggle(currentTab.path)}
        filter={currentTab.filter}
        onFilterChange={(val) => updateTab(activePane, (t) => ({ ...t, filter: val }))}
        recursiveSearch={currentTab.recursiveSearch}
        onToggleRecursiveSearch={() =>
          updateTab(activePane, (t) => ({ ...t, recursiveSearch: !t.recursiveSearch }))
        }
        searching={searching}
        searchInputRef={searchInputRef}
        pathInputTrigger={pathInputTrigger}
      />

      <CommandBar
        uiStyle={userSettings.uiStyle}
        hasSelection={activeSelected.size > 0}
        singleSelection={activeSelected.size === 1}
        canPaste={Boolean(clipboard && clipboard.paths.length > 0)}
        isVirtualFolder={isVirtualPath(currentTab.path)}
        sortField={currentTab.sortField}
        sortDir={currentTab.sortDir}
        groupBy={currentTab.groupBy}
        viewMode={currentTab.viewMode}
        showHidden={showHidden}
        splitPane={splitPane}
        previewPane={previewPane}
        settingsOpen={settingsOpen}
        windowEffect={windowEffect}
        onNewFolder={handleCreateFolder}
        onNewTextFile={handleCreateTextFile}
        onQuickLookSelected={() => primarySelectedEntry && setQuickLookEntry(primarySelectedEntry)}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onRename={() => primarySelectedEntry && setRenamingPath(primarySelectedEntry.path)}
        onCopyPath={() => {
          if (primarySelectedEntry) {
            navigator.clipboard.writeText(primarySelectedEntry.path);
            showToast('Path copied to clipboard');
          }
        }}
        onDelete={() => handleDelete(false)}
        onSortField={(f: SortField) => updateTab(activePane, (t) => ({ ...t, sortField: f }))}
        onSortDir={(d: SortDir) => updateTab(activePane, (t) => ({ ...t, sortDir: d }))}
        onGroupBy={(g: GroupBy) => updateTab(activePane, (t) => ({ ...t, groupBy: g }))}
        onViewMode={(m: ViewMode) => updateTab(activePane, (t) => ({ ...t, viewMode: m }))}
        onToggleHidden={() => setShowHidden((h) => !h)}
        onToggleSplit={() => setSplitPane((s) => !s)}
        onTogglePreview={() => setPreviewPane((p) => !p)}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        onCycleEffect={handleCycleEffect}
        onSelectAll={() => setActiveSelected(new Set(activeVisible.map((x) => x.path)))}
        onInvertSelection={handleInvertSelection}
        onOpenTerminal={() => api.openInTerminal(currentTab.path).catch((e) => showToast(String(e)))}
        onOpenProperties={() => primarySelectedEntry && handleProperties(primarySelectedEntry.path)}
        onOpenTidy={() => setTidyOpen(true)}
        onToggleUiStyle={handleToggleUiStyle}
      />

      <SettingsPopover
        open={settingsOpen}
        windowEffect={windowEffect}
        showHidden={showHidden}
        settings={userSettings}
        onClose={() => setSettingsOpen(false)}
        onSelectEffect={handleSelectEffect}
        onToggleHidden={() => setShowHidden((h) => !h)}
        onUpdateSettings={handleUpdateSettings}
        onToast={showToast}
      />

      <div className="workspace">
        <Sidebar
          uiStyle={userSettings.uiStyle}
          currentPath={currentTab.path}
          quickAccess={quickAccess}
          pinnedPaths={pinnedPaths}
          recentPaths={recentPaths}
          drives={drives}
          canPinCurrent={Boolean(currentTab.path && !isVirtualPath(currentTab.path))}
          isCurrentPinned={isCurrentPinned}
          onNavigate={(p) => navigateTo(p, activePane, 'jump')}
          onPinPath={handlePinAdd}
          onUnpin={handlePinToggle}
          onMovePin={handleMovePin}
          onDropFilesToPath={(srcs, dest) => handleDropEntries(srcs, dest, false)}
          onOpenSpecial={(target) => api.openSpecialFolder(target).catch((e) => showToast(String(e)))}
        />

        <main className="main-area">
          {!isVirtualPath(currentTab.path) && userSettings.uiStyle !== 'classic-explorer' && (
            <CategoryBar
              entries={activeEntries}
              activeCategory={currentTab.categoryFilter}
              onSelectCategory={(cat: FileCategory | 'all') =>
                updateTab(activePane, (t) => ({ ...t, categoryFilter: cat }))
              }
              onOpenTidy={() => setTidyOpen(true)}
              canUndoTidy={Boolean(lastTidyUndo && lastTidyUndo.length > 0)}
              onUndoTidy={handleUndoTidy}
            />
          )}

          <div className={`panes-container ${splitPane ? 'split' : ''}`}>
            {renderPrimaryContent()}

            {splitPane && (
              <FilePane
                paneId="secondary"
                isActivePane={activePane === 'secondary'}
                path={secondaryTab.path}
                entries={visibleSecondary}
                loading={secondaryLoading}
                error={secondaryError}
                viewMode={secondaryTab.viewMode}
                sortField={secondaryTab.sortField}
                sortDir={secondaryTab.sortDir}
                groupBy={secondaryTab.groupBy}
                selectedPaths={secondarySelected}
                cutPaths={cutPathsSet}
                renamingPath={activePane === 'secondary' ? renamingPath : null}
                pinnedSet={pinnedSet}
                fileTags={fileTags}
                showExtensions={userSettings.showExtensions}
                showHoverActions={
                  userSettings.showHoverActions && userSettings.uiStyle !== 'classic-explorer'
                }
                filterKey={secondaryFilterKey}
                onActivatePane={() => setActivePane('secondary')}
                onSelect={(sel) => setSecondarySelected(sel)}
                onOpenEntry={(entry) => handleOpenEntry(entry, 'secondary')}
                onSortChange={(f) => handleSortChange('secondary', f)}
                onContextMenu={(e, entry) =>
                  setContextMenu({ x: e.clientX, y: e.clientY, entry, paneId: 'secondary' })
                }
                onRenameCommit={handleRenameCommit}
                onRenameCancel={() => setRenamingPath(null)}
                onDropEntries={handleDropEntries}
                onQuickLook={setQuickLookEntry}
                onPinToggle={handlePinToggle}
                onDoubleClickEmpty={() => handleDoubleClickEmpty('secondary')}
                navDirection={secondaryAnim.dir}
                navKey={secondaryAnim.key}
                folderSizes={folderSizes}
              />
            )}
          </div>

          {/* Intuitive Floating Multi-Select Action Bar (Folio Modern UI) */}
          {activeSelected.size >= 2 &&
            !isVirtualPath(currentTab.path) &&
            userSettings.uiStyle !== 'classic-explorer' && (
              <div className="multi-select-bar">
              <span className="msb-count">{activeSelected.size} selected</span>
              <div className="msb-sep" />
              <button className="msb-btn" onClick={handleCopy} title="Copy">
                <Copy size={13} />
                <span>Copy</span>
              </button>
              <button className="msb-btn" onClick={handleCut} title="Cut">
                <Scissors size={13} />
                <span>Cut</span>
              </button>
              <button className="msb-btn" onClick={handleCompressZip} title="Compress to ZIP">
                <FolderArchive size={13} />
                <span>ZIP</span>
              </button>
              <button className="msb-btn" onClick={() => setBatchRenameOpen(true)} title="Batch Rename">
                <Edit3 size={13} />
                <span>Rename</span>
              </button>
              <button className="msb-btn danger" onClick={() => handleDelete(false)} title="Delete">
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
              <button
                className="msb-close"
                onClick={() => setActiveSelected(new Set())}
                title="Clear selection"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </main>

        {previewPane && (
          <PreviewPane
            entry={primarySelectedEntry}
            selectedCount={activeSelected.size}
            selectedTotalSize={selectedTotalSize}
            activeTag={
              primarySelectedEntry ? fileTags[primarySelectedEntry.path.toLowerCase()] || null : null
            }
            isPinned={
              primarySelectedEntry ? pinnedSet.has(primarySelectedEntry.path.toLowerCase()) : false
            }
            onClose={() => setPreviewPane(false)}
            onOpenQuickLook={setQuickLookEntry}
            onOpenExternal={(e) => handleOpenEntry(e)}
            onSetTag={(color) =>
              primarySelectedEntry && handleSetTag([primarySelectedEntry.path], color)
            }
            onPinToggle={handlePinToggle}
          />
        )}
      </div>

      <StatusBar
        uiStyle={userSettings.uiStyle}
        totalCount={activeEntries.length}
        visibleCount={activeVisible.length}
        selectedCount={activeSelected.size}
        selectedSize={selectedTotalSize}
        clipboard={clipboard}
        recursiveSearch={currentTab.recursiveSearch && currentTab.filter.trim().length > 0}
        viewMode={currentTab.viewMode}
        onViewModeChange={(m) => updateTab(activePane, (t) => ({ ...t, viewMode: m }))}
      />

      <ContextMenu
        menu={contextMenu}
        clipboard={clipboard}
        selectedCount={activeSelected.size}
        isPinned={ctxIsPinned}
        activeTag={
          contextMenu?.entry ? fileTags[contextMenu.entry.path.toLowerCase()] || null : null
        }
        onClose={() => setContextMenu(null)}
        onOpen={(entry) => handleOpenEntry(entry)}
        onOpenWith={(entry) => api.openWithDialog(entry.path).catch((e) => showToast(String(e)))}
        onQuickLook={setQuickLookEntry}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onRename={(entry) => setRenamingPath(entry.path)}
        onBatchRename={() => setBatchRenameOpen(true)}
        onDuplicate={handleDuplicate}
        onCompressZip={handleCompressZip}
        onCalcFolderSize={handleCalcFolderSize}
        onDelete={handleDelete}
        onCopyPath={(p) => {
          navigator.clipboard.writeText(p);
          showToast('Path copied to clipboard');
        }}
        onRevealExplorer={(p) => api.revealInExplorer(p).catch((e) => showToast(String(e)))}
        onOpenTerminal={(p) => api.openInTerminal(p).catch((e) => showToast(String(e)))}
        onPinToggle={handlePinToggle}
        onSetTag={(color) => {
          const targets =
            activeSelected.size > 0
              ? Array.from(activeSelected)
              : contextMenu?.entry
              ? [contextMenu.entry.path]
              : [];
          handleSetTag(targets, color);
        }}
        onNewFolder={handleCreateFolder}
        onExtractZip={handleExtractZip}
        onProperties={handleProperties}
        currentPath={currentTab.path}
      />

      <QuickLookModal
        entry={quickLookEntry}
        currentIndex={quickLookIndex}
        totalCount={activeVisible.length}
        isPinned={quickLookEntry ? pinnedSet.has(quickLookEntry.path.toLowerCase()) : false}
        onClose={() => setQuickLookEntry(null)}
        onPrev={() => stepQuickLook(-1)}
        onNext={() => stepQuickLook(1)}
        onOpenExternal={(entry) => {
          handleOpenEntry(entry);
          setQuickLookEntry(null);
        }}
        onOpenWith={(entry) => api.openWithDialog(entry.path).catch((e) => showToast(String(e)))}
        onExtractZip={handleExtractZip}
        onPinToggle={handlePinToggle}
        onToast={showToast}
      />

      {tidyOpen && (
        <TidyModal
          folderPath={currentTab.path}
          entries={activeEntries}
          onClose={() => setTidyOpen(false)}
          onExecute={handleExecuteTidy}
        />
      )}

      {batchRenameOpen && selectedEntryObjects.length > 0 && (
        <BatchRenameModal
          entries={selectedEntryObjects}
          onClose={() => setBatchRenameOpen(false)}
          onApply={handleBatchRenameApply}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        uiStyle={userSettings.uiStyle}
        onClose={() => setPaletteOpen(false)}
        quickAccess={quickAccess}
        drives={drives}
        pinnedPaths={pinnedPaths}
        onNavigate={(p) => navigateTo(p, activePane, 'jump')}
        onNewFolder={handleCreateFolder}
        onToggleSplit={() => setSplitPane((s) => !s)}
        onTogglePreview={() => setPreviewPane((p) => !p)}
        onCycleEffect={handleCycleEffect}
        onToggleUiStyle={handleToggleUiStyle}
        onOpenTerminal={() => api.openInTerminal(currentTab.path).catch((e) => showToast(String(e)))}
        onOpenTidy={() => setTidyOpen(true)}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;
