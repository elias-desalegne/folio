import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Monitor,
  Pin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { UiStyle } from '../types';
import { api } from '../api';
import { getPathBasename, getPathBreadcrumbs, joinWinPath } from '../utils/format';
import { FluentFolderIcon } from './FileIcon';

interface ToolbarProps {
  uiStyle: UiStyle;
  path: string;
  canBack: boolean;
  canForward: boolean;
  canUp: boolean;
  isCurrentPinned: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onTogglePinCurrent: () => void;
  filter: string;
  onFilterChange: (val: string) => void;
  recursiveSearch: boolean;
  onToggleRecursiveSearch: () => void;
  searching: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  pathInputTrigger: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  uiStyle,
  path,
  canBack,
  canForward,
  canUp,
  isCurrentPinned,
  onBack,
  onForward,
  onUp,
  onNavigate,
  onRefresh,
  onTogglePinCurrent,
  filter,
  onFilterChange,
  recursiveSearch,
  onToggleRecursiveSearch,
  searching,
  searchInputRef,
  pathInputTrigger,
}) => {
  const [editingPath, setEditingPath] = useState(false);
  const [draftPath, setDraftPath] = useState(path);
  const [crumbMenu, setCrumbMenu] = useState<{
    parentPath: string;
    x: number;
    y: number;
    items: string[];
    loading: boolean;
  } | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftPath(path);
    setCrumbMenu(null);
  }, [path]);

  useEffect(() => {
    if (!crumbMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.crumb-dropdown, .crumb-sep-btn')) {
        setCrumbMenu(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [crumbMenu]);

  useEffect(() => {
    if (pathInputTrigger > 0) {
      setEditingPath(true);
      setTimeout(() => {
        pathInputRef.current?.focus();
        pathInputRef.current?.select();
      }, 10);
    }
  }, [pathInputTrigger]);

  const crumbs = getPathBreadcrumbs(path);
  const folderLabel = getPathBasename(path);
  const isVirtual = path.startsWith('velo://');

  const commitPath = () => {
    setEditingPath(false);
    const trimmed = draftPath.trim();
    if (trimmed && trimmed !== path) {
      onNavigate(trimmed);
    }
  };

  const openCrumbDropdown = async (e: React.MouseEvent, parentPath: string) => {
    e.stopPropagation();
    if (parentPath.startsWith('velo://')) return;
    if (crumbMenu?.parentPath === parentPath) {
      setCrumbMenu(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCrumbMenu({
      parentPath,
      x: Math.min(rect.left, window.innerWidth - 230),
      y: rect.bottom + 6,
      items: [],
      loading: true,
    });
    try {
      const dirs = await api.listSubfolders(parentPath);
      setCrumbMenu((prev) =>
        prev && prev.parentPath === parentPath ? { ...prev, items: dirs, loading: false } : prev
      );
    } catch {
      setCrumbMenu(null);
    }
  };

  return (
    <div className="toolbar">
      <div className="nav-buttons">
        <button className="tool-btn" disabled={!canBack} onClick={onBack} title="Back (Alt+Left)">
          <ArrowLeft size={15} />
        </button>
        <button
          className="tool-btn"
          disabled={!canForward}
          onClick={onForward}
          title="Forward (Alt+Right)"
        >
          <ArrowRight size={15} />
        </button>
        <button className="tool-btn" disabled={!canUp} onClick={onUp} title="Up (Alt+Up)">
          <ArrowUp size={15} />
        </button>
        <button className="tool-btn" onClick={onRefresh} title="Refresh (F5)">
          <RefreshCw size={14} />
        </button>
      </div>

      <div
        className={`address-bar ${editingPath ? 'editing' : ''}`}
        onClick={() => {
          if (!editingPath && !isVirtual) {
            setEditingPath(true);
            setTimeout(() => {
              pathInputRef.current?.focus();
              pathInputRef.current?.select();
            }, 10);
          }
        }}
      >
        {editingPath ? (
          <input
            ref={pathInputRef}
            className="address-input"
            value={draftPath}
            onChange={(e) => setDraftPath(e.target.value)}
            onBlur={commitPath}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPath();
              if (e.key === 'Escape') {
                setDraftPath(path);
                setEditingPath(false);
              }
            }}
          />
        ) : (
          <>
            <div className="breadcrumbs">
              <Monitor size={14} className="addr-pc-icon" />
              {crumbs.map((c, idx) => (
                <React.Fragment key={c.path}>
                  <button
                    className={`crumb-btn ${idx === crumbs.length - 1 ? 'current' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(c.path);
                    }}
                  >
                    {c.label}
                  </button>
                  {idx < crumbs.length - 1 ? (
                    <button
                      className={`crumb-sep-btn ${
                        crumbMenu?.parentPath === c.path ? 'open' : ''
                      }`}
                      onClick={(e) => openCrumbDropdown(e, c.path)}
                      title={`Subfolders of ${c.label}`}
                    >
                      <ChevronRight size={12} />
                    </button>
                  ) : !isVirtual ? (
                    <button
                      className={`crumb-sep-btn ${
                        crumbMenu?.parentPath === c.path ? 'open' : ''
                      }`}
                      onClick={(e) => openCrumbDropdown(e, c.path)}
                      title={`Jump to subfolder in ${c.label}`}
                    >
                      <ChevronRight size={12} />
                    </button>
                  ) : null}
                </React.Fragment>
              ))}
            </div>

            {!isVirtual && uiStyle !== 'classic-explorer' && (
              <button
                className={`addr-pin-btn ${isCurrentPinned ? 'pinned' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePinCurrent();
                }}
                title={
                  isCurrentPinned
                    ? 'Unpin this folder from sidebar'
                    : 'Pin this folder to sidebar'
                }
              >
                <Pin size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {crumbMenu && (
        <div
          className="crumb-dropdown"
          style={{ left: crumbMenu.x, top: crumbMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {crumbMenu.loading ? (
            <div className="crumb-drop-empty">Loading folders...</div>
          ) : crumbMenu.items.length === 0 ? (
            <div className="crumb-drop-empty">No subfolders</div>
          ) : (
            crumbMenu.items.map((name) => {
              const target = joinWinPath(crumbMenu.parentPath, name);
              const normPath = path.toLowerCase().replace(/[\\/]+$/, '');
              const normTarget = target.toLowerCase().replace(/[\\/]+$/, '');
              const isCurrent =
                normPath === normTarget || normPath.startsWith(`${normTarget}\\`);
              return (
                <button
                  key={name}
                  className={`crumb-drop-item ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    setCrumbMenu(null);
                    onNavigate(target);
                  }}
                >
                  <FluentFolderIcon size={14} />
                  <span>{name}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      <div className={`search-box ${recursiveSearch ? 'recursive' : ''}`}>
        <input
          ref={searchInputRef}
          className="search-input"
          placeholder={recursiveSearch ? `Deep search ${folderLabel}...` : `Search ${folderLabel}`}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onFilterChange('');
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {filter && (
          <button className="search-clear" onClick={() => onFilterChange('')} title="Clear">
            <X size={13} />
          </button>
        )}
        {uiStyle !== 'classic-explorer' && (
          <button
            className={`search-mode-pill ${recursiveSearch ? 'active' : ''}`}
            onClick={onToggleRecursiveSearch}
            title="Toggle deep recursive search across subfolders (Ctrl+Shift+F)"
          >
            Deep
          </button>
        )}
        <Search size={14} className={`search-icon ${searching ? 'spin' : ''}`} />
      </div>
    </div>
  );
};
