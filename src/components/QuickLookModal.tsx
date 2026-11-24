import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FolderArchive,
  FolderOpen,
  Grid,
  HardDrive,
  Link2,
  Pin,
  RotateCw,
  Search,
  Table,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ExecutableInfo,
  FileEntry,
  FolderSummary,
  OfficePreview,
  TextPreview,
  ZipEntryInfo,
} from '../types';
import { api } from '../api';
import {
  formatBytes,
  formatDate,
  isAudioPreviewable,
  isCsvFile,
  isExecutableInspectable,
  isFontPreviewable,
  isHtmlFile,
  isImagePreviewable,
  isMarkdownFile,
  isOfficePreviewable,
  isPdfPreviewable,
  isTextPreviewable,
  isVideoPreviewable,
  isZipInspectable,
} from '../utils/format';
import { FileIcon, FluentFolderIcon } from './FileIcon';

interface QuickLookModalProps {
  entry: FileEntry | null;
  currentIndex: number;
  totalCount: number;
  isPinned: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenExternal: (entry: FileEntry) => void;
  onOpenWith: (entry: FileEntry) => void;
  onExtractZip: (entry: FileEntry) => void;
  onPinToggle: (path: string) => void;
  onToast: (msg: string) => void;
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= 250) break;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="md-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const out: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length && out.length < 400) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        out.push(
          <pre key={`cb-${i}`} className="md-code-block">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        i++;
        continue;
      }
      const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        out.push(
          <div key={`h-${i}`} className={`md-h md-h${level}`}>
            {renderInlineMarkdown(hMatch[2])}
          </div>
        );
      } else if (/^[-*_]{3,}\s*$/.test(line.trim())) {
        out.push(<hr key={`hr-${i}`} className="md-hr" />);
      } else if (line.trim().startsWith('> ')) {
        out.push(
          <blockquote key={`bq-${i}`} className="md-quote">
            {renderInlineMarkdown(line.trim().slice(2))}
          </blockquote>
        );
      } else if (/^\s*[-*+]\s+/.test(line)) {
        out.push(
          <div key={`li-${i}`} className="md-li">
            <span className="md-bullet">•</span>
            <span>{renderInlineMarkdown(line.replace(/^\s*[-*+]\s+/, ''))}</span>
          </div>
        );
      } else if (line.trim() !== '') {
        out.push(
          <p key={`p-${i}`} className="md-p">
            {renderInlineMarkdown(line)}
          </p>
        );
      }
      i++;
    }
    return out;
  }, [content]);

  return <div className="ql-markdown">{blocks}</div>;
};

