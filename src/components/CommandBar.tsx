import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clipboard,
  Columns2,
  Copy,
  Edit3,
  Eye,
  FilePlus,
  FolderPlus,
  Info,
  LayoutGrid,
  Link2,
  List,
  MoreHorizontal,
  PanelRight,
  PlusCircle,
  Scissors,
  Share,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { GroupBy, SortDir, SortField, UiStyle, ViewMode, WindowEffect } from '../types';

interface CommandBarProps {
  uiStyle: UiStyle;
  hasSelection: boolean;
  singleSelection: boolean;
  canPaste: boolean;
  isVirtualFolder: boolean;
  sortField: SortField;
  sortDir: SortDir;
  groupBy: GroupBy;
  viewMode: ViewMode;
  showHidden: boolean;
  splitPane: boolean;
  previewPane: boolean;
  settingsOpen: boolean;
  windowEffect: WindowEffect;
  onNewFolder: () => void;
  onNewTextFile: () => void;
  onQuickLookSelected: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onRename: () => void;
  onCopyPath: () => void;
  onDelete: () => void;
  onSortField: (f: SortField) => void;
  onSortDir: (d: SortDir) => void;
  onGroupBy: (g: GroupBy) => void;
  onViewMode: (m: ViewMode) => void;
  onToggleHidden: () => void;
  onToggleSplit: () => void;
  onTogglePreview: () => void;
  onToggleSettings: () => void;
  onCycleEffect: () => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onOpenTerminal: () => void;
  onOpenProperties: () => void;
  onOpenTidy: () => void;
  onToggleUiStyle: () => void;
}

type OpenMenu = 'new' | 'sort' | 'view' | 'more' | null;

