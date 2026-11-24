import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export const Win11HomeIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <path d="M12 3.2L3 10.6V20a1.5 1.5 0 001.5 1.5h5v-6h5v6h5A1.5 1.5 0 0021 20v-9.4L12 3.2z" fill="#F29E74" />
    <path d="M12 2.2L2 10.4l1.3 1.5L12 4.8l8.7 7.1 1.3-1.5L12 2.2z" fill="#E87A48" />
    <rect x="9.5" y="14.5" width="5" height="7" rx="0.8" fill="#5C2D16" opacity="0.45" />
  </svg>
);

export const Win11GalleryIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <rect x="2.5" y="5" width="15" height="12" rx="2" fill="#2563EB" opacity="0.7" />
    <rect x="6" y="7.5" width="15.5" height="12.5" rx="2.2" fill="#38BDF8" />
    <circle cx="10.5" cy="11.5" r="1.6" fill="#E0F2FE" />
    <path d="M7.5 18l4-4.2 3 2.8 2.2-2.2 3.3 3.6H7.5z" fill="#0284C7" />
  </svg>
);

export const Win11DesktopIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <rect x="2.5" y="4" width="19" height="13.5" rx="2" fill="#1E40AF" />
    <rect x="4" y="5.5" width="16" height="10.5" rx="1" fill="#38BDF8" />
    <path d="M4 13.5h16V16H4v-2.5z" fill="#0369A1" opacity="0.6" />
    <path d="M9 17.5h6l1 2.5H8l1-2.5z" fill="#94A3B8" />
  </svg>
);

export const Win11DownloadsIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <path d="M12 3.5v11.5" stroke="#2DD4BF" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M7.2 11.2L12 16l4.8-4.8" stroke="#2DD4BF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="18.5" width="16" height="2.4" rx="1.2" fill="#14B8A6" />
  </svg>
);

export const Win11DocumentsIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <path d="M5.5 3.5A1.5 1.5 0 017 2h7.5L19.5 7v13.5a1.5 1.5 0 01-1.5 1.5H7a1.5 1.5 0 01-1.5-1.5v-17z" fill="#E2E8F0" />
    <path d="M14.5 2v4a1 1 0 001 1h4L14.5 2z" fill="#94A3B8" />
    <rect x="8.5" y="10.5" width="7.5" height="1.6" rx="0.8" fill="#64748B" />
    <rect x="8.5" y="13.8" width="7.5" height="1.6" rx="0.8" fill="#64748B" />
    <rect x="8.5" y="17.1" width="5" height="1.6" rx="0.8" fill="#64748B" />
  </svg>
);

export const Win11PicturesIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.2" fill="#38BDF8" />
    <circle cx="8.5" cy="9.2" r="1.8" fill="#E0F2FE" />
    <path d="M4.5 17.8l4.5-4.8 3.2 3 2.8-2.8 4.5 4.6H4.5z" fill="#0369A1" />
  </svg>
);

export const Win11MusicIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" fill="#FB7185" />
    <circle cx="12" cy="12" r="3.2" fill="#FFF1F2" />
    <circle cx="12" cy="12" r="1.3" fill="#E11D48" />
  </svg>
);

export const Win11VideosIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.4" fill="#A855F7" />
    <path d="M10 8.8l6 3.2-6 3.2V8.8z" fill="#F5F3FF" />
  </svg>
);

export const Win11RecycleBinIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <path d="M5.5 7h13l-1.1 12.8a1.5 1.5 0 01-1.5 1.4H8.1a1.5 1.5 0 01-1.5-1.4L5.5 7z" fill="#CBD5E1" />
    <rect x="4" y="4.8" width="16" height="2.2" rx="1" fill="#94A3B8" />
    <rect x="9.5" y="2.8" width="5" height="2" rx="0.8" fill="#94A3B8" />
    <rect x="9" y="10" width="1.5" height="7.5" rx="0.75" fill="#64748B" opacity="0.6" />
    <rect x="13.5" y="10" width="1.5" height="7.5" rx="0.75" fill="#64748B" opacity="0.6" />
  </svg>
);

export const Win11ThisPcIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <rect x="2.5" y="3.8" width="19" height="13.5" rx="2" fill="#334155" />
    <rect x="4" y="5.2" width="16" height="10.6" rx="1" fill="#38BDF8" />
    <path d="M4 11.5c4-2 10-2 16 0v4.3H4v-4.3z" fill="#0284C7" />
    <path d="M9.5 17.3h5l1 2.7h-7l1-2.7z" fill="#94A3B8" />
  </svg>
);

export const Win11DriveIcon: React.FC<IconProps & { isOsDrive?: boolean }> = ({
  size = 38,
  className = '',
  isOsDrive = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={{ flexShrink: 0 }}>
    {/* Metallic Win11 HDD enclosure */}
    <path d="M6 22l4.5-10.5A3 3 0 0113.3 9.7h21.4a3 3 0 012.8 1.8L42 22H6z" fill="#94A3B8" />
    <rect x="5" y="21" width="38" height="15" rx="3" fill="#CBD5E1" />
    <rect x="5" y="31" width="38" height="5" rx="2" fill="#64748B" />
    <rect x="9" y="26.5" width="12" height="2.4" rx="1.2" fill="#475569" />
    <circle cx="36.5" cy="27.7" r="2" fill="#38BDF8" />
    {isOsDrive && (
      <g transform="translate(2, 4)">
        <rect x="0" y="0" width="17" height="17" rx="3" fill="#0F172A" opacity="0.88" />
        <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="0.8" fill="#38BDF8" />
        <rect x="9" y="2.5" width="5.5" height="5.5" rx="0.8" fill="#38BDF8" />
        <rect x="2.5" y="9" width="5.5" height="5.5" rx="0.8" fill="#38BDF8" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="0.8" fill="#38BDF8" />
      </g>
    )}
  </svg>
);

export const Win11NetworkIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ flexShrink: 0 }}>
    <circle cx="10.5" cy="11.5" r="7" fill="#38BDF8" />
    <ellipse cx="10.5" cy="11.5" rx="3.4" ry="7" stroke="#0369A1" strokeWidth="1.2" />
    <path d="M4 11.5h13" stroke="#0369A1" strokeWidth="1.2" />
    <rect x="13" y="12.5" width="8.5" height="6.5" rx="1.2" fill="#E2E8F0" stroke="#475569" strokeWidth="1" />
  </svg>
);
