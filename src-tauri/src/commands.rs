use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use sysinfo::Disks;
use tauri::{AppHandle, State, WebviewWindow};
use walkdir::WalkDir;

use crate::watcher::WatcherState;

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub created_ms: u64,
    pub extension: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickAccessItem {
    pub name: String,
    pub path: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPreview {
    pub content: String,
    pub truncated: bool,
    pub total_size: u64,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipEntryInfo {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSummary {
    pub file_count: usize,
    pub dir_count: usize,
    pub immediate_size: u64,
    pub sample_items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMoveItem {
    pub from: String,
    pub to: String,
}

fn classify_extension(ext: &str, is_dir: bool) -> String {
    if is_dir {
        return "folder".to_string();
    }
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "ico" | "tiff" | "tif"
        | "avif" | "heic" | "raw" | "psd" | "ai" => "image",
        "mp4" | "mkv" | "webm" | "mov" | "avi" | "wmv" | "flv" | "m4v" | "mpg" | "mpeg" => {
            "video"
        }
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" | "wma" | "opus" | "mid" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp"
        | "rtf" | "txt" | "md" | "markdown" | "csv" | "epub" | "pages" | "numbers" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" | "iso" | "cab" | "tgz" => {
            "archive"
        }
        "exe" | "msi" | "msix" | "appx" | "bat" | "cmd" | "ps1" | "vbs" | "lnk" | "dmg"
        | "pkg" | "deb" | "rpm" => "installer",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "c" | "cpp" | "cc" | "h" | "hpp"
        | "cs" | "java" | "kt" | "swift" | "rb" | "php" | "html" | "htm" | "css" | "scss"
        | "less" | "json" | "yaml" | "yml" | "toml" | "xml" | "sql" | "sh" | "bash" | "zsh"
        | "ini" | "cfg" | "conf" | "env" | "log" | "lock" | "vue" | "svelte" | "dart" | "lua"
        | "r" | "ipynb" => "code",
        _ => "other",
    }
    .to_string()
}

fn system_time_to_ms(time: Result<std::time::SystemTime, std::io::Error>) -> u64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_hidden_file(name: &str, metadata: &fs::Metadata) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
        let attrs = metadata.file_attributes();
        if (attrs & FILE_ATTRIBUTE_HIDDEN) != 0 || (attrs & FILE_ATTRIBUTE_SYSTEM) != 0 {
            return true;
        }
    }
    false
}

fn build_entry_from_dir_entry(item: &fs::DirEntry) -> Option<FileEntry> {
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    // On Windows, DirEntry::metadata() reuses WIN32_FIND_DATA from FindNextFile (zero extra syscalls)
    let meta = item.metadata().ok()?;
    let is_symlink = meta.file_type().is_symlink();
    let is_dir = if is_symlink {
        fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(meta.is_dir())
    } else {
        meta.is_dir()
    };
    let is_hidden = is_hidden_file(&name, &meta);
    let extension = if is_dir {
        String::new()
    } else {
        path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    let category = classify_extension(&extension, is_dir);

    Some(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        is_hidden,
        is_symlink,
        size: if is_dir { 0 } else { meta.len() },
        modified_ms: system_time_to_ms(meta.modified()),
        created_ms: system_time_to_ms(meta.created()),
        extension,
        category,
    })
}

fn build_file_entry(path: &Path) -> Option<FileEntry> {
    let name = path.file_name()?.to_string_lossy().to_string();
    let symlink_meta = fs::symlink_metadata(path).ok()?;
    let is_symlink = symlink_meta.file_type().is_symlink();
    let meta = fs::metadata(path).unwrap_or(symlink_meta);
    let is_dir = meta.is_dir();
    let is_hidden = is_hidden_file(&name, &meta);
    let extension = if is_dir {
        String::new()
    } else {
        path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    let category = classify_extension(&extension, is_dir);

    Some(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        is_hidden,
        is_symlink,
        size: if is_dir { 0 } else { meta.len() },
        modified_ms: system_time_to_ms(meta.modified()),
        created_ms: system_time_to_ms(meta.created()),
        extension,
        category,
    })
}

