use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconRequest {
    pub path: String,
    pub extension: String,
    pub is_dir: bool,
}

static ICON_CACHE: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn cache() -> &'static RwLock<HashMap<String, String>> {
    ICON_CACHE.get_or_init(|| RwLock::new(HashMap::with_capacity(512)))
}

fn is_unique_icon_ext(ext: &str) -> bool {
    matches!(
        ext,
        "exe"
            | "lnk"
            | "ico"
            | "cur"
            | "ani"
            | "msi"
            | "msix"
            | "appx"
            | "scr"
            | "url"
            | "cpl"
            | "msc"
    )
}

pub fn cache_key_for_request(req: &IconRequest) -> String {
    let ext = req.extension.to_lowercase();
    if req.is_dir {
        // Only query shell icon for folders with custom desktop.ini, otherwise frontend uses crisp Fluent folder
        let desktop_ini = std::path::Path::new(&req.path).join("desktop.ini");
        if desktop_ini.exists() {
            return format!("file:{}", req.path.to_lowercase());
        }
        return String::new();
    }
    if is_unique_icon_ext(&ext) {
        format!("file:{}", req.path.to_lowercase())
    } else if !ext.is_empty() {
        format!("ext:.{}", ext)
    } else {
        "ext:.__file__".to_string()
    }
}

#[cfg(target_os = "windows")]
mod win {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::ffi::{c_void, OsStr};
    use std::mem::size_of;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    const SHGFI_ICON: u32 = 0x000000100;
    const SHGFI_LARGEICON: u32 = 0x000000000;
    const SHGFI_SYSICONINDEX: u32 = 0x000004000;
    const SHGFI_USEFILEATTRIBUTES: u32 = 0x000000010;
    const SHIL_EXTRALARGE: i32 = 0x2; // 48x48 crisp shell icons
    const ILD_TRANSPARENT: u32 = 0x00000001;
    const FILE_ATTRIBUTE_NORMAL: u32 = 0x00000080;
    const DIB_RGB_COLORS: u32 = 0;
    const BI_RGB: u32 = 0;
    const COINIT_APARTMENTTHREADED: u32 = 0x2;

    #[repr(C)]
    struct Guid {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    // IID_IImageList = {46EB5926-582E-4017-9FDF-E8998DAA0950}
    const IID_IIMAGELIST: Guid = Guid {
        data1: 0x46EB5926,
        data2: 0x582E,
        data3: 0x4017,
        data4: [0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50],
    };

    #[repr(C)]
    struct IImageListVtbl {
        query_interface: usize,
        add_ref: usize,
        release: unsafe extern "system" fn(*mut IImageList) -> u32,
        _pad: [usize; 7], // Add, ReplaceIcon, SetOverlayImage, Replace, AddMasked, Draw, Remove
        get_icon: unsafe extern "system" fn(*mut IImageList, i32, u32, *mut isize) -> i32,
    }

    #[repr(C)]
    struct IImageList {
        lp_vtbl: *const IImageListVtbl,
    }

    #[repr(C)]
    struct ShFileInfoW {
        h_icon: isize,
        i_icon: i32,
        dw_attributes: u32,
        sz_display_name: [u16; 260],
        sz_type_name: [u16; 80],
    }

    #[repr(C)]
    struct IconInfo {
        f_icon: i32,
        x_hotspot: u32,
        y_hotspot: u32,
        hbm_mask: isize,
        hbm_color: isize,
    }

    #[repr(C)]
    struct Bitmap {
        bm_type: i32,
        bm_width: i32,
        bm_height: i32,
        bm_width_bytes: i32,
        bm_planes: u16,
        bm_bits_pixel: u16,
        bm_bits: *mut c_void,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        bmi_header: BitmapInfoHeader,
        bmi_colors: [u32; 1],
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetFileInfoW(
            psz_path: *const u16,
            dw_file_attributes: u32,
            psfi: *mut ShFileInfoW,
            cb_file_info: u32,
            u_flags: u32,
        ) -> usize;
        fn SHGetImageList(i_image_list: i32, riid: *const Guid, ppv_obj: *mut *mut c_void) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetIconInfo(h_icon: isize, piconinfo: *mut IconInfo) -> i32;
        fn DestroyIcon(h_icon: isize) -> i32;
        fn GetDC(hwnd: isize) -> isize;
        fn ReleaseDC(hwnd: isize, hdc: isize) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn GetObjectW(h: isize, c: i32, pv: *mut c_void) -> i32;
        fn GetDIBits(
            hdc: isize,
            hbm: isize,
            start: u32,
            c_lines: u32,
            lpv_bits: *mut c_void,
            lpbmi: *mut BitmapInfo,
            usage: u32,
        ) -> i32;
        fn DeleteObject(ho: isize) -> i32;
    }

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(pv_reserved: *mut c_void, dw_coinit: u32) -> i32;
    }

