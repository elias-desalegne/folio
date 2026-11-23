import React, { useMemo, useState } from 'react';
import { ArrowRight, Edit3, X } from 'lucide-react';
import type { FileEntry } from '../types';

interface BatchRenameModalProps {
  entries: FileEntry[];
  onClose: () => void;
  onApply: (renames: { oldPath: string; newName: string }[]) => Promise<void>;
}

type Mode = 'replace' | 'affix' | 'sequence';

export const BatchRenameModal: React.FC<BatchRenameModalProps> = ({
  entries,
  onClose,
  onApply,
}) => {
  const [mode, setMode] = useState<Mode>('replace');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [seqBase, setSeqBase] = useState('Item_');
  const [seqStart, setSeqStart] = useState(1);
  const [seqPad, setSeqPad] = useState(2);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    return entries.map((entry, idx) => {
      const dot = !entry.isDir ? entry.name.lastIndexOf('.') : -1;
      const stem = dot > 0 ? entry.name.slice(0, dot) : entry.name;
      const ext = dot > 0 ? entry.name.slice(dot) : '';

      let newName = entry.name;
      if (mode === 'replace') {
        if (findText) {
          newName = stem.split(findText).join(replaceText) + ext;
        }
      } else if (mode === 'affix') {
        newName = `${prefix}${stem}${suffix}${ext}`;
      } else if (mode === 'sequence') {
        const num = String(seqStart + idx).padStart(Math.max(1, seqPad), '0');
        newName = `${seqBase}${num}${ext}`;
      }
      return {
        entry,
        newName: newName.trim() || entry.name,
        changed: newName.trim() !== '' && newName.trim() !== entry.name,
      };
    });
  }, [entries, mode, findText, replaceText, prefix, suffix, seqBase, seqStart, seqPad]);

  const changedItems = preview.filter((p) => p.changed);

  const handleApply = async () => {
    if (changedItems.length === 0) return;
    setBusy(true);
    try {
      await onApply(
        changedItems.map((p) => ({ oldPath: p.entry.path, newName: p.newName }))
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card batch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Edit3 size={16} />
            <h3>Batch Rename ({entries.length} items)</h3>
          </div>
          <button className="tool-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="batch-tabs">
          <button
            className={`batch-tab ${mode === 'replace' ? 'active' : ''}`}
            onClick={() => setMode('replace')}
          >
            Find & Replace
          </button>
          <button
            className={`batch-tab ${mode === 'affix' ? 'active' : ''}`}
            onClick={() => setMode('affix')}
          >
            Prefix / Suffix
          </button>
          <button
            className={`batch-tab ${mode === 'sequence' ? 'active' : ''}`}
            onClick={() => setMode('sequence')}
          >
            Number Sequence
          </button>
        </div>

        {mode === 'replace' && (
          <div className="batch-fields">
            <label>
              <span>Find</span>
              <input
                className="batch-input"
                placeholder="Text to replace..."
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Replace with</span>
              <input
                className="batch-input"
                placeholder="Replacement text..."
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
              />
            </label>
          </div>
        )}

        {mode === 'affix' && (
          <div className="batch-fields">
            <label>
              <span>Prefix</span>
              <input
                className="batch-input"
                placeholder="Add before name..."
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Suffix (before extension)</span>
              <input
                className="batch-input"
                placeholder="Add after name..."
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
              />
            </label>
          </div>
        )}

        {mode === 'sequence' && (
          <div className="batch-fields seq">
            <label>
              <span>Base name</span>
              <input
                className="batch-input"
                value={seqBase}
                onChange={(e) => setSeqBase(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Start at</span>
              <input
                type="number"
                className="batch-input"
                value={seqStart}
                onChange={(e) => setSeqStart(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              <span>Digits</span>
              <input
                type="number"
                min={1}
                max={6}
                className="batch-input"
                value={seqPad}
                onChange={(e) => setSeqPad(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
              />
            </label>
          </div>
        )}

        <div className="batch-preview">
          {preview.slice(0, 40).map((p) => (
            <div key={p.entry.path} className={`batch-preview-row ${p.changed ? 'changed' : ''}`}>
              <span className="bp-old" title={p.entry.name}>
                {p.entry.name}
              </span>
              <ArrowRight size={12} className="bp-arrow" />
              <span className="bp-new" title={p.newName}>
                {p.newName}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <span className="modal-footnote">{changedItems.length} items will be renamed</span>
          <div className="modal-btns">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleApply}
              disabled={busy || changedItems.length === 0}
            >
              {busy ? 'Renaming...' : `Rename ${changedItems.length} Items`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
