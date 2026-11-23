use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeParagraph {
    pub text: String,
    pub heading: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeSheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeSlide {
    pub number: usize,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficePreview {
    pub kind: String, // "document" | "spreadsheet" | "presentation"
    pub title: Option<String>,
    pub paragraphs: Vec<OfficeParagraph>,
    pub sheets: Vec<OfficeSheet>,
    pub slides: Vec<OfficeSlide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutableInfo {
    pub architecture: String,
    pub subsystem: String,
    pub file_description: Option<String>,
    pub product_name: Option<String>,
    pub company_name: Option<String>,
    pub file_version: Option<String>,
    pub copyright: Option<String>,
    pub shortcut_target: Option<String>,
}

fn decode_xml_entities(input: &str) -> String {
    if !input.contains('&') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        if let Some(semi) = rest.find(';') {
            let entity = &rest[1..semi];
            match entity {
                "amp" => out.push('&'),
                "lt" => out.push('<'),
                "gt" => out.push('>'),
                "quot" => out.push('"'),
                "apos" => out.push('\''),
                "nbsp" => out.push(' '),
                s if s.starts_with("#x") || s.starts_with("#X") => {
                    if let Ok(code) = u32::from_str_radix(&s[2..], 16) {
                        if let Some(ch) = char::from_u32(code) {
                            out.push(ch);
                        }
                    }
                }
                s if s.starts_with('#') => {
                    if let Ok(code) = s[1..].parse::<u32>() {
                        if let Some(ch) = char::from_u32(code) {
                            out.push(ch);
                        }
                    }
                }
                _ => {
                    out.push('&');
                    out.push_str(entity);
                    out.push(';');
                }
            }
            rest = &rest[semi + 1..];
        } else {
            out.push_str(rest);
            break;
        }
    }
    out.push_str(rest);
    out
}

fn extract_tag_texts(xml: &str, tag_open_prefix: &str, tag_close: &str) -> String {
    let mut buf = String::new();
    let mut rest = xml;
    while let Some(start) = rest.find(tag_open_prefix) {
        let after = &rest[start + tag_open_prefix.len()..];
        // Ensure next char is '>' or whitespace (not another tag name like <w:tbl>)
        let next_ch = after.chars().next();
        if next_ch != Some('>') && next_ch != Some(' ') && next_ch != Some('\t') {
            rest = after;
            continue;
        }
        if let Some(gt) = after.find('>') {
            let content_start = &after[gt + 1..];
            if let Some(end) = content_start.find(tag_close) {
                buf.push_str(&decode_xml_entities(&content_start[..end]));
                rest = &content_start[end + tag_close.len()..];
                continue;
            }
        }
        break;
    }
    buf
}

fn parse_docx_xml(xml: &str) -> Vec<OfficeParagraph> {
    let mut paragraphs = Vec::new();
    let mut rest = xml;
    while let Some(p_start) = rest.find("<w:p") {
        let after_p = &rest[p_start + 4..];
        let next_ch = after_p.chars().next();
        if next_ch != Some('>') && next_ch != Some(' ') {
            rest = after_p;
            continue;
        }
        if let Some(p_end) = after_p.find("</w:p>") {
            let p_xml = &after_p[..p_end];
            let heading = p_xml.contains("Heading") || p_xml.contains("Title");
            let text = extract_tag_texts(p_xml, "<w:t", "</w:t>");
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                paragraphs.push(OfficeParagraph {
                    text: trimmed.to_string(),
                    heading,
                });
                if paragraphs.len() >= 600 {
                    break;
                }
            }
            rest = &after_p[p_end + 6..];
        } else {
            break;
        }
    }
    paragraphs
}

fn col_ref_to_index(cell_ref: &str) -> usize {
    let mut col: usize = 0;
    for ch in cell_ref.chars() {
        if ch.is_ascii_alphabetic() {
            col = col * 26 + ((ch.to_ascii_uppercase() as usize) - ('A' as usize) + 1);
        } else {
            break;
        }
    }
    col.saturating_sub(1)
}

fn parse_xlsx_shared_strings(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(si_start) = rest.find("<si") {
        let after = &rest[si_start + 3..];
        if let Some(si_end) = after.find("</si>") {
            let si_xml = &after[..si_end];
            out.push(extract_tag_texts(si_xml, "<t", "</t>"));
            rest = &after[si_end + 5..];
        } else {
            break;
        }
    }
    out
}

fn parse_xlsx_sheet(xml: &str, shared: &[String], name: String) -> OfficeSheet {
    const MAX_ROWS: usize = 160;
    const MAX_COLS: usize = 26;
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut max_col_used = 0usize;
    let mut truncated = false;

    let mut rest = xml;
    while let Some(r_start) = rest.find("<row") {
        let after = &rest[r_start + 4..];
        let next_ch = after.chars().next();
        if next_ch != Some(' ') && next_ch != Some('>') && next_ch != Some('/') {
            rest = after;
            continue;
        }
        let Some(open_gt) = after.find('>') else {
            break;
        };
        if after[..open_gt].ends_with('/') {
            // Self-closing empty <row .../>
            rest = &after[open_gt + 1..];
            continue;
        }
        let row_body_start = &after[open_gt + 1..];
        let Some(r_end) = row_body_start.find("</row>") else {
            break;
        };
        if rows.len() >= MAX_ROWS {
            truncated = true;
            break;
        }
        let row_xml = &row_body_start[..r_end];
        let mut row_cells: Vec<(usize, String)> = Vec::new();
        let mut c_rest = row_xml;
        while let Some(c_start) = c_rest.find("<c") {
            let c_after = &c_rest[c_start + 2..];
            let next_ch = c_after.chars().next();
            if next_ch != Some(' ') && next_ch != Some('>') {
                c_rest = c_after;
                continue;
            }
            let Some(tag_gt) = c_after.find('>') else {
                break;
            };
            let header = &c_after[..tag_gt];
            let self_closing = header.ends_with('/');

            let col_idx = header
                .find("r=\"")
                .and_then(|pos| {
                    let s = &header[pos + 3..];
                    s.find('"').map(|e| col_ref_to_index(&s[..e]))
                })
                .unwrap_or(row_cells.len());

            let cell_type = header
                .find("t=\"")
                .and_then(|pos| {
                    let s = &header[pos + 3..];
                    s.find('"').map(|e| &s[..e])
                })
                .unwrap_or("");

            if self_closing {
                c_rest = &c_after[tag_gt + 1..];
                continue;
            }

            let body_after = &c_after[tag_gt + 1..];
            let Some(c_end) = body_after.find("</c>") else {
                break;
            };
            let cell_body = &body_after[..c_end];

            let value = if cell_type == "inlineStr" {
                extract_tag_texts(cell_body, "<t", "</t>")
            } else {
                let raw_v = extract_tag_texts(cell_body, "<v", "</v>");
                if cell_type == "s" {
                    raw_v
                        .trim()
                        .parse::<usize>()
                        .ok()
                        .and_then(|idx| shared.get(idx))
                        .cloned()
                        .unwrap_or_default()
                } else if cell_type == "b" {
                    if raw_v.trim() == "1" {
                        "TRUE".to_string()
                    } else {
                        "FALSE".to_string()
                    }
                } else {
                    raw_v
                }
            };

            if col_idx < MAX_COLS && !value.is_empty() {
                max_col_used = max_col_used.max(col_idx + 1);
                row_cells.push((col_idx, value));
            }
            c_rest = &body_after[c_end + 4..];
        }

        if !row_cells.is_empty() {
            let width = row_cells.iter().map(|(c, _)| c + 1).max().unwrap_or(0);
            let mut vec_row = vec![String::new(); width];
            for (c, v) in row_cells {
                if c < vec_row.len() {
                    vec_row[c] = v;
                }
            }
            rows.push(vec_row);
        }
        rest = &row_body_start[r_end + 6..];
    }

    // Normalize row lengths to max_col_used
    for r in &mut rows {
        if r.len() < max_col_used {
            r.resize(max_col_used, String::new());
        }
    }

    OfficeSheet {
        name,
        rows,
        truncated,
    }
}

fn parse_pptx_slide_xml(xml: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut rest = xml;
    while let Some(p_start) = rest.find("<a:p") {
        let after = &rest[p_start + 4..];
        let next_ch = after.chars().next();
        if next_ch != Some('>') && next_ch != Some(' ') {
            rest = after;
            continue;
        }
        if let Some(p_end) = after.find("</a:p>") {
            let p_xml = &after[..p_end];
            let text = extract_tag_texts(p_xml, "<a:t", "</a:t>");
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                lines.push(trimmed.to_string());
            }
            rest = &after[p_end + 6..];
        } else {
            break;
        }
    }
    lines
}

