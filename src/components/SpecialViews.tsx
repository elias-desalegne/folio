import React, { useEffect, useState } from 'react';
import { ChevronDown, HardDrive, Pin, Usb } from 'lucide-react';
import type { DriveInfo, FileEntry, NavDirection, QuickAccessItem, UiStyle } from '../types';
import { api } from '../api';
import { formatBytes, getPathBasename } from '../utils/format';
import { FluentFolderIcon } from './FileIcon';
import { Win11DriveIcon } from './Win11Icons';

interface SpecialViewsProps {
  mode: 'home' | 'this-pc' | 'gallery';
  uiStyle: UiStyle;
  quickAccess: QuickAccessItem[];
  pinnedPaths: string[];
  drives: DriveInfo[];
  navDirection: NavDirection;
  navKey: number;
  onNavigate: (path: string, dir?: NavDirection) => void;
  onQuickLook: (entry: FileEntry) => void;
  onOpenExternal: (entry: FileEntry) => void;
}

export const SpecialViews: React.FC<SpecialViewsProps> = ({
  mode,
  uiStyle,
  quickAccess,
  pinnedPaths,
  drives,
  navDirection,
  navKey,
  onNavigate,
  onQuickLook,
  onOpenExternal,
}) => {
  const [galleryImages, setGalleryImages] = useState<FileEntry[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  useEffect(() => {
    if (mode !== 'gallery') return;
    setLoadingGallery(true);
    api
      .listGalleryImages(300)
      .then(setGalleryImages)
      .catch(() => setGalleryImages([]))
      .finally(() => setLoadingGallery(false));
  }, [mode]);

  if (mode === 'gallery') {
    return (
      <div className="file-pane active-pane">
        <div className="file-scroll special-scroll">
          <div key={navKey} className={`nav-stage nav-${navDirection}`}>
            <div className="special-section-title">
              Gallery — Pictures & Downloads ({galleryImages.length})
            </div>
            {loadingGallery ? (
              <div className="empty-state">
                <div className="spinner" />
                <span>Scanning photos...</span>
              </div>
            ) : galleryImages.length === 0 ? (
              <div className="empty-state">No images found in Pictures or Downloads</div>
            ) : (
              <div className="gallery-grid">
                {galleryImages.map((img) => (
                  <div
                    key={img.path}
                    className="gallery-card"
                    onClick={() => onQuickLook(img)}
                    onDoubleClick={() => onOpenExternal(img)}
                    title={`${img.name} — Click for QuickLook`}
                  >
                    <img
                      src={api.toAssetUrl(img.path)}
                      alt={img.name}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="gallery-caption">{img.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const normalize = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
  const quickFolders = quickAccess.filter((q) => q.name !== 'Home');
  const quickNorms = new Set(quickFolders.map((q) => normalize(q.path)));
  const extraPinned = pinnedPaths.filter((p) => !quickNorms.has(normalize(p)));

  return (
    <div className="file-pane active-pane">
      <div className="file-scroll special-scroll">
        <div key={navKey} className={`nav-stage nav-${navDirection}`}>
          {mode === 'home' && (
            <>
              <div className="special-section-title">Quick Access</div>
              <div className="special-folder-grid">
                {quickFolders.map((q) => (
                  <button
                    key={q.path}
                    className="special-folder-card"
                    onClick={() => onNavigate(q.path, 'in')}
                  >
                    <FluentFolderIcon size={36} />
                    <div className="special-card-info">
                      <div className="special-card-name">{q.name}</div>
                      <div className="special-card-sub">{q.path}</div>
                    </div>
                  </button>
                ))}
                {extraPinned.map((p) => (
                  <button
                    key={`pin-${normalize(p)}`}
                    className="special-folder-card"
                    onClick={() => onNavigate(p, 'in')}
                  >
                    <FluentFolderIcon size={36} />
                    <div className="special-card-info">
                      <div className="special-card-name">
                        {getPathBasename(p)} <Pin size={11} className="inline-pin" />
                      </div>
                      <div className="special-card-sub">{p}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="special-section-title">
            {uiStyle === 'classic-explorer' ? (
              <span className="classic-section-hdr">
                <ChevronDown size={13} />
                <span>Devices and drives</span>
              </span>
            ) : (
              `Devices and drives (${drives.length})`
            )}
          </div>
          <div className="special-drive-grid">
            {drives.map((d) => {
              const used = Math.max(0, d.totalSpace - d.availableSpace);
              const pct = d.totalSpace > 0 ? Math.min(100, (used / d.totalSpace) * 100) : 0;
              const isOsDrive = d.mountPoint.toUpperCase().startsWith('C:');
              return (
                <button
                  key={d.mountPoint}
                  className="special-drive-card"
                  onClick={() => onNavigate(d.mountPoint, 'in')}
                >
                  <div className="special-drive-icon">
                    {uiStyle === 'classic-explorer' ? (
                      <Win11DriveIcon size={40} isOsDrive={isOsDrive} />
                    ) : d.isRemovable ? (
                      <Usb size={30} />
                    ) : (
                      <HardDrive size={30} />
                    )}
                  </div>
                  <div className="special-drive-body">
                    <div className="special-card-name">{d.name}</div>
                    <div className="drive-bar-track lg">
                      <div
                        className={`drive-bar-fill ${pct > 88 ? 'warn' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="special-card-sub">
                      {formatBytes(d.availableSpace)} free of {formatBytes(d.totalSpace)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