    pub fn ensure_com() {
        unsafe {
            let _ = CoInitializeEx(ptr::null_mut(), COINIT_APARTMENTTHREADED);
        }
    }

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    fn get_extralarge_hicon(icon_index: i32) -> isize {
        let mut raw_list: *mut c_void = ptr::null_mut();
        let hr = unsafe { SHGetImageList(SHIL_EXTRALARGE, &IID_IIMAGELIST, &mut raw_list) };
        if hr != 0 || raw_list.is_null() {
            return 0;
        }
        let img_list = raw_list as *mut IImageList;
        let mut h_icon: isize = 0;
        unsafe {
            let vtbl = (*img_list).lp_vtbl;
            let _ = ((*vtbl).get_icon)(img_list, icon_index, ILD_TRANSPARENT, &mut h_icon);
            ((*vtbl).release)(img_list);
        }
        h_icon
    }

    pub fn extract_icon_data_url(target: &str, use_file_attributes: bool) -> Option<String> {
        let wide = to_wide(target);
        let mut shfi = ShFileInfoW {
            h_icon: 0,
            i_icon: 0,
            dw_attributes: 0,
            sz_display_name: [0; 260],
            sz_type_name: [0; 80],
        };

        let attrs = if use_file_attributes {
            FILE_ATTRIBUTE_NORMAL
        } else {
            0
        };

        // First try SHIL_EXTRALARGE (48x48) via SHGFI_SYSICONINDEX for crisp icons at all grid sizes
        let idx_flags = if use_file_attributes {
            SHGFI_SYSICONINDEX | SHGFI_USEFILEATTRIBUTES
        } else {
            SHGFI_SYSICONINDEX
        };
        let ok_idx = unsafe {
            SHGetFileInfoW(
                wide.as_ptr(),
                attrs,
                &mut shfi,
                size_of::<ShFileInfoW>() as u32,
                idx_flags,
            )
        };
        if ok_idx != 0 {
            let h_icon = get_extralarge_hicon(shfi.i_icon);
            if h_icon != 0 {
                let result = hicon_to_png_data_url(h_icon);
                unsafe {
                    DestroyIcon(h_icon);
                }
                if result.is_some() {
                    return result;
                }
            }
        }

        // Fallback to standard SHGFI_LARGEICON (32x32)
        shfi.h_icon = 0;
        let flags = if use_file_attributes {
            SHGFI_ICON | SHGFI_LARGEICON | SHGFI_USEFILEATTRIBUTES
        } else {
            SHGFI_ICON | SHGFI_LARGEICON
        };

        let ok = unsafe {
            SHGetFileInfoW(
                wide.as_ptr(),
                attrs,
                &mut shfi,
                size_of::<ShFileInfoW>() as u32,
                flags,
            )
        };
        if ok == 0 || shfi.h_icon == 0 {
            return None;
        }

        let result = hicon_to_png_data_url(shfi.h_icon);
        unsafe {
            DestroyIcon(shfi.h_icon);
        }
        result
    }

    fn hicon_to_png_data_url(h_icon: isize) -> Option<String> {
        let mut info = IconInfo {
            f_icon: 0,
            x_hotspot: 0,
            y_hotspot: 0,
            hbm_mask: 0,
            hbm_color: 0,
        };
        if unsafe { GetIconInfo(h_icon, &mut info) } == 0 {
            return None;
        }

        let res = (|| -> Option<String> {
            let hdc = unsafe { GetDC(0) };
            if hdc == 0 {
                return None;
            }

            let out = extract_pixels(hdc, info.hbm_color, info.hbm_mask).and_then(|(w, h, rgba)| {
                encode_png_data_url(w, h, &rgba)
            });

            unsafe {
                ReleaseDC(0, hdc);
            }
            out
        })();

        unsafe {
            if info.hbm_color != 0 {
                DeleteObject(info.hbm_color);
            }
            if info.hbm_mask != 0 {
                DeleteObject(info.hbm_mask);
            }
        }
        res
    }

