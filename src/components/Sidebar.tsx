import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Film,
  Globe,
  HardDrive,
  Home,
  Image,
  Images,
  Monitor,
  Music,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Usb,
} from 'lucide-react';
import type { DriveInfo, QuickAccessItem, UiStyle } from '../types';
import { formatBytes, getPathBasename } from '../utils/format';
import { FluentFolderIcon } from './FileIcon';
import {
  Win11DesktopIcon,
  Win11DocumentsIcon,
  Win11DownloadsIcon,
  Win11DriveIcon,
  Win11GalleryIcon,
  Win11HomeIcon,
  Win11MusicIcon,
  Win11NetworkIcon,
  Win11PicturesIcon,
  Win11RecycleBinIcon,
  Win11ThisPcIcon,
  Win11VideosIcon,
} from './Win11Icons';

interface SidebarProps {
  uiStyle: UiStyle;
  currentPath: string;
  quickAccess: QuickAccessItem[];
  pinnedPaths: string[];
  recentPaths: string[];
  drives: DriveInfo[];
  canPinCurrent: boolean;
  isCurrentPinned: boolean;
  onNavigate: (path: string) => void;
  onPinPath: (path: string) => void;
  onUnpin: (path: string) => void;
  onMovePin: (path: string, delta: -1 | 1) => void;
  onDropFilesToPath: (sourcePaths: string[], destPath: string) => void;
  onOpenSpecial: (target: 'recycle-bin' | 'network') => void;
}

