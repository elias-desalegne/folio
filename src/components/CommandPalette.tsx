import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Columns2,
  Folder,
  FolderPlus,
  HardDrive,
  PanelRight,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { DriveInfo, QuickAccessItem } from '../types';

export interface PaletteAction {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  quickAccess: QuickAccessItem[];
  drives: DriveInfo[];
  pinnedPaths: string[];
  onNavigate: (path: string) => void;
  onNewFolder: () => void;
  onToggleSplit: () => void;
  onTogglePreview: () => void;
  onCycleEffect: () => void;
  onOpenTerminal: () => void;
  onOpenTidy: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  quickAccess,
  drives,
  pinnedPaths,
  onNavigate,
  onNewFolder,
  onToggleSplit,
  onTogglePreview,
  onCycleEffect,
  onOpenTerminal,
  onOpenTidy,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [
      {
        id: 'act-tidy',
        label: 'Tidy Current Folder',
        subtitle: 'Organize loose files into clean subfolders by type',
        icon: <Sparkles size={15} />,
        run: onOpenTidy,
      },
      {
        id: 'act-new-folder',
        label: 'New Folder',
        subtitle: 'Ctrl+Shift+N',
        icon: <FolderPlus size={15} />,
        run: onNewFolder,
      },
      {
        id: 'act-split',
        label: 'Toggle Split Pane',
        subtitle: 'Ctrl+\\',
        icon: <Columns2 size={15} />,
        run: onToggleSplit,
      },
      {
        id: 'act-preview',
        label: 'Toggle Preview Pane',
        subtitle: 'Alt+P',
        icon: <PanelRight size={15} />,
        run: onTogglePreview,
      },
      {
        id: 'act-effect',
        label: 'Cycle Window Translucency',
        subtitle: 'Acrylic / Mica / Mica Alt / Solid',
        icon: <Sparkles size={15} />,
        run: onCycleEffect,
      },
      {
        id: 'act-term',
        label: 'Open Terminal Here',
        subtitle: 'Launch Windows Terminal in current directory',
        icon: <Terminal size={15} />,
        run: onOpenTerminal,
      },
    ];

    for (const q of quickAccess) {
      list.push({
        id: `qa-${q.path}`,
        label: `Go to ${q.name}`,
        subtitle: q.path,
        icon: <Folder size={15} />,
        run: () => onNavigate(q.path),
      });
    }

    for (const p of pinnedPaths) {
      list.push({
        id: `pin-${p}`,
        label: `Go to ${p.split(/[\\/]/).pop() || p}`,
        subtitle: p,
        icon: <Folder size={15} />,
        run: () => onNavigate(p),
      });
    }

    for (const d of drives) {
      list.push({
        id: `drv-${d.mountPoint}`,
        label: `Go to ${d.name}`,
        subtitle: d.mountPoint,
        icon: <HardDrive size={15} />,
        run: () => onNavigate(d.mountPoint),
      });
    }

    return list;
  }, [
    quickAccess,
    drives,
    pinnedPaths,
    onNavigate,
    onNewFolder,
    onToggleSplit,
    onTogglePreview,
    onCycleEffect,
    onOpenTerminal,
    onOpenTidy,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.subtitle?.toLowerCase().includes(q)
    );
  }, [actions, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const runItem = (item?: PaletteAction) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Jump to folder or run a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runItem(filtered[activeIdx]);
              }
            }}
          />
        </div>

        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">No matching commands or folders</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                className={`palette-item ${idx === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => runItem(item)}
              >
                <span className="palette-item-icon">{item.icon}</span>
                <span className="palette-item-label">{item.label}</span>
                {item.subtitle && <span className="palette-item-sub">{item.subtitle}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