    fn extract_pixels(hdc: isize, hbm_color: isize, hbm_mask: isize) -> Option<(u32, u32, Vec<u8>)> {
        let mut bmp = Bitmap {
            bm_type: 0,
            bm_width: 0,
            bm_height: 0,
            bm_width_bytes: 0,
            bm_planes: 0,
            bm_bits_pixel: 0,
            bm_bits: ptr::null_mut(),
        };

        let target_bm = if hbm_color != 0 { hbm_color } else { hbm_mask };
        if target_bm == 0 {
            return None;
        }

        let got = unsafe {
            GetObjectW(
                target_bm,
                size_of::<Bitmap>() as i32,
                &mut bmp as *mut Bitmap as *mut c_void,
            )
        };
        if got == 0 || bmp.bm_width <= 0 || bmp.bm_height <= 0 {
            return None;
        }

        let width = bmp.bm_width as u32;
        let height = if hbm_color != 0 {
            bmp.bm_height as u32
        } else {
            (bmp.bm_height / 2).max(1) as u32
        };

        if width > 256 || height > 256 {
            return None;
        }

        let mut bmi = BitmapInfo {
            bmi_header: BitmapInfoHeader {
                bi_size: size_of::<BitmapInfoHeader>() as u32,
                bi_width: width as i32,
                bi_height: -(height as i32), // top-down DIB
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: BI_RGB,
                bi_size_image: 0,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            },
            bmi_colors: [0],
        };

        let pixel_count = (width * height) as usize;
        let mut bgra = vec![0u8; pixel_count * 4];

        if hbm_color != 0 {
            let lines = unsafe {
                GetDIBits(
                    hdc,
                    hbm_color,
                    0,
                    height,
                    bgra.as_mut_ptr() as *mut c_void,
                    &mut bmi,
                    DIB_RGB_COLORS,
                )
            };
            if lines == 0 {
                return None;
            }
        }

        // Check if color bitmap actually has alpha channel data
        let has_alpha = bgra.chunks_exact(4).any(|px| px[3] != 0);

        if !has_alpha && hbm_mask != 0 {
            let mut mask_bgra = vec![0u8; pixel_count * 4];
            let mask_lines = unsafe {
                GetDIBits(
                    hdc,
                    hbm_mask,
                    0,
                    height,
                    mask_bgra.as_mut_ptr() as *mut c_void,
                    &mut bmi,
                    DIB_RGB_COLORS,
                )
            };
            if mask_lines > 0 {
                for i in 0..pixel_count {
                    // White in mask means transparent, black means opaque
                    let mask_val = mask_bgra[i * 4];
                    bgra[i * 4 + 3] = if mask_val > 127 { 0 } else { 255 };
                }
            } else {
                for i in 0..pixel_count {
                    bgra[i * 4 + 3] = 255;
                }
            }
        }

        // Convert BGRA -> RGBA
        let mut rgba = vec![0u8; pixel_count * 4];
        for i in 0..pixel_count {
            let o = i * 4;
            rgba[o] = bgra[o + 2];     // R
            rgba[o + 1] = bgra[o + 1]; // G
            rgba[o + 2] = bgra[o];     // B
            rgba[o + 3] = bgra[o + 3]; // A
        }

        Some((width, height, rgba))
    }

