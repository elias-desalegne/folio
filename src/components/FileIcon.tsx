import React, { useId } from 'react';
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Package,
} from 'lucide-react';
import type { FileCategory } from '../types';
import { useNativeIcon } from '../utils/iconCache';

interface FileIconProps {
  category: FileCategory;
  extension?: string;
  path?: string;
  isDir?: boolean;
  size?: number;
  className?: string;
}

/** Crisp Windows 11 Fluent filled folder icon */
export const FluentFolderIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 18,
  className = '',
}) => {
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2.5 6.25C2.5 5.00736 3.50736 4 4.75 4H9.17157C9.70201 4 10.2107 4.21071 10.5858 4.58579L12 6H19.25C20.4926 6 21.5 7.00736 21.5 8.25V17.75C21.5 18.9926 20.4926 20 19.25 20H4.75C3.50736 20 2.5 18.9926 2.5 17.75V6.25Z"
        fill="#4A607A"
      />
      <path
        d="M2.5 8.75C2.5 7.7835 3.2835 7 4.25 7H19.75C20.7165 7 21.5 7.7835 21.5 8.75V17.75C21.5 18.9926 20.4926 20 19.25 20H4.75C3.50736 20 2.5 18.9926 2.5 17.75V8.75Z"
        fill={`url(#${gradId})`}
      />
      <defs>
        <linearGradient id={gradId} x1="12" y1="7" x2="12" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#AFCBE6" />
          <stop offset="1" stopColor="#7295BA" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const FileIcon: React.FC<FileIconProps> = ({
  category,
  extension = '',
  path,
  isDir,
  size = 18,
  className = '',
}) => {
  const folderFlag = isDir ?? category === 'folder';
  const nativeUrl = useNativeIcon(path, extension, folderFlag);

  if (folderFlag) {
    return <FluentFolderIcon size={size} className={className} />;
  }

  if (nativeUrl) {
    return (
      <img
        src={nativeUrl}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className={`native-file-icon ${className}`}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          objectFit: 'contain',
        }}
      />
    );
  }

  switch (category) {
    case 'image':
      return <FileImage size={size} className={className} style={{ color: '#60a5fa', flexShrink: 0 }} />;
    case 'video':
      return <FileVideo size={size} className={className} style={{ color: '#c084fc', flexShrink: 0 }} />;
    case 'audio':
      return <FileAudio size={size} className={className} style={{ color: '#f472b6', flexShrink: 0 }} />;
    case 'archive':
      return <FileArchive size={size} className={className} style={{ color: '#fbbf24', flexShrink: 0 }} />;
    case 'installer':
      return <Package size={size} className={className} style={{ color: '#93c5fd', flexShrink: 0 }} />;
    case 'code':
      return <FileCode2 size={size} className={className} style={{ color: '#a1a1aa', flexShrink: 0 }} />;
    case 'document':
      if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
        return (
          <FileSpreadsheet
            size={size}
            className={className}
            style={{ color: '#4ade80', flexShrink: 0 }}
          />
        );
      }
      if (extension === 'pdf') {
        return <FileText size={size} className={className} style={{ color: '#f87171', flexShrink: 0 }} />;
      }
      return <FileText size={size} className={className} style={{ color: '#d4d4d8', flexShrink: 0 }} />;
    default:
      return <File size={size} className={className} style={{ color: '#a1a1aa', flexShrink: 0 }} />;
  }
};
