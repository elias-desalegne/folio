import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderOpen,
  Pin,
} from 'lucide-react';
import type {
  FileEntry,
  FileTagColor,
  GroupBy,
  NavDirection,
  SortDir,
  SortField,
  ViewMode,
} from '../types';
import { api } from '../api';
import {
  FILE_TAGS,
  buildDisplayRows,
  formatBytes,
  formatDate,
  isImagePreviewable,
} from '../utils/format';
import { FileIcon } from './FileIcon';

interface FilePaneProps {
  paneId: 'primary' | 'secondary';
  isActivePane: boolean;
  path: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  sortField: SortField;
  sortDir: SortDir;
  groupBy: GroupBy;
  selectedPaths: Set<string>;
  cutPaths: Set<string>;
  renamingPath: string | null;
  pinnedSet: Set<string>;
  fileTags: Record<string, FileTagColor>;
  showExtensions: boolean;
  showHoverActions: boolean;
  filterKey: string;
  onActivatePane: () => void;
  onSelect: (paths: Set<string>, anchorPath?: string) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onSortChange: (field: SortField) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry | null) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  onDropEntries: (sourcePaths: string[], destDir: string, copy: boolean) => void;
  onQuickLook: (entry: FileEntry) => void;
  onPinToggle: (path: string) => void;
  onDoubleClickEmpty: () => void;
  navDirection: NavDirection;
  navKey: number;
  folderSizes: Record<string, number>;
}

function formatDisplayName(entry: FileEntry, showExtensions: boolean): string {
  if (showExtensions || entry.isDir || !entry.extension) return entry.name;
  const suffix = `.${entry.extension}`;
  if (entry.name.toLowerCase().endsWith(suffix.toLowerCase())) {
    const stripped = entry.name.slice(0, entry.name.length - suffix.length);
    return stripped || entry.name;
  }
  return entry.name;
}