fn strip_html_tags(html: &str) -> Vec<OfficeParagraph> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_tag = false;
    let mut in_script_or_style = false;
    let mut tag_name = String::new();

    let chars: Vec<char> = html.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '<' {
            in_tag = true;
            tag_name.clear();
        } else if ch == '>' && in_tag {
            in_tag = false;
            let t = tag_name.trim().to_lowercase();
            if t.starts_with("script") || t.starts_with("style") {
                in_script_or_style = true;
            } else if t.starts_with("/script") || t.starts_with("/style") {
                in_script_or_style = false;
            } else if matches!(
                t.split_whitespace().next().unwrap_or(""),
                "/p" | "/div" | "/h1" | "/h2" | "/h3" | "/li" | "br" | "br/"
            ) {
                let decoded = decode_xml_entities(&cur);
                let trimmed = decoded.trim();
                if !trimmed.is_empty() {
                    let heading = t.starts_with("/h1") || t.starts_with("/h2") || t.starts_with("/h3");
                    out.push(OfficeParagraph {
                        text: trimmed.to_string(),
                        heading,
                    });
                }
                cur.clear();
            }
        } else if in_tag {
            tag_name.push(ch);
        } else if !in_script_or_style {
            cur.push(ch);
        }
        i += 1;
    }

    let decoded = decode_xml_entities(&cur);
    let trimmed = decoded.trim();
    if !trimmed.is_empty() {
        out.push(OfficeParagraph {
            text: trimmed.to_string(),
            heading: false,
        });
    }
    out
}