export const QuickLookModal: React.FC<QuickLookModalProps> = ({
  entry,
  currentIndex,
  totalCount,
  isPinned,
  onClose,
  onPrev,
  onNext,
  onOpenExternal,
  onOpenWith,
  onExtractZip,
  onPinToggle,
  onToast,
}) => {
  // Keep renderedEntry during closing animation so exit feels silky smooth
  const [renderedEntry, setRenderedEntry] = useState<FileEntry | null>(entry);
  const [closing, setClosing] = useState(false);

  const [textData, setTextData] = useState<TextPreview | null>(null);
  const [zipData, setZipData] = useState<ZipEntryInfo[] | null>(null);
  const [zipFilter, setZipFilter] = useState('');
  const [folderData, setFolderData] = useState<FolderSummary | null>(null);
  const [folderFullSize, setFolderFullSize] = useState<number | null>(null);
  const [calcSizeBusy, setCalcSizeBusy] = useState(false);
  const [officeData, setOfficeData] = useState<OfficePreview | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [exeData, setExeData] = useState<ExecutableInfo | null>(null);
  const [fontFamilyName, setFontFamilyName] = useState<string | null>(null);
  const [fontSample, setFontSample] = useState(
    'The quick brown fox jumps over the lazy dog — 0123456789'
  );

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotate, setImgRotate] = useState(0);
  const [checkerBg, setCheckerBg] = useState(false);
  const [richMode, setRichMode] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [showAllLines, setShowAllLines] = useState(false);

  useEffect(() => {
    if (entry) {
      setRenderedEntry(entry);
      setClosing(false);
    } else if (renderedEntry) {
      setClosing(true);
      const timer = window.setTimeout(() => {
        setRenderedEntry(null);
        setClosing(false);
      }, 170);
      return () => window.clearTimeout(timer);
    }
  }, [entry]);

  useEffect(() => {
    const active = entry;
    if (!active) return;

    setTextData(null);
    setZipData(null);
    setZipFilter('');
    setFolderData(null);
    setFolderFullSize(null);
    setCalcSizeBusy(false);
    setOfficeData(null);
    setActiveSheetIdx(0);
    setExeData(null);
    setFontFamilyName(null);
    setErr(null);
    setImgDimensions(null);
    setImgZoom(1);
    setImgRotate(0);
    setCheckerBg(false);
    setRichMode(true);
    setShowAllLines(false);

    let cancelled = false;
    let loadedFontFace: FontFace | null = null;
    const ext = active.extension.toLowerCase();

    if (active.isDir) {
      setLoading(true);
      api
        .getFolderSummary(active.path)
        .then((res) => !cancelled && setFolderData(res))
        .catch((e) => !cancelled && setErr(String(e)))
        .finally(() => !cancelled && setLoading(false));
    } else if (isFontPreviewable(ext)) {
      setLoading(true);
      const family = `VeloFontPreview_${Date.now()}`;
      const face = new FontFace(family, `url("${api.toAssetUrl(active.path)}")`);
      face
        .load()
        .then((loaded) => {
          if (cancelled) return;
          loadedFontFace = loaded;
          document.fonts.add(loaded);
          setFontFamilyName(family);
        })
        .catch((e) => !cancelled && setErr(`Could not load font: ${String(e)}`))
        .finally(() => !cancelled && setLoading(false));
    } else if (isOfficePreviewable(ext)) {
      setLoading(true);
      api
        .inspectOfficeDocument(active.path)
        .then((res) => !cancelled && setOfficeData(res))
        .catch((e) => !cancelled && setErr(String(e)))
        .finally(() => !cancelled && setLoading(false));
    } else if (isExecutableInspectable(ext)) {
      setLoading(true);
      api
        .inspectExecutable(active.path)
        .then((res) => !cancelled && setExeData(res))
        .catch((e) => !cancelled && setErr(String(e)))
        .finally(() => !cancelled && setLoading(false));
    } else if (isZipInspectable(ext)) {
      setLoading(true);
      api
        .inspectZip(active.path)
        .then((res) => !cancelled && setZipData(res))
        .catch((e) => !cancelled && setErr(String(e)))
        .finally(() => !cancelled && setLoading(false));
    } else if (
      !isImagePreviewable(ext) &&
      !isVideoPreviewable(ext) &&
      !isAudioPreviewable(ext) &&
      !isPdfPreviewable(ext)
    ) {
      // Smart universal text probe: works for all code/text files AND unknown plain-text files
      const shouldProbe = isTextPreviewable(ext, active.category) || active.size <= 2 * 1024 * 1024;
      if (shouldProbe) {
        setLoading(true);
        api
          .readTextPreview(active.path, 262_144)
          .then((res) => !cancelled && setTextData(res))
          .catch((e) => {
            if (!cancelled && isTextPreviewable(ext, active.category)) {
              setErr(String(e));
            }
          })
          .finally(() => !cancelled && setLoading(false));
      }
    }

    return () => {
      cancelled = true;
      if (loadedFontFace) {
        document.fonts.delete(loadedFontFace);
      }
    };
  }, [entry]);

  const active = renderedEntry;

  const formattedCode = useMemo(() => {
    if (!textData || !active) return '';
    if (active.extension.toLowerCase() === 'json') {
      try {
        return JSON.stringify(JSON.parse(textData.content), null, 2);
      } catch {
        return textData.content;
      }
    }
    return textData.content;
  }, [textData, active]);

  const csvRows = useMemo(() => {
    if (!textData || !active || !isCsvFile(active.extension.toLowerCase())) return [];
    const delim = active.extension.toLowerCase() === 'tsv' ? '\t' : ',';
    return parseCsvRows(textData.content, delim);
  }, [textData, active]);

  const filteredZipEntries = useMemo(() => {
    if (!zipData) return [];
    const q = zipFilter.trim().toLowerCase();
    if (!q) return zipData;
    return zipData.filter((z) => z.name.toLowerCase().includes(q));
  }, [zipData, zipFilter]);

  if (!active) return null;

  const ext = active.extension.toLowerCase();
  const assetUrl = api.toAssetUrl(active.path);
  const isImg = !active.isDir && isImagePreviewable(ext);
  const isVid = !active.isDir && isVideoPreviewable(ext);
  const isAud = !active.isDir && isAudioPreviewable(ext);
  const isPdf = !active.isDir && isPdfPreviewable(ext);
  const isZip = !active.isDir && isZipInspectable(ext);
  const isMd = !active.isDir && isMarkdownFile(ext);
  const isCsv = !active.isDir && isCsvFile(ext);
  const isHtml = !active.isDir && isHtmlFile(ext);
  const hasRichToggle = Boolean(textData && (isMd || isCsv || isHtml));

  const codeLines = textData ? formattedCode.split(/\r?\n/) : [];

  const copyText = () => {
    if (textData?.content) {
      navigator.clipboard.writeText(textData.content);
      onToast('Copied preview text to clipboard');
    } else if (officeData?.paragraphs.length) {
      navigator.clipboard.writeText(officeData.paragraphs.map((p) => p.text).join('\n\n'));
      onToast('Copied document text to clipboard');
    }
  };

  const handleCalcFolderSize = async () => {
    if (!active.isDir || calcSizeBusy) return;
    setCalcSizeBusy(true);
    try {
      const total = await api.calculateFolderSize(active.path);
      setFolderFullSize(total);
    } catch {
      onToast('Could not calculate full folder size');
    } finally {
      setCalcSizeBusy(false);
    }
  };

  return (
    <div className={`ql-backdrop ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div className={`ql-window ${closing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="ql-header">
          <div className="ql-title-group">
            <FileIcon
              category={active.category}
              extension={active.extension}
              path={active.path}
              isDir={active.isDir}
              size={20}
            />
            <span className="ql-title" title={active.path}>
              {active.name}
            </span>
            <span className="ql-meta">
              {active.isDir ? 'Folder' : formatBytes(active.size)}
              {imgDimensions ? ` · ${imgDimensions.w} × ${imgDimensions.h}` : ''}
              {' · '}
              {formatDate(active.modifiedMs)}
            </span>
          </div>

          <div className="ql-actions">
            {isImg && (
              <>
                <button
                  className="ql-btn"
                  onClick={() => setImgZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
                  title="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  className="ql-btn"
                  onClick={() => setImgZoom((z) => (z === 1 ? 1.75 : 1))}
                  title="Reset zoom"
                >
                  <span>{Math.round(imgZoom * 100)}%</span>
                </button>
                <button
                  className="ql-btn"
                  onClick={() => setImgZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                  title="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  className="ql-btn"
                  onClick={() => setImgRotate((r) => (r + 90) % 360)}
                  title="Rotate 90°"
                >
                  <RotateCw size={14} />
                </button>
                <button
                  className={`ql-btn ${checkerBg ? 'primary' : ''}`}
                  onClick={() => setCheckerBg((c) => !c)}
                  title="Toggle transparency grid"
                >
                  <Grid size={14} />
                </button>
              </>
            )}

            {hasRichToggle && (
              <button
                className={`ql-btn ${richMode ? 'primary' : ''}`}
                onClick={() => setRichMode((r) => !r)}
                title={richMode ? 'View raw source' : 'View formatted preview'}
              >
                {richMode ? <Code2 size={14} /> : isCsv ? <Table size={14} /> : <Eye size={14} />}
                <span>{richMode ? 'Source' : 'Formatted'}</span>
              </button>
            )}

            {textData && (!hasRichToggle || !richMode) && (
              <button
                className={`ql-btn ${wordWrap ? 'primary' : ''}`}
                onClick={() => setWordWrap((w) => !w)}
                title="Toggle word wrap"
              >
                <WrapText size={14} />
              </button>
            )}

            {(textData || (officeData && officeData.paragraphs.length > 0)) && (
              <button className="ql-btn" onClick={copyText} title="Copy text">
                <Copy size={14} />
              </button>
            )}

            {active.isDir && (
              <button
                className={`ql-btn ${isPinned ? 'primary' : ''}`}
                onClick={() => onPinToggle(active.path)}
                title={isPinned ? 'Unpin from Sidebar' : 'Pin to Sidebar'}
              >
                <Pin size={14} />
                <span>{isPinned ? 'Pinned' : 'Pin'}</span>
              </button>
            )}

            {isZip && (
              <button
                className="ql-btn primary"
                onClick={() => onExtractZip(active)}
                title="Extract archive here"
              >
                <FolderArchive size={14} />
                <span>Extract Here</span>
              </button>
            )}

            <button
              className="ql-btn"
              onClick={() => {
                navigator.clipboard.writeText(active.path);
                onToast('Path copied to clipboard');
              }}
              title="Copy full path"
            >
              <Link2 size={14} />
            </button>

            <button
              className="ql-btn primary"
              onClick={() => onOpenExternal(active)}
              title="Open with default app (Enter)"
            >
              <ExternalLink size={14} />
              <span>Open</span>
            </button>

            <button className="ql-btn" onClick={onPrev} title="Previous file (← / ↑)">
              <ChevronLeft size={15} />
            </button>
            <button className="ql-btn" onClick={onNext} title="Next file (→ / ↓)">
              <ChevronRight size={15} />
            </button>
            <button className="ql-btn close" onClick={onClose} title="Close (Space / Esc)">
              <X size={15} />
            </button>
          </div>
        </div>

        <div key={active.path} className="ql-body ql-stage-anim">
          {isImg && (
            <div
              className={`ql-image-stage ${imgZoom > 1 ? 'zoomed' : ''} ${
                checkerBg ? 'checker-bg' : ''
              }`}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                setImgZoom((z) => Math.max(0.25, Math.min(4, Number((z + delta).toFixed(2)))));
              }}
            >
              <img
                src={assetUrl}
                alt={active.name}
                style={{
                  transform: `scale(${imgZoom}) rotate(${imgRotate}deg)`,
                }}
                onClick={() => setImgZoom((z) => (z === 1 ? 1.75 : 1))}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setImgDimensions({ w: el.naturalWidth, h: el.naturalHeight });
                }}
              />
            </div>
          )}

          {isVid && (
            <div className="ql-media-stage">
              <video key={active.path} src={assetUrl} controls autoPlay className="ql-video" />
            </div>
          )}

          {isAud && (
            <div className="ql-audio-stage">
              <div className="ql-audio-art">
                <FileIcon
                  category="audio"
                  extension={active.extension}
                  path={active.path}
                  size={68}
                />
              </div>
              <div className="ql-audio-title">{active.name}</div>
              <div className="ql-audio-sub">
                {ext.toUpperCase()} Audio · {formatBytes(active.size)}
              </div>
              <audio key={active.path} src={assetUrl} controls autoPlay className="ql-audio" />
            </div>
          )}

          {isPdf && (
            <iframe
              key={active.path}
              src={assetUrl}
              title={active.name}
              className="ql-pdf-frame"
            />
          )}

          {loading && (
            <div className="ql-center">
              <div className="spinner" />
              <span>Preparing preview...</span>
            </div>
          )}

          {/* Font Specimen Preview */}
          {!loading && fontFamilyName && (
            <div className="ql-font-wrap">
              <div className="ql-font-hero" style={{ fontFamily: fontFamilyName }}>
                Aa Bb Cc 123
              </div>
              <input
                className="ql-font-input"
                value={fontSample}
                onChange={(e) => setFontSample(e.target.value)}
                placeholder="Type custom text to test this font..."
              />
              <div className="ql-font-sizes" style={{ fontFamily: fontFamilyName }}>
                {[14, 18, 24, 34, 46].map((px) => (
                  <div key={px} className="ql-font-row">
                    <span className="ql-font-px">{px}px</span>
                    <span style={{ fontSize: `${px}px` }}>{fontSample}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Office Document / Spreadsheet / Presentation Preview */}
          {!loading && officeData && officeData.kind === 'document' && (
            <div className="ql-office-doc">
              {officeData.paragraphs.length === 0 ? (
                <div className="ql-center">No readable text found in document.</div>
              ) : (
                officeData.paragraphs.map((p, idx) =>
                  p.heading ? (
                    <h3 key={idx} className="ql-doc-heading">
                      {p.text}
                    </h3>
                  ) : (
                    <p key={idx} className="ql-doc-p">
                      {p.text}
                    </p>
                  )
                )
              )}
            </div>
          )}

          {!loading && officeData && officeData.kind === 'spreadsheet' && (
            <div className="ql-sheet-wrap">
              <div className="ql-sheet-tabs">
                {officeData.sheets.map((s, idx) => (
                  <button
                    key={`${s.name}-${idx}`}
                    className={`ql-sheet-tab ${idx === activeSheetIdx ? 'active' : ''}`}
                    onClick={() => setActiveSheetIdx(idx)}
                  >
                    <FileSpreadsheet size={13} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              {officeData.sheets[activeSheetIdx] ? (
                <div className="ql-table-scroll">
                  <table className="ql-data-table">
                    <tbody>
                      {officeData.sheets[activeSheetIdx].rows.map((row, rIdx) => (
                        <tr key={rIdx} className={rIdx === 0 ? 'ql-table-head-row' : ''}>
                          <td className="ql-row-num">{rIdx + 1}</td>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ql-center">Empty spreadsheet</div>
              )}
            </div>
          )}

          {!loading && officeData && officeData.kind === 'presentation' && (
            <div className="ql-slides-wrap">
              {officeData.slides.map((slide) => (
                <div key={slide.number} className="ql-slide-card">
                  <div className="ql-slide-badge">Slide {slide.number}</div>
                  {slide.lines.length === 0 ? (
                    <p className="ql-slide-empty">(Visual / Graphic slide)</p>
                  ) : (
                    slide.lines.map((line, i) => (
                      <p key={i} className={i === 0 ? 'ql-slide-title' : 'ql-slide-line'}>
                        {line}
                      </p>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Executable / App / Shortcut Inspector */}
          {!loading && exeData && (
            <div className="ql-exe-wrap">
              <div className="ql-exe-hero">
                <FileIcon
                  category={active.category}
                  extension={active.extension}
                  path={active.path}
                  size={76}
                />
                <div className="ql-exe-title-block">
                  <h3>{exeData.productName || exeData.fileDescription || active.name}</h3>
                  <div className="ql-exe-badges">
                    <span className="ql-badge">{exeData.architecture}</span>
                    <span className="ql-badge">{exeData.subsystem}</span>
                    {exeData.fileVersion && (
                      <span className="ql-badge">v{exeData.fileVersion}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="ql-exe-grid">
                {exeData.companyName && (
                  <div className="ql-exe-row">
                    <span>Publisher</span>
                    <span>{exeData.companyName}</span>
                  </div>
                )}
                {exeData.fileDescription && (
                  <div className="ql-exe-row">
                    <span>Description</span>
                    <span>{exeData.fileDescription}</span>
                  </div>
                )}
                {exeData.shortcutTarget && (
                  <div className="ql-exe-row">
                    <span>Shortcut Target</span>
                    <span className="mono">{exeData.shortcutTarget}</span>
                  </div>
                )}
                <div className="ql-exe-row">
                  <span>File Size</span>
                  <span>{formatBytes(active.size)}</span>
                </div>
                <div className="ql-exe-row">
                  <span>Modified</span>
                  <span>{formatDate(active.modifiedMs)}</span>
                </div>
                {exeData.copyright && (
                  <div className="ql-exe-row">
                    <span>Copyright</span>
                    <span>{exeData.copyright}</span>
                  </div>
                )}
              </div>

              <div className="ql-fallback-actions">
                <button className="btn-primary" onClick={() => onOpenExternal(active)}>
                  <ExternalLink size={14} />
                  <span>Launch Program</span>
                </button>
                <button className="btn-ghost" onClick={() => onOpenWith(active)}>
                  Open With...
                </button>
              </div>
            </div>
          )}

          {/* Markdown / CSV / HTML Rich Views & Line-Numbered Code Viewer */}
          {!loading && textData && isMd && richMode && (
            <MarkdownRenderer content={textData.content} />
          )}

          {!loading && textData && isHtml && richMode && (
            <iframe
              key={active.path}
              title={active.name}
              sandbox=""
              srcDoc={textData.content}
              className="ql-html-frame"
            />
          )}

          {!loading && textData && isCsv && richMode && csvRows.length > 0 && (
            <div className="ql-table-scroll">
              <table className="ql-data-table">
                <tbody>
                  {csvRows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx === 0 ? 'ql-table-head-row' : ''}>
                      <td className="ql-row-num">{rIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading &&
            textData &&
            !(isMd && richMode) &&
            !(isHtml && richMode) &&
            !(isCsv && richMode && csvRows.length > 0) && (
              <div className="ql-code-wrap">
                <div className={`ql-code-scroller ${wordWrap ? 'wrap' : 'nowrap'}`}>
                  {(showAllLines ? codeLines : codeLines.slice(0, 600)).map((line, i) => (
                    <div key={i} className="ql-code-line">
                      <span className="ql-line-num">{i + 1}</span>
                      <span className="ql-line-text">{line || ' '}</span>
                    </div>
                  ))}
                  {!showAllLines && codeLines.length > 600 && (
                    <div className="ql-more-lines">
                      <button className="btn-ghost sm" onClick={() => setShowAllLines(true)}>
                        Show all {codeLines.length.toLocaleString()} lines
                      </button>
                    </div>
                  )}
                </div>
                {textData.truncated && (
                  <div className="ql-truncated-banner">
                    Showing first 256 KB ({codeLines.length} lines) of{' '}
                    {formatBytes(textData.totalSize)}
                  </div>
                )}
              </div>
            )}

          {/* Archive Inspector */}
          {!loading && zipData && (
            <div className="ql-zip-wrap">
              <div className="ql-zip-summary">
                <span>
                  Archive contents ({zipData.length}
                  {zipData.length >= 500 ? '+' : ''} entries)
                </span>
                <div className="ql-zip-search">
                  <Search size={12} />
                  <input
                    value={zipFilter}
                    onChange={(e) => setZipFilter(e.target.value)}
                    placeholder="Filter archive..."
                  />
                </div>
              </div>
              <div className="ql-zip-list">
                {filteredZipEntries.map((z, i) => (
                  <div key={`${z.name}-${i}`} className="ql-zip-row">
                    <span className="ql-zip-name">{z.name}</span>
                    <span className="ql-zip-size">
                      {z.isDir ? 'Folder' : formatBytes(z.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Folder Preview */}
          {!loading && folderData && (
            <div className="ql-folder-wrap">
              <FluentFolderIcon size={64} />
              <div className="ql-folder-stats">
                <span>{folderData.dirCount} folders</span>
                <span>·</span>
                <span>{folderData.fileCount} files</span>
                <span>·</span>
                <span>
                  {folderFullSize !== null
                    ? `${formatBytes(folderFullSize)} total`
                    : `${formatBytes(folderData.immediateSize)} immediate`}
                </span>
              </div>
              {folderFullSize === null && (
                <button
                  className="btn-ghost sm"
                  style={{ flex: 'none' }}
                  onClick={handleCalcFolderSize}
                  disabled={calcSizeBusy}
                >
                  <HardDrive size={13} />
                  <span>{calcSizeBusy ? 'Calculating...' : 'Calculate Full Size'}</span>
                </button>
              )}
              {folderData.sampleItems.length > 0 && (
                <div className="ql-folder-samples">
                  {folderData.sampleItems.map((name) => (
                    <div key={name} className="ql-sample-chip">
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Universal Fallback */}
          {!loading &&
            !isImg &&
            !isVid &&
            !isAud &&
            !isPdf &&
            !fontFamilyName &&
            !officeData &&
            !exeData &&
            !textData &&
            !zipData &&
            !folderData && (
              <div className="ql-fallback">
                <FileIcon
                  category={active.category}
                  extension={active.extension}
                  path={active.path}
                  size={76}
                />
                <h3>{active.name}</h3>
                <p className="ql-fallback-meta">
                  {active.extension ? `${active.extension.toUpperCase()} File` : 'File'} ·{' '}
                  {formatBytes(active.size)}
                </p>
                {err && <p className="ql-fallback-note">{err}</p>}
                <div className="ql-fallback-actions">
                  <button className="btn-primary" onClick={() => onOpenExternal(active)}>
                    Open File
                  </button>
                  <button className="btn-ghost" onClick={() => onOpenWith(active)}>
                    Open With...
                  </button>
                </div>
              </div>
            )}
        </div>

        <div className="ql-footer">
          {totalCount > 0 && currentIndex >= 0 && (
            <span className="ql-counter">
              {currentIndex + 1} of {totalCount}
            </span>
          )}
          <span>Space / Esc to close</span>
          <span>← → to step through files</span>
          <span>Enter to open</span>
        </div>
      </div>
    </div>
  );
};