export const FilePane: React.FC<FilePaneProps> = ({
  isActivePane,
  path,
  entries,
  loading,
  error,
  viewMode,
  sortField,
  sortDir,
  groupBy,
  selectedPaths,
  cutPaths,
  renamingPath,
  pinnedSet,
  fileTags,
  showExtensions,
  showHoverActions,
  filterKey,
  onActivatePane,
  onSelect,
  onOpenEntry,
  onSortChange,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  onDropEntries,
  onQuickLook,
  onPinToggle,
  onDoubleClickEmpty,
  navDirection,
  navKey,
  folderSizes,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [gridCols, setGridCols] = useState(5);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Smooth non-remounting pulse when switching category filter pills (never unmounts virtualizer!)
  const [filterPulse, setFilterPulse] = useState(false);
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setFilterPulse(false);
      const raf = requestAnimationFrame(() => setFilterPulse(true));
      const timer = window.setTimeout(() => setFilterPulse(false), 180);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    }
  }, [filterKey]);

  // Marquee (rubber-band) selection state
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);
  const marqueeMovedRef = useRef(false);

  const isListView = viewMode === 'details' || viewMode === 'compact';
  const rowHeight = viewMode === 'compact' ? 28 : 34;

  const gridCardWidth =
    viewMode === 'xlarge' ? 210 : viewMode === 'large' ? 150 : 112;
  const gridRowHeight =
    viewMode === 'xlarge' ? 210 : viewMode === 'large' ? 156 : 118;
  const gridThumbHeight =
    viewMode === 'xlarge' ? 148 : viewMode === 'large' ? 96 : 64;
  const gridIconSize =
    viewMode === 'xlarge' ? 64 : viewMode === 'large' ? 44 : 32;

  // Reset scroll to top on folder change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [navKey]);

  useEffect(() => {
    if (renamingPath) {
      const target = entries.find((e) => e.path === renamingPath);
      if (target) {
        setRenameDraft(target.name);
        setTimeout(() => {
          const el = renameInputRef.current;
          if (el) {
            el.focus();
            const dotIdx = !target.isDir ? target.name.lastIndexOf('.') : -1;
            if (dotIdx > 0) el.setSelectionRange(0, dotIdx);
            else el.select();
          }
        }, 10);
      }
    }
  }, [renamingPath, entries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateCols = () => {
      const w = el.clientWidth - 24;
      const cols = Math.max(2, Math.floor(w / gridCardWidth));
      setGridCols(cols);
    };
    updateCols();
    const ro = new ResizeObserver(updateCols);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridCardWidth]);

  const displayRows = useMemo(
    () => buildDisplayRows(entries, groupBy, collapsedGroups),
    [entries, groupBy, collapsedGroups]
  );

  type GridRow =
    | { kind: 'group'; id: string; label: string; count: number }
    | { kind: 'grid-row'; items: FileEntry[] };

  const gridRows = useMemo<GridRow[]>(() => {
    if (isListView) return [];
    const out: GridRow[] = [];
    let currentChunk: FileEntry[] = [];
    const flush = () => {
      if (currentChunk.length > 0) {
        out.push({ kind: 'grid-row', items: currentChunk });
        currentChunk = [];
      }
    };
    for (const row of displayRows) {
      if (row.kind === 'group') {
        flush();
        out.push(row);
      } else {
        currentChunk.push(row.entry);
        if (currentChunk.length >= gridCols) flush();
      }
    }
    flush();
    return out;
  }, [displayRows, isListView, gridCols]);

  const rowCount = isListView ? displayRows.length : gridRows.length;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (isListView) {
        return displayRows[index]?.kind === 'group' ? 32 : rowHeight;
      }
      return gridRows[index]?.kind === 'group' ? 34 : gridRowHeight;
    },
    overscan: 14,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [viewMode, rowHeight, gridRowHeight, virtualizer]);

  // Marquee drag tracking
  useEffect(() => {
    if (!marquee) return;

    const onMove = (e: MouseEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top + el.scrollTop;

      if (Math.abs(cx - marquee.startX) > 4 || Math.abs(cy - marquee.startY) > 4) {
        marqueeMovedRef.current = true;
      }

      setMarquee((prev) => (prev ? { ...prev, currX: cx, currY: cy } : null));

      if (!marqueeMovedRef.current) return;

      const boxLeft = Math.min(marquee.startX, cx) + rect.left;
      const boxRight = Math.max(marquee.startX, cx) + rect.left;
      const boxTop = Math.min(marquee.startY, cy) + rect.top - el.scrollTop;
      const boxBottom = Math.max(marquee.startY, cy) + rect.top - el.scrollTop;

      const nodes = el.querySelectorAll<HTMLElement>('[data-entry-path]');
      const hit = new Set<string>();
      nodes.forEach((node) => {
        const nr = node.getBoundingClientRect();
        if (nr.right >= boxLeft && nr.left <= boxRight && nr.bottom >= boxTop && nr.top <= boxBottom) {
          const p = node.getAttribute('data-entry-path');
          if (p) hit.add(p);
        }
      });
      onSelect(hit);
    };

    const onUp = () => {
      setMarquee(null);
      window.setTimeout(() => {
        marqueeMovedRef.current = false;
      }, 0);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [marquee, onSelect]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheckbox = (e: React.MouseEvent, entry: FileEntry) => {
    e.stopPropagation();
    onActivatePane();
    const next = new Set(selectedPaths);
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
    setAnchorPath(entry.path);
    onSelect(next, entry.path);
  };

  const handleRowClick = (e: React.MouseEvent, entry: FileEntry) => {
    e.stopPropagation();
    onActivatePane();

    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedPaths);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      setAnchorPath(entry.path);
      onSelect(next, entry.path);
    } else if (e.shiftKey && anchorPath) {
      const visibleEntries = displayRows
        .filter((r): r is { kind: 'entry'; entry: FileEntry } => r.kind === 'entry')
        .map((r) => r.entry);
      const start = visibleEntries.findIndex((x) => x.path === anchorPath);
      const end = visibleEntries.findIndex((x) => x.path === entry.path);
      if (start !== -1 && end !== -1) {
        const [lo, hi] = start < end ? [start, end] : [end, start];
        const next = new Set(visibleEntries.slice(lo, hi + 1).map((x) => x.path));
        onSelect(next, anchorPath);
        return;
      }
      onSelect(new Set([entry.path]), entry.path);
    } else {
      setAnchorPath(entry.path);
      onSelect(new Set([entry.path]), entry.path);
    }
  };

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const dragPaths = selectedPaths.has(entry.path)
      ? Array.from(selectedPaths)
      : [entry.path];
    e.dataTransfer.setData('application/x-velo-paths', JSON.stringify(dragPaths));
    if (entry.isDir) {
      e.dataTransfer.setData('application/x-velo-folder', entry.path);
    }
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handlePaneDrop = (e: React.DragEvent, destDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    const raw = e.dataTransfer.getData('application/x-velo-paths');
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (paths.length > 0 && !paths.includes(destDir)) {
        onDropEntries(paths, destDir, e.ctrlKey);
      }
    } catch {
      // ignore
    }
  };

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const allSelected = entries.length > 0 && selectedPaths.size === entries.length;

  return (
    <div
      className={`file-pane ${isActivePane ? 'active-pane' : ''}`}
      onMouseDown={onActivatePane}
      onContextMenu={(e) => {
        e.preventDefault();
        onActivatePane();
        onContextMenu(e, null);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-velo-paths')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
        }
      }}
      onDrop={(e) => handlePaneDrop(e, path)}
    >
      {isListView && (
        <div className="list-header">
          <div className="col-check-hdr">
            <button
              className={`row-checkbox header-cb ${allSelected ? 'checked' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (allSelected) onSelect(new Set());
                else onSelect(new Set(entries.map((x) => x.path)));
              }}
              title={allSelected ? 'Deselect all' : 'Select all'}
            >
              {allSelected && <Check size={10} strokeWidth={3} />}
            </button>
          </div>
          <button className="col-name" onClick={() => onSortChange('name')}>
            <span>Name</span>
            {renderSortArrow('name')}
          </button>
          <button className="col-date" onClick={() => onSortChange('modified')}>
            <span>Date modified</span>
            {renderSortArrow('modified')}
          </button>
          <button className="col-type" onClick={() => onSortChange('type')}>
            <span>Type</span>
            {renderSortArrow('type')}
          </button>
          <button className="col-size" onClick={() => onSortChange('size')}>
            <span>Size</span>
            {renderSortArrow('size')}
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="file-scroll"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement;
          if (target.closest('.file-row, .grid-card, .group-header-row, input, button')) {
            return;
          }
          const el = scrollRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top + el.scrollTop;
          marqueeMovedRef.current = false;
          setMarquee({ startX: sx, startY: sy, currX: sx, currY: sy });
        }}
        onClick={() => {
          if (!marqueeMovedRef.current) {
            onSelect(new Set());
          }
        }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('.file-row, .grid-card, .group-header-row, input, button')) {
            onDoubleClickEmpty();
          }
        }}
      >
        <div key={navKey} className={`nav-stage nav-${navDirection}`}>
          <div className={`filter-stage ${filterPulse ? 'pulsing' : ''}`}>
            {error ? (
              <div className="empty-state error">
                <p>{error}</p>
              </div>
            ) : loading && entries.length === 0 ? (
              <div className="empty-state">
                <div className="spinner" />
                <span>Loading...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={36} className="empty-icon" />
                <span>This folder is empty</span>
              </div>
            ) : (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((vItem) => {
                  if (isListView) {
                    const row = displayRows[vItem.index];
                    if (!row) return null;

                    if (row.kind === 'group') {
                      const collapsed = collapsedGroups.has(row.id);
                      return (
                        <div
                          key={`g-${row.id}`}
                          className="group-header-row"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${vItem.size}px`,
                            transform: `translateY(${vItem.start}px)`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(row.id);
                          }}
                        >
                          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          <span className="group-title">{row.label}</span>
                          <span className="group-count">{row.count}</span>
                          <span className="group-line" />
                        </div>
                      );
                    }

                    const entry = row.entry;
                    const selected = selectedPaths.has(entry.path);
                    const isCut = cutPaths.has(entry.path);
                    const isRenaming = renamingPath === entry.path;
                    const isDropTarget = entry.isDir && dragOverFolder === entry.path;
                    const tagColor = fileTags[entry.path.toLowerCase()];
                    const isEntryPinned = entry.isDir && pinnedSet.has(entry.path.toLowerCase());

                    return (
                      <div
                        key={entry.path}
                        data-entry-path={entry.path}
                        className={`file-row ${viewMode === 'compact' ? 'compact' : ''} ${
                          selected ? 'selected' : ''
                        } ${isCut ? 'cut' : ''} ${entry.isHidden ? 'hidden-entry' : ''} ${
                          isDropTarget ? 'drop-target' : ''
                        }`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${vItem.size}px`,
                          transform: `translateY(${vItem.start}px)`,
                        }}
                        draggable={!isRenaming}
                        onDragStart={(e) => handleDragStart(e, entry)}
                        onDragOver={(e) => {
                          if (
                            entry.isDir &&
                            e.dataTransfer.types.includes('application/x-velo-paths')
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverFolder(entry.path);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverFolder === entry.path) setDragOverFolder(null);
                        }}
                        onDrop={(e) => {
                          if (entry.isDir) handlePaneDrop(e, entry.path);
                        }}
                        onClick={(e) => handleRowClick(e, entry)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onOpenEntry(entry);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onActivatePane();
                          if (!selectedPaths.has(entry.path)) {
                            onSelect(new Set([entry.path]), entry.path);
                          }
                          onContextMenu(e, entry);
                        }}
                      >
                        <div className="col-check">
                          <button
                            className={`row-checkbox ${selected ? 'checked' : ''}`}
                            onClick={(e) => toggleCheckbox(e, entry)}
                            tabIndex={-1}
                          >
                            {selected && <Check size={10} strokeWidth={3} />}
                          </button>
                        </div>
                        <div className="col-name cell-name">
                          <FileIcon
                            category={entry.category}
                            extension={entry.extension}
                            path={entry.path}
                            isDir={entry.isDir}
                            size={viewMode === 'compact' ? 16 : 19}
                          />

                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              className="rename-input"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => onRenameCommit(entry.path, renameDraft)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') onRenameCommit(entry.path, renameDraft);
                                if (e.key === 'Escape') onRenameCancel();
                              }}
                            />
                          ) : (
                            <>
                              <span className="entry-name" title={entry.name}>
                                {formatDisplayName(entry, showExtensions)}
                              </span>
                              {tagColor && (
                                <span
                                  className="entry-tag-dot"
                                  title={FILE_TAGS[tagColor].label}
                                  style={{
                                    background: FILE_TAGS[tagColor].color,
                                    boxShadow: `0 0 8px ${FILE_TAGS[tagColor].glow}`,
                                  }}
                                />
                              )}
                              {showHoverActions && (
                                <div className="row-hover-actions">
                                  <button
                                    className="row-act-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onQuickLook(entry);
                                    }}
                                    title="QuickLook (Space)"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  {entry.isDir && (
                                    <button
                                      className={`row-act-btn ${isEntryPinned ? 'pinned' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onPinToggle(entry.path);
                                      }}
                                      title={isEntryPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                                    >
                                      <Pin size={12} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="col-date cell-muted">{formatDate(entry.modifiedMs)}</div>
                        <div className="col-type cell-muted">
                          {entry.isDir
                            ? 'File folder'
                            : entry.extension
                            ? `${entry.extension.toUpperCase()} File`
                            : 'File'}
                        </div>
                        <div className="col-size cell-muted">
                          {entry.isDir
                            ? folderSizes[entry.path] !== undefined
                              ? formatBytes(folderSizes[entry.path])
                              : ''
                            : formatBytes(entry.size)}
                        </div>
                      </div>
                    );
                  }

                  // GRID VIEW (medium / large / xlarge)
                  const gRow = gridRows[vItem.index];
                  if (!gRow) return null;

                  if (gRow.kind === 'group') {
                    const collapsed = collapsedGroups.has(gRow.id);
                    return (
                      <div
                        key={`gg-${gRow.id}`}
                        className="group-header-row"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${vItem.size}px`,
                          transform: `translateY(${vItem.start}px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(gRow.id);
                        }}
                      >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span className="group-title">{gRow.label}</span>
                        <span className="group-count">{gRow.count}</span>
                        <span className="group-line" />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`gr-${vItem.index}`}
                      className="grid-row"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${vItem.size}px`,
                        transform: `translateY(${vItem.start}px)`,
                        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                      }}
                    >
                      {gRow.items.map((entry) => {
                        const selected = selectedPaths.has(entry.path);
                        const isCut = cutPaths.has(entry.path);
                        const isRenaming = renamingPath === entry.path;
                        const isDropTarget = entry.isDir && dragOverFolder === entry.path;
                        const tagColor = fileTags[entry.path.toLowerCase()];

                        return (
                          <div
                            key={entry.path}
                            data-entry-path={entry.path}
                            className={`grid-card ${selected ? 'selected' : ''} ${
                              isCut ? 'cut' : ''
                            } ${isDropTarget ? 'drop-target' : ''}`}
                            draggable={!isRenaming}
                            onDragStart={(e) => handleDragStart(e, entry)}
                            onDragOver={(e) => {
                              if (
                                entry.isDir &&
                                e.dataTransfer.types.includes('application/x-velo-paths')
                              ) {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverFolder(entry.path);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverFolder === entry.path) setDragOverFolder(null);
                            }}
                            onDrop={(e) => {
                              if (entry.isDir) handlePaneDrop(e, entry.path);
                            }}
                            onClick={(e) => handleRowClick(e, entry)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              onOpenEntry(entry);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onActivatePane();
                              if (!selectedPaths.has(entry.path)) {
                                onSelect(new Set([entry.path]), entry.path);
                              }
                              onContextMenu(e, entry);
                            }}
                          >
                            <button
                              className={`row-checkbox grid-cb ${selected ? 'checked' : ''}`}
                              onClick={(e) => toggleCheckbox(e, entry)}
                              tabIndex={-1}
                            >
                              {selected && <Check size={10} strokeWidth={3} />}
                            </button>

                            {showHoverActions && (
                              <button
                                className="grid-ql-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickLook(entry);
                                }}
                                title="QuickLook (Space)"
                              >
                                <Eye size={12} />
                              </button>
                            )}

                            <div
                              className="grid-thumb-wrap"
                              style={{ height: `${gridThumbHeight}px` }}
                            >
                              {isImagePreviewable(entry.extension) ? (
                                <img
                                  className="grid-thumb"
                                  src={api.toAssetUrl(entry.path)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <FileIcon
                                  category={entry.category}
                                  extension={entry.extension}
                                  path={entry.path}
                                  isDir={entry.isDir}
                                  size={gridIconSize}
                                />
                              )}
                              {entry.extension && !entry.isDir && (
                                <span className="grid-ext-badge">{entry.extension}</span>
                              )}
                              {tagColor && (
                                <span
                                  className="grid-tag-dot"
                                  title={FILE_TAGS[tagColor].label}
                                  style={{
                                    background: FILE_TAGS[tagColor].color,
                                    boxShadow: `0 0 8px ${FILE_TAGS[tagColor].glow}`,
                                  }}
                                />
                              )}
                            </div>
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                className="rename-input grid-rename"
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => onRenameCommit(entry.path, renameDraft)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') onRenameCommit(entry.path, renameDraft);
                                  if (e.key === 'Escape') onRenameCancel();
                                }}
                              />
                            ) : (
                              <div className="grid-name" title={entry.name}>
                                {formatDisplayName(entry, showExtensions)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Marquee rubber-band selection box */}
        {marquee && marqueeMovedRef.current && (
          <div
            className="marquee-box"
            style={{
              left: Math.min(marquee.startX, marquee.currX),
              top: Math.min(marquee.startY, marquee.currY),
              width: Math.abs(marquee.currX - marquee.startX),
              height: Math.abs(marquee.currY - marquee.startY),
            }}
          />
        )}
      </div>
    </div>
  );
};