fn strip_rtf(rtf: &str) -> Vec<OfficeParagraph> {
    let mut text = String::new();
    let bytes = rtf.as_bytes();
    let mut i = 0;
    let mut skip_group_depth: Option<usize> = None;
    let mut depth = 0usize;

    while i < bytes.len() {
        let b = bytes[i];
        if b == b'{' {
            depth += 1;
            let mut look = i + 1;
            while look < bytes.len() && bytes[look].is_ascii_whitespace() {
                look += 1;
            }
            let tail = &bytes[look..];
            if skip_group_depth.is_none()
                && (tail.starts_with(b"\\fonttbl")
                    || tail.starts_with(b"\\colortbl")
                    || tail.starts_with(b"\\stylesheet")
                    || tail.starts_with(b"\\info")
                    || tail.starts_with(b"\\*\\"))
            {
                skip_group_depth = Some(depth);
            }
            i += 1;
        } else if b == b'}' {
            if skip_group_depth == Some(depth) {
                skip_group_depth = None;
            }
            depth = depth.saturating_sub(1);
            i += 1;
        } else if skip_group_depth.is_some() {
            i += 1;
        } else if b == b'\\' {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            let next = bytes[i];
            if next == b'\\' || next == b'{' || next == b'}' {
                text.push(next as char);
                i += 1;
            } else if next == b'\'' && i + 2 < bytes.len() {
                if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                    if let Ok(code) = u8::from_str_radix(hex_str, 16) {
                        text.push(code as char);
                    }
                }
                i += 3;
            } else {
                let start = i;
                while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                    i += 1;
                }
                let word = std::str::from_utf8(&bytes[start..i]).unwrap_or("");
                if i < bytes.len() && (bytes[i] == b'-' || bytes[i].is_ascii_digit()) {
                    i += 1;
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        i += 1;
                    }
                }
                if i < bytes.len() && bytes[i] == b' ' {
                    i += 1;
                }
                if word == "par" || word == "line" {
                    text.push('\n');
                } else if word == "tab" {
                    text.push('\t');
                }
            }
        } else if b == b'\r' || b == b'\n' {
            i += 1;
        } else if b < 0x80 {
            text.push(b as char);
            i += 1;
        } else {
            // Preserve valid multi-byte UTF-8 characters safely
            if let Some(ch) = rtf.get(i..).and_then(|s| s.chars().next()) {
                text.push(ch);
                i += ch.len_utf8();
            } else {
                i += 1;
            }
        }
    }

    text.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .take(500)
        .map(|l| OfficeParagraph {
            text: l.to_string(),
            heading: false,
        })
        .collect()
}