fn unique_dest_path(dest_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dest_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string());
    let ext = Path::new(file_name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    for i in 1..10_000 {
        let next = dest_dir.join(format!("{} ({}){}", stem, i, ext));
        if !next.exists() {
            return next;
        }
    }
    candidate
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir_path = PathBuf::from(&path);
        if !dir_path.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        let read_dir = fs::read_dir(&dir_path).map_err(|e| format!("Cannot open {}: {}", path, e))?;

        let mut entries = Vec::with_capacity(256);
        for item in read_dir.flatten() {
            if let Some(entry) = build_entry_from_dir_entry(&item) {
                if !show_hidden && entry.is_hidden {
                    continue;
                }
                entries.push(entry);
            }
        }
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_drives() -> Result<Vec<DriveInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let disks = Disks::new_with_refreshed_list();
        let mut drives: Vec<DriveInfo> = disks
            .iter()
            .map(|d| {
                let mount = d.mount_point().to_string_lossy().to_string();
                let vol = d.name().to_string_lossy().to_string();
                let name = if vol.is_empty() {
                    format!("Local Disk ({})", mount.trim_end_matches('\\'))
                } else {
                    format!("{} ({})", vol, mount.trim_end_matches('\\'))
                };
                DriveInfo {
                    name,
                    mount_point: mount,
                    total_space: d.total_space(),
                    available_space: d.available_space(),
                    is_removable: d.is_removable(),
                }
            })
            .collect();
        drives.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
        Ok(drives)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_quick_access() -> Vec<QuickAccessItem> {
    let mut items = Vec::new();
    let candidates: Vec<(&str, Option<PathBuf>, &str)> = vec![
        ("Home", dirs::home_dir(), "home"),
        ("Desktop", dirs::desktop_dir(), "monitor"),
        ("Downloads", dirs::download_dir(), "download"),
        ("Documents", dirs::document_dir(), "file-text"),
        ("Pictures", dirs::picture_dir(), "image"),
        ("Music", dirs::audio_dir(), "music"),
        ("Videos", dirs::video_dir(), "film"),
    ];
    for (name, opt_path, icon) in candidates {
        if let Some(p) = opt_path {
            if p.exists() {
                items.push(QuickAccessItem {
                    name: name.to_string(),
                    path: p.to_string_lossy().to_string(),
                    icon: icon.to_string(),
                });
            }
        }
    }
    items
}

#[tauri::command]
pub async fn search_recursive(
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let limit = max_results.unwrap_or(300);
        let mut results = Vec::new();

        for entry in WalkDir::new(&root)
            .min_depth(1)
            .max_depth(8)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                name != ".git"
                    && name != "node_modules"
                    && name != "$RECYCLE.BIN"
                    && name != "System Volume Information"
            })
            .flatten()
        {
            let fname = entry.file_name().to_string_lossy().to_lowercase();
            if fname.contains(&q) {
                if let Some(fe) = build_file_entry(entry.path()) {
                    results.push(fe);
                    if results.len() >= limit {
                        break;
                    }
                }
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_text_preview(path: String, max_bytes: Option<usize>) -> Result<TextPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let limit = max_bytes.unwrap_or(131_072); // 128 KB
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let total_size = meta.len();

        let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; limit.min(total_size as usize)];
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        buf.truncate(n);

        // Support UTF-16LE with BOM (common for Windows .reg / .ini / PowerShell logs)
        let content = if n >= 2 && buf[0] == 0xFF && buf[1] == 0xFE {
            let u16s: Vec<u16> = buf[2..n]
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            String::from_utf16_lossy(&u16s)
        } else {
            // Quick binary detection (null bytes in first 2KB)
            let check_len = n.min(2048);
            if buf[..check_len].contains(&0) {
                return Err("Binary file cannot be previewed as text".to_string());
            }
            String::from_utf8_lossy(&buf).to_string()
        };
        let line_count = content.lines().count();
        Ok(TextPreview {
            content,
            truncated: total_size as usize > n,
            total_size,
            line_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn inspect_zip(path: String) -> Result<Vec<ZipEntryInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let count = archive.len().min(500);
        let mut items = Vec::with_capacity(count);
        for i in 0..count {
            if let Ok(entry) = archive.by_index(i) {
                items.push(ZipEntryInfo {
                    name: entry.name().to_string(),
                    size: entry.size(),
                    compressed_size: entry.compressed_size(),
                    is_dir: entry.is_dir(),
                });
            }
        }
        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extract_zip(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = PathBuf::from(&path);
        let parent = src.parent().ok_or("No parent directory")?;
        let stem = src
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Extracted".to_string());
        let dest = unique_dest_path(parent, &stem);

        let file = fs::File::open(&src).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&dest).map_err(|e| e.to_string())?;
        Ok(dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_folder_summary(path: String) -> Result<FolderSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let read_dir = fs::read_dir(&path).map_err(|e| e.to_string())?;
        let mut file_count = 0usize;
        let mut dir_count = 0usize;
        let mut immediate_size = 0u64;
        let mut sample_items = Vec::new();

        for item in read_dir.flatten() {
            if let Ok(meta) = item.metadata() {
                if meta.is_dir() {
                    dir_count += 1;
                } else {
                    file_count += 1;
                    immediate_size += meta.len();
                }
                if sample_items.len() < 16 {
                    sample_items.push(item.file_name().to_string_lossy().to_string());
                }
            }
        }
        Ok(FolderSummary {
            file_count,
            dir_count,
            immediate_size,
            sample_items,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open {}: {}", path, e))
}

#[tauri::command]
pub fn open_with_dialog(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .args(["shell32.dll,OpenAs_RunDLL", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let wt = Command::new("wt.exe").args(["-d", &path]).spawn();
        if wt.is_ok() {
            return Ok(());
        }
        Command::new("cmd.exe")
            .args(["/c", "start", "powershell.exe", "-NoExit", "-Command", &format!("Set-Location -LiteralPath '{}'", path.replace('\'', "''"))])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn create_folder(parent: String, name: String) -> Result<String, String> {
    let dest = unique_dest_path(Path::new(&parent), name.trim());
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_file(parent: String, name: String) -> Result<String, String> {
    let dest = unique_dest_path(Path::new(&parent), name.trim());
    fs::File::create(&dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_name: String) -> Result<String, String> {
    let src = PathBuf::from(&old_path);
    let parent = src.parent().ok_or("Cannot determine parent folder")?;
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    let dst = parent.join(trimmed);
    if dst == src {
        return Ok(old_path);
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_entries(paths: Vec<String>, permanent: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if permanent {
            for p in &paths {
                let pb = PathBuf::from(p);
                if pb.is_dir() {
                    fs::remove_dir_all(&pb).map_err(|e| e.to_string())?;
                } else if pb.exists() {
                    fs::remove_file(&pb).map_err(|e| e.to_string())?;
                }
            }
        } else {
            trash::delete_all(&paths).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_entries(sources: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(&dest_dir);
        let mut created = Vec::new();
        for s in sources {
            let src = PathBuf::from(&s);
            let fname = src
                .file_name()
                .ok_or("Invalid source path")?
                .to_string_lossy()
                .to_string();
            let target = unique_dest_path(&dest, &fname);
            if src.is_dir() {
                copy_dir_recursive(&src, &target)?;
            } else {
                fs::copy(&src, &target).map_err(|e| e.to_string())?;
            }
            created.push(target.to_string_lossy().to_string());
        }
        Ok(created)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn move_entries(sources: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(&dest_dir);
        let mut moved = Vec::new();
        for s in sources {
            let src = PathBuf::from(&s);
            if src.parent() == Some(dest.as_path()) {
                continue;
            }
            let fname = src
                .file_name()
                .ok_or("Invalid source path")?
                .to_string_lossy()
                .to_string();
            let target = unique_dest_path(&dest, &fname);
            if fs::rename(&src, &target).is_err() {
                // Cross-drive fallback: copy then delete
                if src.is_dir() {
                    copy_dir_recursive(&src, &target)?;
                    fs::remove_dir_all(&src).map_err(|e| e.to_string())?;
                } else {
                    fs::copy(&src, &target).map_err(|e| e.to_string())?;
                    fs::remove_file(&src).map_err(|e| e.to_string())?;
                }
            }
            moved.push(target.to_string_lossy().to_string());
        }
        Ok(moved)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn batch_move(moves: Vec<BatchMoveItem>) -> Result<Vec<BatchMoveItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut executed = Vec::new();
        for item in moves {
            let src = PathBuf::from(&item.from);
            if !src.exists() {
                continue;
            }
            let dst_raw = PathBuf::from(&item.to);
            if let Some(parent) = dst_raw.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                let fname = dst_raw
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let final_dst = unique_dest_path(parent, &fname);
                fs::rename(&src, &final_dst).map_err(|e| e.to_string())?;
                executed.push(BatchMoveItem {
                    from: final_dst.to_string_lossy().to_string(),
                    to: item.from,
                });
            }
        }
        Ok(executed)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    state.watch(app, path)
}

#[tauri::command]
pub fn open_special_folder(target: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let shell_uri = match target.as_str() {
            "recycle-bin" => "shell:RecycleBinFolder",
            "network" => "shell:NetworkPlacesFolder",
            _ => return Err("Unknown special folder".to_string()),
        };
        Command::new("explorer.exe")
            .arg(shell_uri)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = target;
        Ok(())
    }
}

#[tauri::command]
pub fn show_native_properties(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let pb = PathBuf::from(&path);
        let parent = pb
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let name = pb
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if parent.is_empty() || name.is_empty() {
            return Err("Cannot open properties for root drive".to_string());
        }
        let script = format!(
            "$s = New-Object -ComObject Shell.Application; $f = $s.Namespace('{}'); if ($f) {{ $i = $f.ParseName('{}'); if ($i) {{ $i.InvokeVerb('properties'); Start-Sleep -Milliseconds 1500 }} }}",
            parent.replace('\'', "''"),
            name.replace('\'', "''")
        );
        Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub async fn list_gallery_images(max_results: Option<usize>) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let limit = max_results.unwrap_or(400);
        let mut roots = Vec::new();
        if let Some(p) = dirs::picture_dir() {
            if p.exists() {
                roots.push(p);
            }
        }
        if let Some(d) = dirs::download_dir() {
            if d.exists() {
                roots.push(d);
            }
        }

        let mut images = Vec::new();
        for root in roots {
            for entry in WalkDir::new(&root)
                .min_depth(1)
                .max_depth(3)
                .into_iter()
                .flatten()
            {
                if entry.file_type().is_file() {
                    if let Some(fe) = build_file_entry(entry.path()) {
                        if fe.category == "image" && !fe.is_hidden {
                            images.push(fe);
                            if images.len() >= limit * 2 {
                                break;
                            }
                        }
                    }
                }
            }
        }
        images.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
        images.truncate(limit);
        Ok(images)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn calculate_folder_size(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut total: u64 = 0;
        for entry in WalkDir::new(&path).into_iter().flatten() {
            if entry.file_type().is_file() {
                if let Ok(meta) = entry.metadata() {
                    total = total.saturating_add(meta.len());
                }
            }
        }
        Ok(total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn compress_to_zip(paths: Vec<String>, dest_dir: String, zip_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let final_name = if zip_name.to_lowercase().ends_with(".zip") {
            zip_name
        } else {
            format!("{}.zip", zip_name)
        };
        let out_path = unique_dest_path(Path::new(&dest_dir), &final_name);
        let file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let mut buf = Vec::new();
        for p in paths {
            let src = PathBuf::from(&p);
            if !src.exists() {
                continue;
            }
            let base_name = src
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if src.is_file() {
                zip.start_file(&base_name, options).map_err(|e| e.to_string())?;
                buf.clear();
                fs::File::open(&src)
                    .and_then(|mut f| f.read_to_end(&mut buf))
                    .map_err(|e| e.to_string())?;
                zip.write_all(&buf).map_err(|e| e.to_string())?;
            } else if src.is_dir() {
                for entry in WalkDir::new(&src).into_iter().flatten() {
                    let ep = entry.path();
                    let rel = ep.strip_prefix(&src).unwrap_or(ep);
                    let zip_entry_name = if rel.as_os_str().is_empty() {
                        base_name.clone()
                    } else {
                        format!(
                            "{}/{}",
                            base_name,
                            rel.to_string_lossy().replace('\\', "/")
                        )
                    };
                    if ep.is_dir() {
                        let _ = zip.add_directory(&zip_entry_name, options);
                    } else if ep.is_file() {
                        zip.start_file(&zip_entry_name, options)
                            .map_err(|e| e.to_string())?;
                        buf.clear();
                        fs::File::open(ep)
                            .and_then(|mut f| f.read_to_end(&mut buf))
                            .map_err(|e| e.to_string())?;
                        zip.write_all(&buf).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(out_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_startup_path(state: State<'_, crate::StartupPath>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[tauri::command]
pub fn is_default_file_manager() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let out = Command::new("reg.exe")
            .args(["query", r"HKCU\Software\Classes\Directory\shell", "/ve"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            return text.contains("open_in_folio");
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn set_default_file_manager(enable: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let run_reg = |args: &[&str]| -> Result<(), String> {
            let status = Command::new("reg.exe")
                .args(args)
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                Ok(())
            } else {
                Err(format!("reg.exe failed for {:?}", args))
            }
        };

        if enable {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = exe.to_string_lossy().to_string();
            let cmd_val = format!("\"{}\" \"%1\"", exe_str);
            let icon_val = format!("\"{}\",0", exe_str);

            for class_root in [
                r"HKCU\Software\Classes\Directory\shell",
                r"HKCU\Software\Classes\Drive\shell",
            ] {
                let verb_key = format!(r"{}\open_in_folio", class_root);
                let cmd_key = format!(r"{}\command", verb_key);
                run_reg(&["add", &verb_key, "/ve", "/d", "Open in Folio", "/f"])?;
                run_reg(&["add", &verb_key, "/v", "Icon", "/d", &icon_val, "/f"])?;
                run_reg(&["add", &cmd_key, "/ve", "/d", &cmd_val, "/f"])?;
                run_reg(&["add", class_root, "/ve", "/d", "open_in_folio", "/f"])?;
            }
            Ok(true)
        } else {
            for class_root in [
                r"HKCU\Software\Classes\Directory\shell",
                r"HKCU\Software\Classes\Drive\shell",
            ] {
                let verb_key = format!(r"{}\open_in_folio", class_root);
                let _ = run_reg(&["delete", &verb_key, "/f"]);
                let _ = run_reg(&["add", class_root, "/ve", "/d", "none", "/f"]);
            }
            Ok(false)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        Ok(false)
    }
}

#[tauri::command]
pub fn set_window_effect(window: WebviewWindow, effect: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{
            apply_acrylic, apply_mica, apply_tabbed, clear_acrylic, clear_mica, clear_tabbed,
        };
        let _ = clear_acrylic(&window);
        let _ = clear_mica(&window);
        let _ = clear_tabbed(&window);

        match effect.as_str() {
            "acrylic" => {
                let _ = apply_acrylic(&window, Some((10, 13, 18, 96)));
            }
            "mica" => {
                let _ = apply_mica(&window, Some(true));
            }
            "tabbed" => {
                let _ = apply_tabbed(&window, Some(true));
            }
            _ => {}
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, effect);
    }
    Ok(())
}
