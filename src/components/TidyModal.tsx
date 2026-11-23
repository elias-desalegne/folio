import React, { useMemo, useState } from 'react';
import { Check, FolderInput, Sparkles, X } from 'lucide-react';
import type { BatchMoveItem, FileCategory, FileEntry } from '../types';
import { CATEGORY_META, CATEGORY_ORDER, getPathBasename, joinWinPath } from '../utils/format';

interface TidyModalProps {
  folderPath: string;
  entries: FileEntry[];
  onClose: () => void;
  onExecute: (moves: BatchMoveItem[]) => Promise<void>;
}

export const TidyModal: React.FC<TidyModalProps> = ({
  folderPath,
  entries,
  onClose,
  onExecute,
}) => {
  const looseFiles = useMemo(() => entries.filter((e) => !e.isDir), [entries]);

  const grouped = useMemo(() => {
    const map = new Map<FileCategory, FileEntry[]>();
    for (const f of looseFiles) {
      const list = map.get(f.category) || [];
      list.push(f);
      map.set(f.category, list);
    }
    return CATEGORY_ORDER.filter((c) => (map.get(c)?.length || 0) > 0).map((cat) => ({
      category: cat,
      folderName: CATEGORY_META[cat].folderName,
      color: CATEGORY_META[cat].color,
      files: map.get(cat)!,
    }));
  }, [looseFiles]);

  const [selectedCats, setSelectedCats] = useState<Set<FileCategory>>(
    () => new Set(grouped.map((g) => g.category))
  );
  const [busy, setBusy] = useState(false);

  const toggleCat = (cat: FileCategory) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const plannedMoves = useMemo<BatchMoveItem[]>(() => {
    const moves: BatchMoveItem[] = [];
    for (const g of grouped) {
      if (!selectedCats.has(g.category)) continue;
      const targetDir = joinWinPath(folderPath, g.folderName);
      for (const file of g.files) {
        moves.push({
          from: file.path,
          to: joinWinPath(targetDir, file.name),
        });
      }
    }
    return moves;
  }, [grouped, selectedCats, folderPath]);

  const handleConfirm = async () => {
    if (plannedMoves.length === 0) return;
    setBusy(true);
    try {
      await onExecute(plannedMoves);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card tidy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Sparkles size={17} className="accent-icon" />
            <h3>Tidy "{getPathBasename(folderPath)}"</h3>
          </div>
          <button className="tool-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <p className="modal-desc">
          Move loose files into clean category subfolders. Existing folders won't be touched, and
          you can undo with one click right after.
        </p>

        <div className="tidy-list">
          {grouped.map((g) => {
            const checked = selectedCats.has(g.category);
            return (
              <div
                key={g.category}
                className={`tidy-row ${checked ? 'checked' : ''}`}
                onClick={() => toggleCat(g.category)}
              >
                <div className={`tidy-check ${checked ? 'on' : ''}`}>
                  {checked && <Check size={12} />}
                </div>
                <span className="cat-dot" style={{ background: g.color }} />
                <div className="tidy-row-info">
                  <div className="tidy-row-title">
                    <FolderInput size={13} />
                    <span>{g.folderName}/</span>
                  </div>
                  <div className="tidy-row-samples">
                    {g.files
                      .slice(0, 3)
                      .map((f) => f.name)
                      .join(', ')}
                    {g.files.length > 3 ? ` +${g.files.length - 3} more` : ''}
                  </div>
                </div>
                <span className="tidy-count">{g.files.length}</span>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <span className="modal-footnote">{plannedMoves.length} files will be organized</span>
          <div className="modal-btns">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleConfirm}
              disabled={busy || plannedMoves.length === 0}
            >
              {busy ? 'Organizing...' : `Organize ${plannedMoves.length} Files`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