pub fn inspect_office_sync(path: &str) -> Result<OfficePreview, String> {
    let p = Path::new(path);
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if ext == "rtf" {
        let mut f = fs::File::open(p).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 262_144];
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        let raw = String::from_utf8_lossy(&buf[..n]);
        return Ok(OfficePreview {
            kind: "document".to_string(),
            title: None,
            paragraphs: strip_rtf(&raw),
            sheets: Vec::new(),
            slides: Vec::new(),
        });
    }

    let file = fs::File::open(p).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Cannot read document archive: {}", e))?;

    match ext.as_str() {
        "docx" => {
            let mut xml = String::new();
            archive
                .by_name("word/document.xml")
                .map_err(|e| e.to_string())?
                .read_to_string(&mut xml)
                .map_err(|e| e.to_string())?;
            Ok(OfficePreview {
                kind: "document".to_string(),
                title: None,
                paragraphs: parse_docx_xml(&xml),
                sheets: Vec::new(),
                slides: Vec::new(),
            })
        }
        "xlsx" => {
            let mut shared = Vec::new();
            if let Ok(mut ss) = archive.by_name("xl/sharedStrings.xml") {
                let mut xml = String::new();
                if ss.read_to_string(&mut xml).is_ok() {
                    shared = parse_xlsx_shared_strings(&xml);
                }
            }

            // Read sheet names from xl/workbook.xml
            let mut sheet_names = Vec::new();
            if let Ok(mut wb) = archive.by_name("xl/workbook.xml") {
                let mut xml = String::new();
                if wb.read_to_string(&mut xml).is_ok() {
                    let mut rest = xml.as_str();
                    while let Some(pos) = rest.find("<sheet ") {
                        let after = &rest[pos + 7..];
                        if let Some(gt) = after.find('>') {
                            let tag = &after[..gt];
                            if let Some(np) = tag.find("name=\"") {
                                let ns = &tag[np + 6..];
                                if let Some(ne) = ns.find('"') {
                                    sheet_names.push(decode_xml_entities(&ns[..ne]));
                                }
                            }
                            rest = &after[gt + 1..];
                        } else {
                            break;
                        }
                    }
                }
            }

            let mut sheet_paths: Vec<(usize, String)> = Vec::new();
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                        let num = name
                            .trim_start_matches("xl/worksheets/sheet")
                            .trim_end_matches(".xml")
                            .parse::<usize>()
                            .unwrap_or(999);
                        sheet_paths.push((num, name));
                    }
                }
            }
            sheet_paths.sort_by_key(|(n, _)| *n);
            sheet_paths.truncate(5);

            let mut sheets = Vec::new();
            for (idx, (_, sp)) in sheet_paths.into_iter().enumerate() {
                if let Ok(mut sf) = archive.by_name(&sp) {
                    let mut xml = String::new();
                    if sf.read_to_string(&mut xml).is_ok() {
                        let sname = sheet_names
                            .get(idx)
                            .cloned()
                            .unwrap_or_else(|| format!("Sheet {}", idx + 1));
                        sheets.push(parse_xlsx_sheet(&xml, &shared, sname));
                    }
                }
            }

            Ok(OfficePreview {
                kind: "spreadsheet".to_string(),
                title: None,
                paragraphs: Vec::new(),
                sheets,
                slides: Vec::new(),
            })
        }
        "pptx" => {
            let mut slide_paths: Vec<(usize, String)> = Vec::new();
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                        let num = name
                            .trim_start_matches("ppt/slides/slide")
                            .trim_end_matches(".xml")
                            .parse::<usize>()
                            .unwrap_or(999);
                        slide_paths.push((num, name));
                    }
                }
            }
            slide_paths.sort_by_key(|(n, _)| *n);
            slide_paths.truncate(40);

            let mut slides = Vec::new();
            for (num, sp) in slide_paths {
                if let Ok(mut sf) = archive.by_name(&sp) {
                    let mut xml = String::new();
                    if sf.read_to_string(&mut xml).is_ok() {
                        slides.push(OfficeSlide {
                            number: num,
                            lines: parse_pptx_slide_xml(&xml),
                        });
                    }
                }
            }

            Ok(OfficePreview {
                kind: "presentation".to_string(),
                title: None,
                paragraphs: Vec::new(),
                sheets: Vec::new(),
                slides,
            })
        }
        "odt" => {
            let mut xml = String::new();
            archive
                .by_name("content.xml")
                .map_err(|e| e.to_string())?
                .read_to_string(&mut xml)
                .map_err(|e| e.to_string())?;
            let paragraphs = strip_html_tags(&xml).into_iter().take(500).collect();
            Ok(OfficePreview {
                kind: "document".to_string(),
                title: None,
                paragraphs,
                sheets: Vec::new(),
                slides: Vec::new(),
            })
        }
        "epub" => {
            let mut html_entries = Vec::new();
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    let lower = name.to_lowercase();
                    if lower.ends_with(".xhtml") || lower.ends_with(".html") || lower.ends_with(".htm") {
                        html_entries.push(name);
                    }
                }
            }
            html_entries.sort();
            let mut paragraphs = Vec::new();
            for name in html_entries.into_iter().take(6) {
                if let Ok(mut ef) = archive.by_name(&name) {
                    let mut html = String::new();
                    if ef.read_to_string(&mut html).is_ok() {
                        paragraphs.extend(strip_html_tags(&html));
                        if paragraphs.len() >= 300 {
                            paragraphs.truncate(300);
                            break;
                        }
                    }
                }
            }
            Ok(OfficePreview {
                kind: "document".to_string(),
                title: None,
                paragraphs,
                sheets: Vec::new(),
                slides: Vec::new(),
            })
        }
        _ => Err(format!("Unsupported office format: .{}", ext)),
    }
}

