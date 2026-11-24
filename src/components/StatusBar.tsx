import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import type { ClipboardState, UiStyle, ViewMode } from '../types';
import { formatBytes } from '../utils/format';

interface StatusBarProps {
  uiStyle: UiStyle;
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  selectedSize: number;
  clipboard: ClipboardState | null;
  recursiveSearch: boolean;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  uiStyle,
  totalCount,
  visibleCount,
  selectedCount,
  selectedSize,
  clipboard,
  recursiveSearch,
  viewMode,
  onViewModeChange,
}) => {
  const isGrid = viewMode === 'medium' || viewMode === 'large' || viewMode === 'xlarge';

  return (
    <footer className="statusbar">
      <div className="status-left">
        <span>
          {visibleCount === totalCount
            ? `${totalCount} item${totalCount === 1 ? '' : 's'}`
            : `${visibleCount} of ${totalCount} items`}
        </span>
        {selectedCount > 0 && (
          <>
            <span className="status-pipe">|</span>
            <span>
              {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
              {selectedSize > 0 ? `   ${formatBytes(selectedSize)}` : ''}
            </span>
          </>
        )}
        {recursiveSearch && <span className="status-badge">Deep Search</span>}
        {clipboard && uiStyle !== 'classic-explorer' && (
          <>
            <span className="status-pipe">|</span>
            <span className="status-clip">
              {clipboard.mode === 'cut' ? 'Cut' : 'Copied'} {clipboard.paths.length}
            </span>
          </>
        )}
      </div>

      <div className="status-right">
        {uiStyle !== 'classic-explorer' && (
          <span className="status-hint">Space: QuickLook · Ctrl+K: Commands</span>
        )}
        <div className="status-view-btns">
          <button
            className={`status-view-btn ${!isGrid ? 'active' : ''}`}
            onClick={() => onViewModeChange('details')}
            title="Details view"
          >
            <List size={13} />
          </button>
          <button
            className={`status-view-btn ${isGrid ? 'active' : ''}`}
            onClick={() => onViewModeChange('large')}
            title="Large thumbnails view"
          >
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>
    </footer>
  );
};
