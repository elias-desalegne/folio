import React, { useEffect, useState } from 'react';
import { ExternalLink, Eye, FolderOpen, Pin, X } from 'lucide-react';
import type { FileEntry, FileTagColor, FolderSummary, TextPreview } from '../types';
import { api } from '../api';
import {
  CATEGORY_META,
  FILE_TAGS,
  FILE_TAG_ORDER,
  formatBytes,
  formatDate,
  isAudioPreviewable,
  isImagePreviewable,
  isTextPreviewable,
  isVideoPreviewable,
} from '../utils/format';
import { FileIcon } from './FileIcon';

interface PreviewPaneProps {
  entry: FileEntry | null;
  selectedCount: number;
  selectedTotalSize: number;
  activeTag: FileTagColor | null;
  isPinned: boolean;
  onClose: () => void;
  onOpenQuickLook: (entry: FileEntry) => void;
  onOpenExternal: (entry: FileEntry) => void;
  onSetTag: (color: FileTagColor | null) => void;
  onPinToggle: (path: string) => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  entry,
  selectedCount,
  selectedTotalSize,
  activeTag,
  isPinned,
  onClose,
  onOpenQuickLook,
  onOpenExternal,
  onSetTag,
  onPinToggle,
}) => {
  const [textSnippet, setTextSnippet] = useState<TextPreview | null>(null);
  const [folderSummary, setFolderSummary] = useState<FolderSummary | null>(null);

  useEffect(() => {
    setTextSnippet(null);
    setFolderSummary(null);
    if (!entry) return;
    let cancelled = false;

    if (entry.isDir) {
      api
        .getFolderSummary(entry.path)
        .then((res) => !cancelled && setFolderSummary(res))
        .catch(() => {});
    } else if (isTextPreviewable(entry.extension, entry.category) && entry.extension !== 'pdf') {
      api
        .readTextPreview(entry.path, 16_384)
        .then((res) => !cancelled && setTextSnippet(res))
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <aside className="preview-pane">
      <div className="preview-header">
        <span>Details</span>
        <button className="tool-btn" onClick={onClose} title="Close details pane (Alt+P)">
          <X size={14} />
        </button>
      </div>

      {!entry ? (
        <div className="preview-empty">
          <Eye size={28} className="empty-icon" />
          <p>Select an item to inspect</p>
          <span className="hint-chip">Press Space for QuickLook</span>
        </div>
      ) : selectedCount > 1 ? (
        <div className="preview-empty">
          <FolderOpen size={36} className="empty-icon" />
          <p>{selectedCount} items selected</p>
          <span className="preview-sub">{formatBytes(selectedTotalSize)} total</span>
        </div>
      ) : (
        <div key={entry.path} className="preview-content preview-fade">
          <div className="preview-visual">
            {!entry.isDir && isImagePreviewable(entry.extension) ? (
              <img
                src={api.toAssetUrl(entry.path)}
                alt={entry.name}
                className="preview-img"
                onClick={() => onOpenQuickLook(entry)}
              />
            ) : !entry.isDir && isVideoPreviewable(entry.extension) ? (
              <video
                key={entry.path}
                src={api.toAssetUrl(entry.path)}
                controls
                className="preview-video"
              />
            ) : !entry.isDir && isAudioPreviewable(entry.extension) ? (
              <div className="preview-audio-box">
                <FileIcon
                  category="audio"
                  extension={entry.extension}
                  path={entry.path}
                  size={44}
                />
                <audio
                  key={entry.path}
                  src={api.toAssetUrl(entry.path)}
                  controls
                  style={{ width: '100%' }}
                />
              </div>
            ) : textSnippet ? (
              <pre className="preview-text" onClick={() => onOpenQuickLook(entry)}>
                {textSnippet.content}
              </pre>
            ) : (
              <div className="preview-icon-hero" onClick={() => onOpenQuickLook(entry)}>
                <FileIcon
                  category={entry.category}
                  extension={entry.extension}
                  path={entry.path}
                  isDir={entry.isDir}
                  size={60}
                />
              </div>
            )}
          </div>

          <div className="preview-name" title={entry.name}>
            {entry.name}
          </div>

          <div className="preview-actions">
            <button className="btn-ghost sm" onClick={() => onOpenQuickLook(entry)}>
              <Eye size={13} />
              <span>QuickLook</span>
            </button>
            <button className="btn-ghost sm" onClick={() => onOpenExternal(entry)}>
              <ExternalLink size={13} />
              <span>Open</span>
            </button>
          </div>

          {entry.isDir && (
            <button
              className="btn-ghost sm"
              style={{ flex: 'none' }}
              onClick={() => onPinToggle(entry.path)}
            >
              <Pin size={13} />
              <span>{isPinned ? 'Unpin from Sidebar' : 'Pin to Sidebar'}</span>
            </button>
          )}

          <div className="preview-tag-bar">
            <span className="preview-tag-label">Color Tag</span>
            <div className="ctx-tag-dots">
              {FILE_TAG_ORDER.map((c) => (
                <button
                  key={c}
                  className={`ctx-tag-dot ${activeTag === c ? 'active' : ''}`}
                  style={{ background: FILE_TAGS[c].color }}
                  title={FILE_TAGS[c].label}
                  onClick={() => onSetTag(activeTag === c ? null : c)}
                />
              ))}
            </div>
          </div>

          <div className="preview-meta-list">
            <div className="meta-row">
              <span>Kind</span>
              <span>
                {entry.isDir
                  ? 'Folder'
                  : `${CATEGORY_META[entry.category]?.label || 'File'}${
                      entry.extension ? ` (.${entry.extension})` : ''
                    }`}
              </span>
            </div>
            {!entry.isDir ? (
              <div className="meta-row">
                <span>Size</span>
                <span>{formatBytes(entry.size)}</span>
              </div>
            ) : folderSummary ? (
              <div className="meta-row">
                <span>Contains</span>
                <span>
                  {folderSummary.dirCount} folders, {folderSummary.fileCount} files
                </span>
              </div>
            ) : null}
            <div className="meta-row">
              <span>Modified</span>
              <span>{formatDate(entry.modifiedMs)}</span>
            </div>
            <div className="meta-row">
              <span>Created</span>
              <span>{formatDate(entry.createdMs)}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
