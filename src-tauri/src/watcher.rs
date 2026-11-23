use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_path: Mutex<Option<PathBuf>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
        }
    }

    pub fn watch(&self, app: AppHandle, path: String) -> Result<(), String> {
        let target = PathBuf::from(&path);
        if !target.exists() || !target.is_dir() {
            return Ok(());
        }

        // Drop old watcher
        {
            let mut guard = self.watcher.lock().map_err(|e| e.to_string())?;
            *guard = None;
        }

        let last_emit = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));
        let path_clone = path.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(_event) = res {
                    if let Ok(mut last) = last_emit.lock() {
                        if last.elapsed() >= Duration::from_millis(250) {
                            *last = Instant::now();
                            let _ = app.emit("fs-changed", &path_clone);
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| e.to_string())?;

        watcher
            .watch(&target, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        {
            let mut guard = self.watcher.lock().map_err(|e| e.to_string())?;
            *guard = Some(watcher);
        }
        {
            let mut pguard = self.watched_path.lock().map_err(|e| e.to_string())?;
            *pguard = Some(target);
        }

        Ok(())
    }
}