function renderQuickIcon(icon: string, classic: boolean) {
  if (classic) {
    switch (icon) {
      case 'monitor':
        return <Win11DesktopIcon size={15} />;
      case 'download':
        return <Win11DownloadsIcon size={15} />;
      case 'file-text':
        return <Win11DocumentsIcon size={15} />;
      case 'image':
        return <Win11PicturesIcon size={15} />;
      case 'music':
        return <Win11MusicIcon size={15} />;
      case 'film':
        return <Win11VideosIcon size={15} />;
      default:
        return <FluentFolderIcon size={15} />;
    }
  }
  switch (icon) {
    case 'monitor':
      return <Monitor size={15} style={{ color: '#60a5fa' }} />;
    case 'download':
      return <Download size={15} style={{ color: '#38bdf8' }} />;
    case 'file-text':
      return <FileText size={15} style={{ color: '#d4d4d8' }} />;
    case 'image':
      return <Image size={15} style={{ color: '#60a5fa' }} />;
    case 'music':
      return <Music size={15} style={{ color: '#f472b6' }} />;
    case 'film':
      return <Film size={15} style={{ color: '#c084fc' }} />;
    default:
      return <FluentFolderIcon size={15} />;
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  uiStyle,
  currentPath,
  quickAccess,
  pinnedPaths,
  recentPaths,
  drives,
  canPinCurrent,
  isCurrentPinned,
  onNavigate,
  onPinPath,
  onUnpin,
  onMovePin,
  onDropFilesToPath,
  onOpenSpecial,
}) => {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [pinZoneDragOver, setPinZoneDragOver] = useState(false);
  const [thisPcExpanded, setThisPcExpanded] = useState(true);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const normalize = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
  const activeNorm = normalize(currentPath);

  const makeDropHandlers = (targetPath: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-velo-paths')) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDragOverPath(targetPath);
        setPinZoneDragOver(false);
      }
    },
    onDragLeave: () => {
      if (dragOverPath === targetPath) setDragOverPath(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverPath(null);
      setPinZoneDragOver(false);
      const raw = e.dataTransfer.getData('application/x-velo-paths');
      if (raw) {
        try {
          const paths = JSON.parse(raw) as string[];
          if (paths.length > 0) {
            onDropFilesToPath(paths, targetPath);
          }
        } catch {
          // ignore
        }
      }
    },
  });

  const handlePinZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setPinZoneDragOver(false);
    const folderRaw = e.dataTransfer.getData('application/x-velo-folder');
    if (folderRaw) {
      onPinPath(folderRaw);
    }
  };

  const standardFolders = quickAccess.filter((q) => q.name !== 'Home');
  const standardFolderNorms = new Set(standardFolders.map((q) => normalize(q.path)));
  const extraPinnedPaths = pinnedPaths.filter((p) => !standardFolderNorms.has(normalize(p)));

  const pinZoneDropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-velo-folder')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
        setPinZoneDragOver(true);
      }
    },
    onDragLeave: () => setPinZoneDragOver(false),
    onDrop: handlePinZoneDrop,
  };

  return (
    <aside className="sidebar">
      {/* Top: Home & Gallery */}
      <div className="sidebar-section">
        <button
          className={`sidebar-item ${currentPath === 'velo://home' ? 'active' : ''}`}
          onClick={() => onNavigate('velo://home')}
        >
          <span className="sidebar-icon">
            {uiStyle === 'classic-explorer' ? (
              <Win11HomeIcon size={15} />
            ) : (
              <Home size={15} style={{ color: '#93c5fd' }} />
            )}
          </span>
          <span className="sidebar-label">Home</span>
        </button>
        <button
          className={`sidebar-item ${currentPath === 'velo://gallery' ? 'active' : ''}`}
          onClick={() => onNavigate('velo://gallery')}
        >
          <span className="sidebar-icon">
            {uiStyle === 'classic-explorer' ? (
              <Win11GalleryIcon size={15} />
            ) : (
              <Images size={15} style={{ color: '#60a5fa' }} />
            )}
          </span>
          <span className="sidebar-label">Gallery</span>
        </button>
      </div>

      <div className="sidebar-sep" />

      {/* Standard Quick Access folders + Pinned folders (in Classic Explorer mode) + Recycle Bin */}
      <div
        className={`sidebar-section ${
          uiStyle === 'classic-explorer' && pinZoneDragOver ? 'pin-drop-active' : ''
        }`}
        {...(uiStyle === 'classic-explorer' ? pinZoneDropHandlers : {})}
      >
        {standardFolders.map((item) => {
          const isActive = normalize(item.path) === activeNorm;
          const isDragOver = dragOverPath === item.path;
          return (
            <button
              key={item.path}
              className={`sidebar-item ${isActive ? 'active' : ''} ${
                isDragOver ? 'drop-target' : ''
              }`}
              onClick={() => onNavigate(item.path)}
              title={item.path}
              {...makeDropHandlers(item.path)}
            >
              <span className="sidebar-icon">
                {renderQuickIcon(item.icon, uiStyle === 'classic-explorer')}
              </span>
              <span className="sidebar-label">{item.name}</span>
              <Pin size={10} className="sidebar-pin-mark" />
            </button>
          );
        })}

        {uiStyle === 'classic-explorer' &&
          extraPinnedPaths.map((p) => {
            const isActive = normalize(p) === activeNorm;
            const isDragOver = dragOverPath === p;
            return (
              <div
                key={`pin-${normalize(p)}`}
                className={`sidebar-item pinned ${isActive ? 'active' : ''} ${
                  isDragOver ? 'drop-target' : ''
                }`}
                onClick={() => onNavigate(p)}
                title={p}
                {...makeDropHandlers(p)}
              >
                <span className="sidebar-icon">
                  <FluentFolderIcon size={15} />
                </span>
                <span className="sidebar-label">{getPathBasename(p)}</span>
                <span
                  className="sidebar-pin-mark"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnpin(p);
                  }}
                  title="Unpin from Quick access"
                >
                  <Pin size={10} />
                </span>
              </div>
            );
          })}

        <button
          className="sidebar-item"
          onClick={() => onOpenSpecial('recycle-bin')}
          title="Open Windows Recycle Bin"
        >
          <span className="sidebar-icon">
            {uiStyle === 'classic-explorer' ? (
              <Win11RecycleBinIcon size={15} />
            ) : (
              <Trash2 size={15} style={{ color: '#a1a1aa' }} />
            )}
          </span>
          <span className="sidebar-label">Recycle Bin</span>
        </button>
      </div>

      {uiStyle !== 'classic-explorer' && (
        <>
          <div className="sidebar-sep" />

          {/* Dedicated Pinned Folders section with drag-to-pin & 1-click pin */}
          <div
            className={`sidebar-section sidebar-pin-section ${pinZoneDragOver ? 'pin-drop-active' : ''}`}
            {...pinZoneDropHandlers}
          >
            <div className="sidebar-section-header">
              <button
                className="sidebar-section-toggle"
                onClick={() => setPinnedExpanded((x) => !x)}
              >
                {pinnedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Pinned</span>
                {pinnedPaths.length > 0 && (
                  <span className="sidebar-count">{pinnedPaths.length}</span>
                )}
              </button>
              {canPinCurrent && !isCurrentPinned && (
                <button
                  className="sidebar-pin-add"
                  onClick={() => onPinPath(currentPath)}
                  title={`Pin "${getPathBasename(currentPath)}" to sidebar`}
                >
                  <Plus size={12} />
                  <span>Pin</span>
                </button>
              )}
            </div>

            {pinnedExpanded && (
              <>
                {pinnedPaths.length === 0 ? (
                  <div className="sidebar-pin-empty">
                    Drag a folder here or click <strong>+ Pin</strong>
                  </div>
                ) : (
                  pinnedPaths.map((p, idx) => {
                    const isActive = normalize(p) === activeNorm;
                    const isDragOver = dragOverPath === p;
                    return (
                      <div
                        key={p}
                        className={`sidebar-item pinned ${isActive ? 'active' : ''} ${
                          isDragOver ? 'drop-target' : ''
                        }`}
                        onClick={() => onNavigate(p)}
                        title={p}
                        {...makeDropHandlers(p)}
                      >
                        <span className="sidebar-icon">
                          <FluentFolderIcon size={15} />
                        </span>
                        <span className="sidebar-label">{getPathBasename(p)}</span>
                        <div className="sidebar-pin-controls">
                          {idx > 0 && (
                            <button
                              className="sidebar-mini-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMovePin(p, -1);
                              }}
                              title="Move up"
                            >
                              <ArrowUp size={11} />
                            </button>
                          )}
                          {idx < pinnedPaths.length - 1 && (
                            <button
                              className="sidebar-mini-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMovePin(p, 1);
                              }}
                              title="Move down"
                            >
                              <ArrowDown size={11} />
                            </button>
                          )}
                          <button
                            className="sidebar-mini-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnpin(p);
                            }}
                            title="Unpin"
                          >
                            <PinOff size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* Recent Folders (collapsible) */}
          {recentPaths.length > 0 && (
            <>
              <div className="sidebar-sep" />
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <button
                    className="sidebar-section-toggle"
                    onClick={() => setRecentExpanded((x) => !x)}
                  >
                    {recentExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>Recent</span>
                  </button>
                </div>
                {recentExpanded &&
                  recentPaths.slice(0, 6).map((p) => {
                    const isActive = normalize(p) === activeNorm;
                    return (
                      <button
                        key={p}
                        className={`sidebar-item ${isActive ? 'active' : ''}`}
                        onClick={() => onNavigate(p)}
                        title={p}
                      >
                        <span className="sidebar-icon">
                          <Clock size={13} style={{ color: '#a1a1aa' }} />
                        </span>
                        <span className="sidebar-label">{getPathBasename(p)}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </>
      )}

      <div className="sidebar-sep" />

      {/* This PC (expandable with drives + sleek storage bars) + Network */}
      <div className="sidebar-section">
        <div
          className={`sidebar-item tree-parent ${currentPath === 'velo://this-pc' ? 'active' : ''}`}
          onClick={() => onNavigate('velo://this-pc')}
        >
          <button
            className="tree-chevron"
            onClick={(e) => {
              e.stopPropagation();
              setThisPcExpanded((x) => !x);
            }}
            title={thisPcExpanded ? 'Collapse' : 'Expand'}
          >
            {thisPcExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span className="sidebar-icon">
            {uiStyle === 'classic-explorer' ? (
              <Win11ThisPcIcon size={15} />
            ) : (
              <Monitor size={15} style={{ color: '#93c5fd' }} />
            )}
          </span>
          <span className="sidebar-label">This PC</span>
        </div>

        {thisPcExpanded &&
          drives.map((drive) => {
            const isActive = normalize(drive.mountPoint) === activeNorm;
            const isDragOver = dragOverPath === drive.mountPoint;
            const used = drive.totalSpace - drive.availableSpace;
            const pct = drive.totalSpace > 0 ? Math.min(100, (used / drive.totalSpace) * 100) : 0;
            const isOsDrive = drive.mountPoint.toUpperCase().startsWith('C:');
            return (
              <button
                key={drive.mountPoint}
                className={`sidebar-drive tree-child ${isActive ? 'active' : ''} ${
                  isDragOver ? 'drop-target' : ''
                }`}
                onClick={() => onNavigate(drive.mountPoint)}
                title={`${drive.name} — ${formatBytes(drive.availableSpace)} free of ${formatBytes(
                  drive.totalSpace
                )}`}
                {...makeDropHandlers(drive.mountPoint)}
              >
                <div className="drive-top">
                  <span className="sidebar-icon">
                    {uiStyle === 'classic-explorer' ? (
                      <Win11DriveIcon size={15} isOsDrive={isOsDrive} />
                    ) : drive.isRemovable ? (
                      <Usb size={14} style={{ color: '#a1a1aa' }} />
                    ) : (
                      <HardDrive size={14} style={{ color: '#a1a1aa' }} />
                    )}
                  </span>
                  <span className="sidebar-label">{drive.name}</span>
                </div>
                {uiStyle !== 'classic-explorer' && (
                  <div className="drive-bar-track">
                    <div
                      className={`drive-bar-fill ${pct > 88 ? 'warn' : ''}`}
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}

        <button
          className={`sidebar-item ${uiStyle === 'classic-explorer' ? 'tree-parent' : ''}`}
          onClick={() => onOpenSpecial('network')}
          title="Open Network in Windows Explorer"
        >
          {uiStyle === 'classic-explorer' && (
            <span className="tree-chevron">
              <ChevronRight size={13} />
            </span>
          )}
          <span className="sidebar-icon">
            {uiStyle === 'classic-explorer' ? (
              <Win11NetworkIcon size={15} />
            ) : (
              <Globe size={15} style={{ color: '#60a5fa' }} />
            )}
          </span>
          <span className="sidebar-label">Network</span>
        </button>
      </div>
    </aside>
  );
};
