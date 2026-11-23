import React, { useEffect, useRef, useState } from 'react';
import { Check, FolderCog, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { UserSettings, WindowEffect } from '../types';
import { api } from '../api';

interface SettingsPopoverProps {
  open: boolean;
  windowEffect: WindowEffect;
  showHidden: boolean;
  settings: UserSettings;
  onClose: () => void;
  onSelectEffect: (effect: WindowEffect) => void;
  onToggleHidden: () => void;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onToast: (msg: string) => void;
}

const EFFECTS: { id: WindowEffect; label: string; desc: string }[] = [
  { id: 'acrylic', label: 'Acrylic', desc: 'Frosted obsidian glass' },
  { id: 'mica', label: 'Mica', desc: 'Wallpaper-tinted native' },
  { id: 'tabbed', label: 'Mica Alt', desc: 'Deep translucent layer' },
  { id: 'solid', label: 'Solid', desc: 'Crisp matte obsidian' },
];

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  open,
  windowEffect,
  showHidden,
  settings,
  onClose,
  onSelectEffect,
  onToggleHidden,
  onUpdateSettings,
  onToast,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isDefaultFm, setIsDefaultFm] = useState(false);
  const [togglingDefault, setTogglingDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.isDefaultFileManager().then(setIsDefaultFm).catch(() => {});
  }, [open]);

  const handleToggleDefaultFm = async () => {
    setTogglingDefault(true);
    try {
      const next = await api.setDefaultFileManager(!isDefaultFm);
      setIsDefaultFm(next);
      onToast(
        next
          ? 'Folio is now your default folder handler (reversible anytime)'
          : 'Restored Windows File Explorer as default'
      );
    } catch (e) {
      onToast(String(e));
    } finally {
      setTogglingDefault(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-settings-trigger]')) return;
      if (ref.current && !ref.current.contains(target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-popover" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="settings-header">
        <div className="settings-title">
          <SlidersHorizontal size={14} />
          <span>Appearance &amp; Behavior</span>
        </div>
        <button className="tool-btn" onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-label">
          <Sparkles size={12} />
          <span>Window Material</span>
        </div>
        <div className="settings-effect-grid">
          {EFFECTS.map((ef) => (
            <button
              key={ef.id}
              className={`effect-card ${windowEffect === ef.id ? 'active' : ''}`}
              onClick={() => onSelectEffect(ef.id)}
            >
              <div className="effect-card-top">
                <span>{ef.label}</span>
                {windowEffect === ef.id && <Check size={12} />}
              </div>
              <span className="effect-card-desc">{ef.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {windowEffect !== 'solid' && (
        <div className="settings-section">
          <div className="settings-slider-row">
            <span className="settings-label">Glass Tint Depth</span>
            <span className="settings-val">{Math.round(settings.glassOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.08}
            max={0.72}
            step={0.02}
            value={settings.glassOpacity}
            onChange={(e) => onUpdateSettings({ glassOpacity: parseFloat(e.target.value) })}
            className="settings-slider"
          />
        </div>
      )}

      <div className="settings-divider" />

      <div className="settings-toggles">
        <label className="settings-toggle-row">
          <span>Show hidden files &amp; folders</span>
          <input type="checkbox" checked={showHidden} onChange={onToggleHidden} />
          <span className="fluent-switch" />
        </label>

        <label className="settings-toggle-row">
          <span>Show file extensions</span>
          <input
            type="checkbox"
            checked={settings.showExtensions}
            onChange={(e) => onUpdateSettings({ showExtensions: e.target.checked })}
          />
          <span className="fluent-switch" />
        </label>

        <label className="settings-toggle-row">
          <span>Quick-action buttons on hover</span>
          <input
            type="checkbox"
            checked={settings.showHoverActions}
            onChange={(e) => onUpdateSettings({ showHoverActions: e.target.checked })}
          />
          <span className="fluent-switch" />
        </label>

        <label className="settings-toggle-row">
          <span>Double-click empty space to go back</span>
          <input
            type="checkbox"
            checked={settings.doubleClickEmptyGoesBack}
            onChange={(e) => onUpdateSettings({ doubleClickEmptyGoesBack: e.target.checked })}
          />
          <span className="fluent-switch" />
        </label>
      </div>

      <div className="settings-divider" />

      <div className="settings-section">
        <div className="settings-label">
          <FolderCog size={12} />
          <span>Windows Integration</span>
        </div>
        <label className="settings-toggle-row">
          <span>Set Folio as default file manager</span>
          <input
            type="checkbox"
            checked={isDefaultFm}
            disabled={togglingDefault}
            onChange={handleToggleDefaultFm}
          />
          <span className="fluent-switch" />
        </label>
        <div className="settings-hint">
          Opens folders &amp; drives in Folio tabs. Turn off anytime to restore Windows Explorer.
        </div>
      </div>
    </div>
  );
};
