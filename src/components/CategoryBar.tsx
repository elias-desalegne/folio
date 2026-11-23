import React, { useMemo } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import type { FileCategory, FileEntry } from '../types';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/format';

interface CategoryBarProps {
  entries: FileEntry[];
  activeCategory: FileCategory | 'all';
  onSelectCategory: (cat: FileCategory | 'all') => void;
  onOpenTidy: () => void;
  canUndoTidy: boolean;
  onUndoTidy: () => void;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  entries,
  activeCategory,
  onSelectCategory,
  onOpenTidy,
  canUndoTidy,
  onUndoTidy,
}) => {
  const counts = useMemo(() => {
    const map: Partial<Record<FileCategory, number>> = {};
    for (const e of entries) {
      map[e.category] = (map[e.category] || 0) + 1;
    }
    return map;
  }, [entries]);

  const presentCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => (counts[c] || 0) > 0),
    [counts]
  );

  const looseFileCount = useMemo(
    () => entries.filter((e) => !e.isDir).length,
    [entries]
  );

  // Only show when there are files of at least 2 different categories (or undo is available)
  if (presentCategories.length < 2 && !canUndoTidy) {
    return null;
  }

  return (
    <div className="category-bar">
      <div className="category-pills">
        <button
          className={`cat-pill ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => onSelectCategory('all')}
        >
          <span>All</span>
          <span className="cat-count">{entries.length}</span>
        </button>

        {(counts.folder || 0) > 0 && (
          <button
            className={`cat-pill ${activeCategory === 'folder' ? 'active' : ''}`}
            onClick={() => onSelectCategory(activeCategory === 'folder' ? 'all' : 'folder')}
          >
            <span className="cat-dot" style={{ background: CATEGORY_META.folder.color }} />
            <span>Folders</span>
            <span className="cat-count">{counts.folder}</span>
          </button>
        )}

        {presentCategories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              className={`cat-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory(isActive ? 'all' : cat)}
            >
              <span className="cat-dot" style={{ background: meta.color }} />
              <span>{meta.label}</span>
              <span className="cat-count">{counts[cat]}</span>
            </button>
          );
        })}
      </div>

      <div className="category-actions">
        {canUndoTidy && (
          <button className="tidy-btn undo" onClick={onUndoTidy} title="Undo last Tidy operation">
            <Undo2 size={13} />
            <span>Undo Tidy</span>
          </button>
        )}
        {looseFileCount >= 3 && (
          <button
            className="tidy-btn"
            onClick={onOpenTidy}
            title="Organize loose files in this folder into clean subfolders by type"
          >
            <Sparkles size={13} />
            <span>Tidy Folder</span>
          </button>
        )}
      </div>
    </div>
  );
};