#[tauri::command]
pub async fn inspect_office_document(path: String) -> Result<OfficePreview, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_office_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn parse_pe_headers(bytes: &[u8]) -> (String, String) {
    if bytes.len() < 0x40 || &bytes[0..2] != b"MZ" {
        return ("Unknown".to_string(), "Unknown".to_string());
    }
    let pe_offset = u32::from_le_bytes([bytes[0x3c], bytes[0x3d], bytes[0x3e], bytes[0x3f]]) as usize;
    let Some(pe_hdr_end) = pe_offset.checked_add(24) else {
        return ("Unknown".to_string(), "Unknown".to_string());
    };
    if pe_hdr_end > bytes.len() || &bytes[pe_offset..pe_offset + 4] != b"PE\0\0" {
        return ("Unknown".to_string(), "Unknown".to_string());
    }
    let machine = u16::from_le_bytes([bytes[pe_offset + 4], bytes[pe_offset + 5]]);
    let arch = match machine {
        0x8664 => "64-bit (x64)",
        0x014c => "32-bit (x86)",
        0xaa64 => "64-bit (ARM64)",
        _ => "Binary",
    }
    .to_string();

    let opt_offset = pe_offset + 24;
    let subsystem = if opt_offset + 70 <= bytes.len() {
        let sub = u16::from_le_bytes([bytes[opt_offset + 68], bytes[opt_offset + 69]]);
        match sub {
            2 => "Windows GUI Application",
            3 => "Console Application",
            1 => "Native Driver / System",
            _ => "Windows Executable",
        }
        .to_string()
    } else {
        "Windows Executable".to_string()
    };

    (arch, subsystem)
}

