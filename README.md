# Folio

A fast, lightweight, cool-toned frosted glass file manager for Windows 11 built with **Tauri v2 (Rust)** and **React / TypeScript**.

## Features

- **Native Windows 11 Frosted Glass**: Supports **Acrylic**, **Mica**, **Mica Alt**, and **Solid** backdrops with an adjustable glass tint depth slider.
- **Native 48×48 Windows Shell Icons**: Extracts real per-app `.exe`, `.lnk`, `.msi`, and registered file-type icons directly from Windows Shell.
- **Built-in QuickLook (`Spacebar`)**: Instant floating preview for images (click/wheel zoom), videos, audio, PDFs, Office documents (`.docx`, `.xlsx`, `.pptx`, `.rtf`), fonts (`.ttf`/`.otf`), executables/shortcuts (`.exe`/`.lnk`), HTML, Markdown, CSV, code/logs, `.zip` archive inspection + 1-click Extract Here, and folder summaries.
- **Smart Folder Organization (Downloads Tamer)**: Live category filter pills (`Images`, `Docs & PDFs`, `Archives`, `Installers`, `Videos`, `Audio`, `Code & Text`) and **Tidy Folder** with dry-run preview and 1-click Undo.
- **Full Explorer Ergonomics**: Tabs (`Ctrl+T` / `Ctrl+W`), Split Pane (`Ctrl+\`), Details/Preview side pane (`Alt+P`), Home / Gallery / This PC / Recycle Bin / Network sidebar, Pinned & Recent folders (with drag-to-pin), Breadcrumb subfolder dropdowns, Marquee drag-selection, Double-click empty space to go back, Mouse side-button navigation, Batch Rename (`F2` on multi-select), Quick Compress to ZIP, On-demand Folder Size, Undo (`Ctrl+Z`), and Deep Recursive Search (`Ctrl+Shift+F`).
- **Default File Manager Integration**: Optional 1-click **Set Folio as default file manager** toggle in Settings (per-user `HKCU` registration, reversible anytime) with single-instance tab opening.

## Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://rustup.rs/) (`stable-x86_64-pc-windows-gnullvm` or MSVC toolchain)
- Windows 10/11 (WebView2 is pre-installed on Windows 11)

### Run in Development
```bash
npm install
npm run tauri dev
```

### Build Standalone Release Executable
```bash
npm install
npm run tauri build -- --no-bundle
```
The built executable will be in `src-tauri/target/release/`.

## License

MIT