    fn encode_png_data_url(width: u32, height: u32, rgba: &[u8]) -> Option<String> {
        let mut png_bytes = Vec::with_capacity(2048);
        {
            let mut encoder = png::Encoder::new(&mut png_bytes, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.set_compression(png::Compression::Fast);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(rgba).ok()?;
        }
        Some(format!("data:image/png;base64,{}", STANDARD.encode(png_bytes)))
    }
}

pub fn resolve_icons_sync(requests: Vec<IconRequest>) -> HashMap<String, String> {
    #[cfg(target_os = "windows")]
    win::ensure_com();

    let mut out = HashMap::with_capacity(requests.len());
    let mut to_extract: Vec<(String, String, bool)> = Vec::new();

    {
        let guard = cache().read().unwrap_or_else(|e| e.into_inner());
        for req in &requests {
            let key = cache_key_for_request(req);
            if key.is_empty() {
                continue;
            }
            if let Some(url) = guard.get(&key) {
                if !url.is_empty() {
                    out.insert(req.path.clone(), url.clone());
                }
            } else if !to_extract.iter().any(|(k, _, _)| k == &key) {
                let is_file = key.starts_with("file:");
                let target = if is_file {
                    req.path.clone()
                } else if req.extension.is_empty() {
                    "file".to_string()
                } else {
                    format!("file.{}", req.extension.to_lowercase())
                };
                to_extract.push((key, target, !is_file));
            }
        }
    }

    if !to_extract.is_empty() {
        let mut newly_extracted: Vec<(String, String)> = Vec::with_capacity(to_extract.len());
        for (key, target, use_attrs) in to_extract {
            #[cfg(target_os = "windows")]
            let url = win::extract_icon_data_url(&target, use_attrs).unwrap_or_default();
            #[cfg(not(target_os = "windows"))]
            let url = {
                let _ = (target, use_attrs);
                String::new()
            };
            newly_extracted.push((key, url));
        }

        {
            let mut guard = cache().write().unwrap_or_else(|e| e.into_inner());
            for (k, v) in newly_extracted {
                guard.insert(k, v);
            }
        }

        let guard = cache().read().unwrap_or_else(|e| e.into_inner());
        for req in &requests {
            if out.contains_key(&req.path) {
                continue;
            }
            let key = cache_key_for_request(req);
            if !key.is_empty() {
                if let Some(url) = guard.get(&key) {
                    if !url.is_empty() {
                        out.insert(req.path.clone(), url.clone());
                    }
                }
            }
        }
    }

    out
}

#[tauri::command]
pub async fn get_file_icons(requests: Vec<IconRequest>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || resolve_icons_sync(requests))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_real_windows_exe_and_ext_icons() {
        let reqs = vec![
            IconRequest {
                path: r"C:\Windows\notepad.exe".to_string(),
                extension: "exe".to_string(),
                is_dir: false,
            },
            IconRequest {
                path: r"C:\dummy\report.txt".to_string(),
                extension: "txt".to_string(),
                is_dir: false,
            },
        ];
        let map = resolve_icons_sync(reqs);
        #[cfg(target_os = "windows")]
        {
            let exe_icon = map.get(r"C:\Windows\notepad.exe").expect("notepad.exe icon");
            assert!(exe_icon.starts_with("data:image/png;base64,"));
            assert!(exe_icon.len() > 100);
            // Verify PNG IHDR dimensions are 48x48 (SHIL_EXTRALARGE)
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            let png_bytes = STANDARD
                .decode(exe_icon.trim_start_matches("data:image/png;base64,"))
                .expect("valid base64 png");
            assert!(png_bytes.len() > 24);
            let w = u32::from_be_bytes([png_bytes[16], png_bytes[17], png_bytes[18], png_bytes[19]]);
            let h = u32::from_be_bytes([png_bytes[20], png_bytes[21], png_bytes[22], png_bytes[23]]);
            assert!(w >= 48 && h >= 48, "expected >=48x48 crisp icon, got {}x{}", w, h);

            let txt_icon = map.get(r"C:\dummy\report.txt").expect("txt icon");
            assert!(txt_icon.starts_with("data:image/png;base64,"));
            assert!(txt_icon.len() > 100);

            // Extensionless file should also resolve cleanly
            let extless = resolve_icons_sync(vec![IconRequest {
                path: r"C:\dummy\Makefile".to_string(),
                extension: "".to_string(),
                is_dir: false,
            }]);
            assert!(extless.contains_key(r"C:\dummy\Makefile"));
        }

        // Empty batch and missing exe should not panic
        let empty = resolve_icons_sync(vec![]);
        assert!(empty.is_empty());
        let missing = resolve_icons_sync(vec![IconRequest {
            path: r"C:\does_not_exist_velo_test.exe".to_string(),
            extension: "exe".to_string(),
            is_dir: false,
        }]);
        assert!(!missing.contains_key(r"C:\does_not_exist_velo_test.exe"));
    }
}