#[cfg(target_os = "windows")]
fn read_version_strings(path: &str) -> HashMap<String, String> {
    use std::ffi::{c_void, OsStr};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    #[link(name = "version")]
    extern "system" {
        fn GetFileVersionInfoSizeW(lptstr_filename: *const u16, lpdw_handle: *mut u32) -> u32;
        fn GetFileVersionInfoW(
            lptstr_filename: *const u16,
            dw_handle: u32,
            dw_len: u32,
            lp_data: *mut c_void,
        ) -> i32;
        fn VerQueryValueW(
            p_block: *const c_void,
            lp_sub_block: *const u16,
            lplp_buffer: *mut *mut c_void,
            pu_len: *mut u32,
        ) -> i32;
    }

    let mut map = HashMap::new();
    let wide_path: Vec<u16> = OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let mut handle: u32 = 0;
    let size = unsafe { GetFileVersionInfoSizeW(wide_path.as_ptr(), &mut handle) };
    if size == 0 || size > 4 * 1024 * 1024 {
        return map;
    }
    let mut data = vec![0u8; size as usize];
    let ok = unsafe {
        GetFileVersionInfoW(
            wide_path.as_ptr(),
            0,
            size,
            data.as_mut_ptr() as *mut c_void,
        )
    };
    if ok == 0 {
        return map;
    }

    // Query translation table
    let trans_q: Vec<u16> = OsStr::new("\\VarFileInfo\\Translation")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut buf_ptr: *mut c_void = ptr::null_mut();
    let mut buf_len: u32 = 0;
    let mut lang_cp = "040904B0".to_string();
    if unsafe {
        VerQueryValueW(
            data.as_ptr() as *const c_void,
            trans_q.as_ptr(),
            &mut buf_ptr,
            &mut buf_len,
        )
    } != 0
        && !buf_ptr.is_null()
        && buf_len >= 4
    {
        let pair = unsafe { std::slice::from_raw_parts(buf_ptr as *const u16, 2) };
        lang_cp = format!("{:04X}{:04X}", pair[0], pair[1]);
    }

    for field in [
        "FileDescription",
        "ProductName",
        "CompanyName",
        "FileVersion",
        "LegalCopyright",
    ] {
        let sub = format!("\\StringFileInfo\\{}\\{}", lang_cp, field);
        let wide_sub: Vec<u16> = OsStr::new(&sub).encode_wide().chain(std::iter::once(0)).collect();
        let mut val_ptr: *mut c_void = ptr::null_mut();
        let mut val_len: u32 = 0;
        if unsafe {
            VerQueryValueW(
                data.as_ptr() as *const c_void,
                wide_sub.as_ptr(),
                &mut val_ptr,
                &mut val_len,
            )
        } != 0
            && !val_ptr.is_null()
            && val_len > 1
        {
            let slice = unsafe { std::slice::from_raw_parts(val_ptr as *const u16, val_len as usize) };
            let trimmed_len = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
            let s = String::from_utf16_lossy(&slice[..trimmed_len]).trim().to_string();
            if !s.is_empty() {
                map.insert(field.to_string(), s);
            }
        }
    }

    map
}

#[cfg(target_os = "windows")]
fn resolve_lnk_target(path: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{}'); Write-Output $s.TargetPath",
        path.replace('\'', "''")
    );
    let out = std::process::Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output()
        .ok()?;
    let target = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if target.is_empty() {
        None
    } else {
        Some(target)
    }
}

pub fn inspect_executable_sync(path: &str) -> Result<ExecutableInfo, String> {
    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mut shortcut_target = None;
    let target_for_pe = if ext == "lnk" {
        #[cfg(target_os = "windows")]
        {
            shortcut_target = resolve_lnk_target(path);
        }
        shortcut_target.as_deref().unwrap_or(path)
    } else {
        path
    };

    let (arch, subsystem) = if let Ok(mut f) = fs::File::open(target_for_pe) {
        let mut head = vec![0u8; 4096];
        let n = f.read(&mut head).unwrap_or(0);
        parse_pe_headers(&head[..n])
    } else {
        ("Unknown".to_string(), "Unknown".to_string())
    };

    #[cfg(target_os = "windows")]
    let strings = read_version_strings(target_for_pe);
    #[cfg(not(target_os = "windows"))]
    let strings: HashMap<String, String> = HashMap::new();

    Ok(ExecutableInfo {
        architecture: arch,
        subsystem,
        file_description: strings.get("FileDescription").cloned(),
        product_name: strings.get("ProductName").cloned(),
        company_name: strings.get("CompanyName").cloned(),
        file_version: strings.get("FileVersion").cloned(),
        copyright: strings.get("LegalCopyright").cloned(),
        shortcut_target,
    })
}

