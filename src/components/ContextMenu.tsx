import React, { useEffect, useRef } from 'react';
import {
  Clipboard,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FolderArchive,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  Link2,
  Pin,
  Scissors,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { ClipboardState, ContextMenuState, FileEntry, FileTagColor } from '../types';
import { FILE_TAGS, FILE_TAG_ORDER, isZipInspectable } from '../utils/format';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  clipboard: ClipboardState | null;
  selectedCount: number;
  isPinned: boolean;
  activeTag: FileTagColor | null;
  onClose: () => void;
  onOpen: (entry: FileEntry) => void;
  onOpenWith: (entry: FileEntry) => void;
  onQuickLook: (entry: FileEntry) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: (entry: FileEntry) => void;
  onBatchRename: () => void;
  onDuplicate: () => void;
  onCompressZip: () => void;
  onCalcFolderSize: (entry: FileEntry) => void;
  onDelete: (permanent: boolean) => void;
  onCopyPath: (path: string) => void;
  onRevealExplorer: (path: string) => void;
  onOpenTerminal: (path: string) => void;
  onPinToggle: (path: string) => void;
  onSetTag: (color: FileTagColor | null) => void;
  onNewFolder: () => void;
  onExtractZip: (entry: FileEntry) => void;
  onProperties: (path: string) => void;
  currentPath: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  clipboard,
  selectedCount,
  isPinned,
  activeTag,
  onClose,
  onOpen,
  onOpenWith,
  onQuickLook,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onBatchRename,
  onDuplicate,
  onCompressZip,
  onCalcFolderSize,
  onDelete,
  onCopyPath,
  onRevealExplorer,
  onOpenTerminal,
  onPinToggle,
  onSetTag,
  onNewFolder,
  onExtractZip,
  onProperties,
  currentPath,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handle = () => onClose();
    window.addEventListener('click', handle);
    window.addEventListener('blur', handle);
    return () => {
      window.removeEventListener('click', handle);
      window.removeEventListener('blur', handle);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const left = Math.min(menu.x, window.innerWidth - 236);
  const top = Math.min(menu.y, window.innerHeight - 410);
  const entry = menu.entry;

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {entry ? (
        <>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpen(entry);
            }}
          >
            <ExternalLink size={14} />
            <span>Open</span>
            <kbd>Enter</kbd>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onQuickLook(entry);
            }}
          >
            <Eye size={14} />
            <span>QuickLook</span>
            <kbd>Space</kbd>
          </button>
          {!entry.isDir && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onOpenWith(entry);
              }}
            >
              <FolderOpen size={14} />
              <span>Open With...</span>
            </button>
          )}
          {!entry.isDir && isZipInspectable(entry.extension) && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onExtractZip(entry);
              }}
            >
              <FolderArchive size={14} />
              <span>Extract Here</span>
            </button>
          )}
          <div className="ctx-sep" />
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onCut();
            }}
          >
            <Scissors size={14} />
            <span>Cut</span>
            <kbd>Ctrl+X</kbd>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onCopy();
            }}
          >
            <Copy size={14} />
            <span>Copy</span>
            <kbd>Ctrl+C</kbd>
          </button>
          {clipboard && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onPaste();
              }}
            >
              <Clipboard size={14} />
              <span>Paste</span>
              <kbd>Ctrl+V</kbd>
            </button>
          )}
          <div className="ctx-sep" />
          {selectedCount <= 1 ? (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onRename(entry);
              }}
            >
              <Edit3 size={14} />
              <span>Rename</span>
              <kbd>F2</kbd>
            </button>
          ) : (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onBatchRename();
              }}
            >
              <Edit3 size={14} />
              <span>Batch Rename ({selectedCount})...</span>
              <kbd>F2</kbd>
            </button>
          )}
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onDuplicate();
            }}
          >
            <Copy size={14} />
            <span>Duplicate</span>
            <kbd>Ctrl+D</kbd>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onCompressZip();
            }}
          >
            <FolderArchive size={14} />
            <span>Compress to ZIP</span>
          </button>
          {entry.isDir && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onCalcFolderSize(entry);
              }}
            >
              <HardDrive size={14} />
              <span>Calculate Folder Size</span>
            </button>
          )}
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onCopyPath(entry.path);
            }}
          >
            <Link2 size={14} />
            <span>Copy Path</span>
          </button>
          {entry.isDir && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onPinToggle(entry.path);
              }}
            >
              <Pin size={14} />
              <span>{isPinned ? 'Unpin from Sidebar' : 'Pin to Sidebar'}</span>
            </button>
          )}
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenTerminal(entry.isDir ? entry.path : currentPath);
            }}
          >
            <Terminal size={14} />
            <span>Open in Terminal</span>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onRevealExplorer(entry.path);
            }}
          >
            <FolderOpen size={14} />
            <span>Show in Explorer</span>
          </button>
          <div className="ctx-sep" />
          <div className="ctx-tag-row">
            <span className="ctx-tag-label">Tag</span>
            <div className="ctx-tag-dots">
              {FILE_TAG_ORDER.map((c) => (
                <button
                  key={c}
                  className={`ctx-tag-dot ${activeTag === c ? 'active' : ''}`}
                  style={{ background: FILE_TAGS[c].color }}
                  title={FILE_TAGS[c].label}
                  onClick={() => {
                    onSetTag(activeTag === c ? null : c);
                    onClose();
                  }}
                />
              ))}
            </div>
          </div>
          <div className="ctx-sep" />
          <button
            className="ctx-item danger"
            onClick={() => {
              onClose();
              onDelete(false);
            }}
          >
            <Trash2 size={14} />
            <span>Move to Recycle Bin</span>
            <kbd>Del</kbd>
          </button>
          <div className="ctx-sep" />
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onProperties(entry.path);
            }}
          >
            <Info size={14} />
            <span>Properties</span>
            <kbd>Alt+Enter</kbd>
          </button>
        </>
      ) : (
        <>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onNewFolder();
            }}
          >
            <FolderPlus size={14} />
            <span>New Folder</span>
            <kbd>Ctrl+Shift+N</kbd>
          </button>
          {clipboard && (
            <button
              className="ctx-item"
              onClick={() => {
                onClose();
                onPaste();
              }}
            >
              <Clipboard size={14} />
              <span>Paste ({clipboard.paths.length})</span>
              <kbd>Ctrl+V</kbd>
            </button>
          )}
          <div className="ctx-sep" />
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onPinToggle(currentPath);
            }}
          >
            <Pin size={14} />
            <span>{isPinned ? 'Unpin Current Folder' : 'Pin Current Folder'}</span>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenTerminal(currentPath);
            }}
          >
            <Terminal size={14} />
            <span>Open in Terminal</span>
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              onClose();
              onRevealExplorer(currentPath);
            }}
          >
            <FolderOpen size={14} />
            <span>Open in Windows Explorer</span>
          </button>
        </>
      )}
    </div>
  );
};
