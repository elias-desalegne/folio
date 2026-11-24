import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Plus, Square, X } from 'lucide-react';
import type { TabState } from '../types';
import { getPathBasename } from '../utils/format';
import { FluentFolderIcon } from './FileIcon';
import { Win11GalleryIcon, Win11HomeIcon, Win11ThisPcIcon } from './Win11Icons';

interface TitleBarProps {
  tabs: TabState[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleToggleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="tabs-strip" data-tauri-drag-region>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const title = getPathBasename(tab.path);
          return (
            <div
              key={tab.id}
              className={`tab-item ${active ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1 && tabs.length > 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              title={tab.path}
            >
              {tab.path === 'velo://this-pc' ? (
                <Win11ThisPcIcon size={14} />
              ) : tab.path === 'velo://home' ? (
                <Win11HomeIcon size={14} />
              ) : tab.path === 'velo://gallery' ? (
                <Win11GalleryIcon size={14} />
              ) : (
                <FluentFolderIcon size={14} />
              )}
              <span className="tab-label">{title}</span>
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="Close tab (Ctrl+W)"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
        <button className="tab-add" onClick={onNewTab} title="New tab (Ctrl+T)">
          <Plus size={14} />
        </button>
      </div>

      <div className="window-controls">
        <button className="win-btn" onClick={handleMinimize} title="Minimize">
          <Minus size={13} />
        </button>
        <button
          className="win-btn"
          onClick={handleToggleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button className="win-btn close" onClick={handleClose} title="Close">
          <X size={13} />
        </button>
      </div>
    </header>
  );
};