#[tauri::command]
pub async fn inspect_executable(path: String) -> Result<ExecutableInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_executable_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_subfolders(path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let read_dir = fs::read_dir(&path).map_err(|e| e.to_string())?;
        let mut dirs: Vec<String> = Vec::new();
        for item in read_dir.flatten() {
            if let Ok(ft) = item.file_type() {
                if ft.is_dir() {
                    let name = item.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') {
                        dirs.push(name);
                    }
                }
            }
        }
        dirs.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        dirs.truncate(120);
        Ok(dirs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_docx_paragraphs_and_entities() {
        let xml = r#"<w:document><w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hello &amp; Welcome</w:t></w:r></w:p>
            <w:p><w:r><w:t>Second </w:t></w:r><w:r><w:t>line &lt;ok&gt;</w:t></w:r></w:p>
        </w:body></w:document>"#;
        let paras = parse_docx_xml(xml);
        assert_eq!(paras.len(), 2);
        assert!(paras[0].heading);
        assert_eq!(paras[0].text, "Hello & Welcome");
        assert!(!paras[1].heading);
        assert_eq!(paras[1].text, "Second line <ok>");
    }

    #[test]
    fn parses_xlsx_sheet_with_shared_strings() {
        let shared = vec!["Name".to_string(), "Score".to_string(), "Alice".to_string()];
        let xml = r#"<worksheet><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
            <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>98</v></c></row>
        </sheetData></worksheet>"#;
        let sheet = parse_xlsx_sheet(xml, &shared, "Summary".to_string());
        assert_eq!(sheet.name, "Summary");
        assert_eq!(sheet.rows.len(), 2);
        assert_eq!(sheet.rows[0], vec!["Name", "Score"]);
        assert_eq!(sheet.rows[1], vec!["Alice", "98"]);
    }

    #[test]
    fn parses_pptx_and_strips_rtf() {
        let slide_xml = r#"<p:sld><p:cSld><p:spTree><p:sp><p:txBody>
            <a:p><a:r><a:t>Quarter Review</a:t></a:r></a:p>
            <a:p><a:r><a:t>Revenue &amp; Growth</a:t></a:r></a:p>
        </p:txBody></p:sp></p:spTree></p:cSld></p:sld>"#;
        let lines = parse_pptx_slide_xml(slide_xml);
        assert_eq!(lines, vec!["Quarter Review", "Revenue & Growth"]);

        let rtf = r#"{\rtf1\ansi{\fonttbl\f0 Segoe UI;}Hello \b World\b0\par Second line}"#;
        let paras = strip_rtf(rtf);
        assert_eq!(paras.len(), 2);
        assert_eq!(paras[0].text, "Hello World");
        assert_eq!(paras[1].text, "Second line");
    }

    #[test]
    fn inspects_notepad_pe_info() {
        #[cfg(target_os = "windows")]
        {
            let info = inspect_executable_sync(r"C:\Windows\notepad.exe").expect("notepad info");
            assert!(info.architecture.contains("64-bit") || info.architecture.contains("32-bit"));
            assert!(info.product_name.is_some() || info.file_description.is_some());
        }
    }

    #[test]
    fn handles_utf8_rtf_and_self_closing_xlsx_rows_and_corrupt_pe() {
        // Multi-byte UTF-8 near brace must not panic on char boundary
        let rtf = "{\\rtf1\\ansi{\\fonttbl\\f0 Arial;}Café — résumé 🚀\\par 日本語テスト}";
        let paras = strip_rtf(rtf);
        assert_eq!(paras.len(), 2);
        assert_eq!(paras[0].text, "Café — résumé 🚀");
        assert_eq!(paras[1].text, "日本語テスト");

        // Self-closing <row/> and <rowBreaks> must not swallow or break subsequent rows
        let shared = vec!["Alpha".to_string()];
        let xml = r#"<worksheet><sheetData>
            <row r="1"/>
            <row r="2"><c r="A2" t="s"><v>0</v></c></row>
        </sheetData><rowBreaks count="1"/></worksheet>"#;
        let sheet = parse_xlsx_sheet(xml, &shared, "Sheet1".to_string());
        assert_eq!(sheet.rows.len(), 1);
        assert_eq!(sheet.rows[0], vec!["Alpha"]);

        // Corrupt PE offset must not panic
        let mut bad_pe = vec![0u8; 64];
        bad_pe[0] = b'M';
        bad_pe[1] = b'Z';
        bad_pe[0x3c..0x40].copy_from_slice(&0xFFFF_FFF0u32.to_le_bytes());
        let (arch, sub) = parse_pe_headers(&bad_pe);
        assert_eq!(arch, "Unknown");
        assert_eq!(sub, "Unknown");
    }
}