export const CommandBar: React.FC<CommandBarProps> = ({
  uiStyle,
  hasSelection,
  singleSelection,
  canPaste,
  isVirtualFolder,
  sortField,
  sortDir,
  groupBy,
  viewMode,
  showHidden,
  splitPane,
  previewPane,
  settingsOpen,
  windowEffect,
  onNewFolder,
  onNewTextFile,
  onQuickLookSelected,
  onCut,
  onCopy,
  onPaste,
  onRename,
  onCopyPath,
  onDelete,
  onSortField,
  onSortDir,
  onGroupBy,
  onViewMode,
  onToggleHidden,
  onToggleSplit,
  onTogglePreview,
  onToggleSettings,
  onCycleEffect,
  onSelectAll,
  onInvertSelection,
  onOpenTerminal,
  onOpenProperties,
  onOpenTidy,
  onToggleUiStyle,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [openMenu]);

  const toggle = (m: OpenMenu) => setOpenMenu((curr) => (curr === m ? null : m));

  return (
    <div className="command-bar" ref={barRef}>
      <div className="cmd-left">
        {/* New dropdown */}
        <div className="cmd-dropdown-wrap">
          <button
            className={`cmd-btn labeled ${openMenu === 'new' ? 'open' : ''}`}
            disabled={isVirtualFolder}
            onClick={() => toggle('new')}
            title="Create new item"
          >
            <PlusCircle size={15} className="cmd-new-icon" />
            <span>New</span>
            <ChevronDown size={12} className="cmd-caret" />
          </button>
          {openMenu === 'new' && (
            <div className="cmd-menu">
              <button
                className="cmd-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onNewFolder();
                }}
              >
                <FolderPlus size={14} />
                <span>Folder</span>
                <kbd>Ctrl+Shift+N</kbd>
              </button>
              <button
                className="cmd-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onNewTextFile();
                }}
              >
                <FilePlus size={14} />
                <span>Text Document</span>
              </button>
            </div>
          )}
        </div>

        <div className="cmd-divider" />

        {/* Classic Explorer Cut / Copy / Paste / Rename / Share(Path) / Delete */}
        <button
          className="cmd-btn"
          disabled={!hasSelection || isVirtualFolder}
          onClick={onCut}
          title="Cut (Ctrl+X)"
        >
          <Scissors size={15} />
        </button>
        <button
          className="cmd-btn"
          disabled={!hasSelection}
          onClick={onCopy}
          title="Copy (Ctrl+C)"
        >
          <Copy size={15} />
        </button>
        <button
          className="cmd-btn"
          disabled={!canPaste || isVirtualFolder}
          onClick={onPaste}
          title="Paste (Ctrl+V)"
        >
          <Clipboard size={15} />
        </button>
        <button
          className="cmd-btn"
          disabled={!singleSelection || isVirtualFolder}
          onClick={onRename}
          title="Rename (F2)"
        >
          <Edit3 size={15} />
        </button>
        <button
          className="cmd-btn"
          disabled={!hasSelection}
          onClick={onCopyPath}
          title={uiStyle === 'classic-explorer' ? 'Share / Copy path' : 'Copy path'}
        >
          {uiStyle === 'classic-explorer' ? <Share size={15} /> : <Link2 size={15} />}
        </button>
        <button
          className="cmd-btn"
          disabled={!hasSelection || isVirtualFolder}
          onClick={onDelete}
          title="Delete to Recycle Bin (Del)"
        >
          <Trash2 size={15} />
        </button>

        <div className="cmd-divider" />

        {/* Sort dropdown */}
        <div className="cmd-dropdown-wrap">
          <button
            className={`cmd-btn labeled ${openMenu === 'sort' ? 'open' : ''}`}
            onClick={() => toggle('sort')}
            title="Sort and group"
          >
            <ArrowUpDown size={14} />
            <span>Sort</span>
            <ChevronDown size={12} className="cmd-caret" />
          </button>
          {openMenu === 'sort' && (
            <div className="cmd-menu">
              {(['name', 'modified', 'type', 'size'] as SortField[]).map((f) => (
                <button
                  key={f}
                  className="cmd-menu-item"
                  onClick={() => {
                    onSortField(f);
                    setOpenMenu(null);
                  }}
                >
                  <span className="cmd-check">{sortField === f && <Check size={13} />}</span>
                  <span>
                    {f === 'name'
                      ? 'Name'
                      : f === 'modified'
                      ? 'Date modified'
                      : f === 'type'
                      ? 'Type'
                      : 'Size'}
                  </span>
                </button>
              ))}
              <div className="cmd-menu-sep" />
              <button
                className="cmd-menu-item"
                onClick={() => {
                  onSortDir('asc');
                  setOpenMenu(null);
                }}
              >
                <span className="cmd-check">{sortDir === 'asc' && <Check size={13} />}</span>
                <span>Ascending</span>
              </button>
              <button
                className="cmd-menu-item"
                onClick={() => {
                  onSortDir('desc');
                  setOpenMenu(null);
                }}
              >
                <span className="cmd-check">{sortDir === 'desc' && <Check size={13} />}</span>
                <span>Descending</span>
              </button>
              <div className="cmd-menu-sep" />
              <div className="cmd-menu-label">Group by</div>
              {(['none', 'date', 'type'] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  className="cmd-menu-item"
                  onClick={() => {
                    onGroupBy(g);
                    setOpenMenu(null);
                  }}
                >
                  <span className="cmd-check">{groupBy === g && <Check size={13} />}</span>
                  <span>{g === 'none' ? 'None' : g === 'date' ? 'Date modified' : 'Type'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View dropdown */}
        <div className="cmd-dropdown-wrap">
          <button
            className={`cmd-btn labeled ${openMenu === 'view' ? 'open' : ''}`}
            onClick={() => toggle('view')}
            title="Layout and view options"
          >
            {viewMode === 'details' || viewMode === 'compact' ? (
              <List size={14} />
            ) : (
              <LayoutGrid size={14} />
            )}
            <span>View</span>
            <ChevronDown size={12} className="cmd-caret" />
          </button>
          {openMenu === 'view' && (
            <div className="cmd-menu">
              {(
                [
                  ['xlarge', 'Extra large icons'],
                  ['large', 'Large icons'],
                  ['medium', 'Medium icons'],
                  ['details', 'Details'],
                  ['compact', 'Compact details'],
                ] as [ViewMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  className="cmd-menu-item"
                  onClick={() => {
                    onViewMode(m);
                    setOpenMenu(null);
                  }}
                >
                  <span className="cmd-check">{viewMode === m && <Check size={13} />}</span>
                  <span>{label}</span>
                </button>
              ))}
              <div className="cmd-menu-sep" />
              <button
                className="cmd-menu-item"
                onClick={() => {
                  onToggleHidden();
                  setOpenMenu(null);
                }}
              >
                <span className="cmd-check">{showHidden && <Check size={13} />}</span>
                <span>Hidden items</span>
                <kbd>Ctrl+H</kbd>
              </button>
              <button
                className="cmd-menu-item"
                onClick={() => {
                  onToggleSplit();
                  setOpenMenu(null);
                }}
              >
                <span className="cmd-check">{splitPane && <Check size={13} />}</span>
                <span>Split pane</span>
                <kbd>Ctrl+\</kbd>
              </button>
              <button
                className="cmd-menu-item"
                onClick={() => {
                  onCycleEffect();
                  setOpenMenu(null);
                }}
              >
                <Sparkles size={13} />
                <span>Backdrop: {windowEffect}</span>
              </button>
            </div>
          )}
        </div>

        {/* More (...) dropdown */}
        <div className="cmd-dropdown-wrap">
          <button
            className={`cmd-btn ${openMenu === 'more' ? 'open' : ''}`}
            onClick={() => toggle('more')}
            title="See more"
          >
            <MoreHorizontal size={15} />
          </button>
          {openMenu === 'more' && (
            <div className="cmd-menu">
              <button
                className="cmd-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onSelectAll();
                }}
              >
                <span>Select all</span>
                <kbd>Ctrl+A</kbd>
              </button>
              <button
                className="cmd-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onInvertSelection();
                }}
              >
                <span>Invert selection</span>
              </button>
              <div className="cmd-menu-sep" />
              {!isVirtualFolder && (
                <>
                  <button
                    className="cmd-menu-item"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenTidy();
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Tidy this folder...</span>
                  </button>
                  <button
                    className="cmd-menu-item"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenTerminal();
                    }}
                  >
                    <Terminal size={13} />
                    <span>Open in Terminal</span>
                  </button>
                </>
              )}
              <button
                className="cmd-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  onToggleUiStyle();
                }}
              >
                <SlidersHorizontal size={13} />
                <span>
                  {uiStyle === 'classic-explorer'
                    ? 'Switch to Folio Modern UI'
                    : 'Switch to Windows 11 Explorer UI'}
                </span>
              </button>
              <button
                className="cmd-menu-item"
                data-settings-trigger="true"
                onClick={() => {
                  setOpenMenu(null);
                  onToggleSettings();
                }}
              >
                <SlidersHorizontal size={13} />
                <span>Appearance &amp; Settings...</span>
              </button>
              {singleSelection && (
                <button
                  className="cmd-menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenProperties();
                  }}
                >
                  <Info size={13} />
                  <span>Properties</span>
                  <kbd>Alt+Enter</kbd>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="cmd-right">
        {uiStyle !== 'classic-explorer' && (
          <>
            <button
              className="cmd-btn labeled"
              disabled={!singleSelection}
              onClick={onQuickLookSelected}
              title="QuickLook selected item (Space)"
            >
              <Eye size={14} />
              <span>QuickLook</span>
            </button>
            <button
              className={`cmd-btn labeled ${splitPane ? 'active' : ''}`}
              onClick={onToggleSplit}
              title="Toggle split pane (Ctrl+\)"
            >
              <Columns2 size={14} />
              <span>Split</span>
            </button>
          </>
        )}
        <button
          className={`cmd-btn labeled ${previewPane ? 'active' : ''}`}
          onClick={onTogglePreview}
          title="Toggle Details & Preview pane (Alt+P)"
        >
          <PanelRight size={14} />
          <span>Details</span>
        </button>
        <button
          className={`cmd-btn ${settingsOpen ? 'active' : ''}`}
          data-settings-trigger="true"
          onClick={onToggleSettings}
          title="Appearance & Interface Style"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
    </div>
  );
};
