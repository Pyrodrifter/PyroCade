use crate::config::{config_for_save, load_config, save_config};
use crate::storage::{is_content_uri, split_storage_refs};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "android"))]
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

pub struct AppState {
    pub(crate) app: AppHandle,
    pub data_dir: PathBuf,
    pub emu_dir: PathBuf,
    pub config_path: PathBuf,
    pub(crate) config: Arc<RwLock<Value>>,
    pub(crate) games: Arc<RwLock<Vec<Game>>>,
    pub(crate) artwork: Arc<Mutex<crate::artwork::ArtworkControl>>,
    warning: Mutex<Option<String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub system: String,
    pub rom_path: String,
    pub base: String,
    pub title: String,
    pub info: Value,
    pub media: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell: Option<String>,
}

#[derive(Clone)]
struct RomFile {
    name: String,
    path: PathBuf,
    root: PathBuf,
    root_index: usize,
    size: Option<u64>,
    is_dump: bool,
}

struct MediaIndex {
    game_dirs: HashMap<String, PathBuf>,
    kinds: HashMap<String, HashMap<String, PathBuf>>,
    files: HashSet<String>,
}

#[derive(Clone)]
struct Listed {
    name: String,
    path: PathBuf,
    is_dir: bool,
    is_file: bool,
}

#[derive(Default)]
struct ScanListings {
    inner: Arc<Mutex<HashMap<String, Arc<Vec<Listed>>>>>,
}

impl ScanListings {
    fn list(&self, dir: &Path) -> Arc<Vec<Listed>> {
        let key = dir.to_string_lossy().to_lowercase();
        if let Some(listed) = self
            .inner
            .lock()
            .expect("listings lock poisoned")
            .get(&key)
            .cloned()
        {
            return listed;
        }
        let listed: Vec<Listed> = fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|entry| Listed {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: entry.path(),
                        is_dir: entry.file_type().is_ok_and(|t| t.is_dir()),
                        is_file: entry.file_type().is_ok_and(|t| t.is_file()),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let listed = Arc::new(listed);
        self.inner
            .lock()
            .expect("listings lock poisoned")
            .insert(key, listed.clone());
        listed
    }
}

const SCAN_CONCURRENCY: usize = 16;

fn map_limit<T, F, R>(items: &[T], limit: usize, f: &F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync,
{
    if items.is_empty() {
        return Vec::new();
    }
    let workers = limit.min(items.len()).max(1);
    let chunk = items.len().div_ceil(workers);
    std::thread::scope(|scope| {
        let handles: Vec<_> = items
            .chunks(chunk)
            .map(|part| scope.spawn(move || part.iter().map(f).collect::<Vec<_>>()))
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().expect("scan worker panicked"))
            .collect()
    })
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = data_directory(app)?;
        let config_path = data_dir.join("config.json");
        let (config, warning) = load_config(&config_path);
        fs::create_dir_all(&data_dir)?;
        fs::create_dir_all(data_dir.join("emulators"))?;
        let _ = app.asset_protocol_scope().allow_directory(&data_dir, true);
        Ok(Self {
            app: app.clone(),
            emu_dir: data_dir.join("emulators"),
            data_dir,
            config_path,
            config: Arc::new(RwLock::new(config)),
            games: Arc::new(RwLock::new(Vec::new())),
            artwork: Arc::new(Mutex::new(crate::artwork::ArtworkControl::default())),
            warning: Mutex::new(warning),
        })
    }

    pub(crate) fn config(&self) -> Value {
        self.config.read().expect("config lock poisoned").clone()
    }
}

fn data_directory(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if cfg!(target_os = "android") {
        return Ok(app.path().app_data_dir()?);
    }
    if let Some(portable) = std::env::var_os("PORTABLE_EXECUTABLE_DIR") {
        return Ok(PathBuf::from(portable).join("data"));
    }
    if cfg!(debug_assertions) {
        return Ok(std::env::current_dir()?.join("data"));
    }
    let base = if cfg!(target_os = "linux") {
        dirs::config_dir()
    } else {
        dirs::data_dir()
    }
    .ok_or("could not determine the user data directory")?;
    Ok(base.join("PyroCade").join("data"))
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Value {
    let config = state.config();
    if let Some(warning) = state.warning.lock().expect("warning lock poisoned").take() {
        let app = state.app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let _ = app.emit("toast", warning);
        });
    }
    config
}

#[tauri::command]
pub fn set_config(state: State<'_, AppState>, cfg: Value) -> Result<Value, String> {
    let mut current = state.config.write().map_err(|e| e.to_string())?;
    let next = config_for_save(cfg, &current)?;
    save_config(&state.config_path, &next)?;
    *current = next.clone();
    Ok(next)
}

#[tauri::command]
pub fn scan_library(
    app: AppHandle,
    state: State<'_, AppState>,
    with_report: Option<bool>,
    options: Option<Value>,
) -> Result<Option<Vec<Game>>, String> {
    let config = state.config();
    let only_if_changed = options
        .as_ref()
        .and_then(|o| o.get("onlyIfChanged"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let (cached_raw, known_sizes) = read_library_cache(&config, &state.data_dir);
    let outcome = scan(
        &app,
        &config,
        &state.data_dir,
        &known_sizes,
        with_report.unwrap_or(false),
    )?;
    let raw_text = serde_json::to_string(&outcome.games).map_err(|e| e.to_string())?;
    let changed = write_library_cache(
        &config,
        &state.data_dir,
        &raw_text,
        &outcome.sizes,
        cached_raw.as_ref(),
    );
    if only_if_changed && !with_report.unwrap_or(false) && !changed {
        return Ok(None);
    }
    let mut games = outcome.games;
    apply_library_state(&mut games, &config);
    *state.games.write().map_err(|e| e.to_string())? = games.clone();
    Ok(Some(games))
}

#[tauri::command]
pub fn cached_library(state: State<'_, AppState>) -> Result<Option<Vec<Game>>, String> {
    let config = state.config();
    let (cached_raw, _known_sizes) = read_library_cache(&config, &state.data_dir);
    let Some(cached) = cached_raw else {
        return Ok(None);
    };
    let mut games = cached;
    apply_library_state(&mut games, &config);
    *state.games.write().map_err(|e| e.to_string())? = games.clone();
    Ok(Some(games))
}

fn library_cache_key(config: &Value) -> Value {
    let systems: Vec<Value> = config
        .get("systems")
        .and_then(Value::as_array)
        .map(|systems| {
            systems
                .iter()
                .map(|system| {
                    json!([
                        system.get("id").and_then(Value::as_str).unwrap_or(""),
                        system.get("romDir").and_then(Value::as_str).unwrap_or(""),
                        system.get("extensions").cloned().unwrap_or(json!([])),
                        system
                            .get("direct")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    ])
                })
                .collect()
        })
        .unwrap_or_default();
    json!({
        "version": app_version(),
        "mediaRoot": config.get("mediaRoot").and_then(Value::as_str).unwrap_or(""),
        "extraGames": config.get("extraGames").cloned().unwrap_or(json!([])),
        "systems": systems,
    })
}

fn read_library_cache(
    config: &Value,
    data_dir: &Path,
) -> (Option<Vec<Game>>, HashMap<String, u64>) {
    let path = data_dir.join("library-cache.json");
    let Ok(text) = fs::read_to_string(&path) else {
        return (None, HashMap::new());
    };
    let Ok(cached) = serde_json::from_str::<Value>(&text) else {
        return (None, HashMap::new());
    };
    let sizes: HashMap<String, u64> = cached
        .get("sizes")
        .and_then(Value::as_object)
        .map(|sizes| {
            sizes
                .iter()
                .filter_map(|(path, size)| size.as_u64().map(|size| (path.clone(), size)))
                .collect()
        })
        .unwrap_or_default();
    if cached.get("key") != Some(&library_cache_key(config)) {
        return (None, sizes);
    }
    let games: Option<Vec<Game>> = cached
        .get("games")
        .and_then(|games| serde_json::from_value(games.clone()).ok())
        .filter(|games: &Vec<Game>| !games.is_empty());
    (games, sizes)
}

fn write_library_cache(
    config: &Value,
    data_dir: &Path,
    raw_text: &str,
    sizes: &HashMap<String, u64>,
    cached_raw: Option<&Vec<Game>>,
) -> bool {
    let previous_text = cached_raw
        .map(|games| serde_json::to_string(games).unwrap_or_default())
        .unwrap_or_default();
    let changed = raw_text != previous_text;
    let sizes_text = serde_json::to_string(sizes).unwrap_or_default();
    let previous_sizes_text = {
        let (_games, previous_sizes) = read_library_cache(config, data_dir);
        serde_json::to_string(&previous_sizes).unwrap_or_default()
    };
    if !changed && sizes_text == previous_sizes_text {
        return false;
    }
    let _ = fs::create_dir_all(data_dir);
    let tmp = data_dir.join("library-cache.json.tmp");
    let payload = format!(
        "{{\"key\":{},\"sizes\":{},\"games\":{}}}",
        library_cache_key(config),
        sizes_text,
        raw_text
    );
    if fs::write(&tmp, payload).is_ok() {
        let _ = fs::rename(&tmp, data_dir.join("library-cache.json"));
    }
    changed
}

/// Apply favorites filtering, recently played injection, sorting, and ordering.
fn apply_library_state(games: &mut Vec<Game>, config: &Value) {
    let favorites: Vec<String> = config
        .get("favorites")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let recently_played: Vec<Value> = config
        .get("recentlyPlayed")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let limit: usize = config
        .get("recentlyPlayedLimit")
        .and_then(Value::as_u64)
        .unwrap_or(20) as usize;

    let show_favorites_only = config
        .get("showFavoritesOnly")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let show_recently_played = config
        .get("showRecentlyPlayed")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let sort_key: &str = config
        .get("sortKey")
        .and_then(Value::as_str)
        .unwrap_or("title");

    let sort_asc = config
        .get("sortAsc")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    // Build a set of favorite IDs for fast lookup.
    let fav_set: std::collections::HashSet<&str> = favorites.iter().map(|s| s.as_str()).collect();

    // Filter to favorites only if requested.
    if show_favorites_only {
        games.retain(|g| fav_set.contains(g.id.as_str()));
    }

    // Inject recently played games that are not already in the library.
    if show_recently_played {
        let existing_ids: std::collections::HashSet<&str> =
            games.iter().map(|g| g.id.as_str()).collect();
        let mut injected: Vec<Game> = recently_played
            .iter()
            .filter(|rp| {
                let gid = rp.get("id").and_then(Value::as_str);
                gid.map(|id| !existing_ids.contains(id)).unwrap_or(false)
            })
            .filter_map(|rp| {
                let id = rp.get("id")?.as_str()?.to_owned();
                let title = rp.get("title")?.as_str()?.to_owned();
                Some(Game {
                    id,
                    system: String::new(),
                    rom_path: String::new(),
                    base: String::new(),
                    title,
                    info: Value::Object(serde_json::Map::new()),
                    media: HashMap::new(),
                    shell: None,
                })
            })
            .collect();
        // Sort injected by timestamp descending (most recent first).
        injected.sort_by(|a, b| {
            let ta = recently_played
                .iter()
                .find(|rp| rp.get("id").and_then(Value::as_str) == Some(&a.id))
                .and_then(|rp| rp.get("timestamp").and_then(Value::as_u64))
                .unwrap_or(0);
            let tb = recently_played
                .iter()
                .find(|rp| rp.get("id").and_then(Value::as_str) == Some(&b.id))
                .and_then(|rp| rp.get("timestamp").and_then(Value::as_u64))
                .unwrap_or(0);
            tb.cmp(&ta)
        });
        let injected: Vec<Game> = injected.into_iter().take(limit).collect();
        games.extend(injected);
    }

    // Sort by the configured key.
    games.sort_by(|a, b| {
        let cmp = match sort_key {
            "title" => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
            "system" => a.system.cmp(&b.system),
            "favorites" => {
                let fa = fav_set.contains(a.id.as_str()) as u8;
                let fb = fav_set.contains(b.id.as_str()) as u8;
                fb.cmp(&fa) // favorites first
            }
            "recent" => {
                let ta = config
                    .get("recentlyPlayed")
                    .and_then(Value::as_array)
                    .and_then(|arr| {
                        arr.iter().find_map(|rp| {
                            rp.get("id").and_then(Value::as_str).and_then(|id| {
                                if id == a.id {
                                    rp.get("timestamp").and_then(Value::as_u64)
                                } else {
                                    None
                                }
                            })
                        })
                    })
                    .unwrap_or(0);
                let tb = config
                    .get("recentlyPlayed")
                    .and_then(Value::as_array)
                    .and_then(|arr| {
                        arr.iter().find_map(|rp| {
                            rp.get("id").and_then(Value::as_str).and_then(|id| {
                                if id == b.id {
                                    rp.get("timestamp").and_then(Value::as_u64)
                                } else {
                                    None
                                }
                            })
                        })
                    })
                    .unwrap_or(0);
                tb.cmp(&ta) // most recent first
            }
            _ => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        };
        if sort_asc { cmp } else { cmp.reverse() }
    });
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, AppState>, game_id: String) -> Result<Value, String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let mut favorites: Vec<String> = config
        .get_mut("favorites")
        .and_then(Value::as_array_mut)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let is_favorite = favorites.contains(&game_id);
    if is_favorite {
        favorites.retain(|id| id != &game_id);
    } else {
        favorites.push(game_id);
    }
    *config.get_mut("favorites").unwrap() =
        Value::Array(favorites.into_iter().map(Value::String).collect());
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(json!({"isFavorite": !is_favorite}))
}

#[tauri::command]
pub fn record_play(
    state: State<'_, AppState>,
    game_id: String,
    play_time: f64,
) -> Result<(), String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let mut recently_played: Vec<Value> = config
        .get_mut("recentlyPlayed")
        .and_then(Value::as_array_mut)
        .map(|arr| arr.iter().cloned().collect())
        .unwrap_or_default();

    // Remove existing entry for this game if present.
    recently_played.retain(|rp| rp.get("id").and_then(Value::as_str) != Some(&game_id));

    // Add new entry at the front.
    let entry = json!({
        "id": game_id,
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "playTime": play_time
    });
    recently_played.insert(0, entry);

    let limit: usize = config
        .get("recentlyPlayedLimit")
        .and_then(Value::as_u64)
        .unwrap_or(20) as usize;
    recently_played.truncate(limit);

    *config.get_mut("recentlyPlayed").unwrap() = Value::Array(
        recently_played
            .into_iter()
            .map(|v| Value::Object(v.as_object().unwrap().clone()))
            .collect(),
    );
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(())
}

#[tauri::command]
pub fn update_library_prefs(state: State<'_, AppState>, prefs: Value) -> Result<Value, String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    if let Some(sort_key) = prefs.get("sortKey").and_then(Value::as_str) {
        config["sortKey"] = json!(sort_key);
    }
    if let Some(sort_asc) = prefs.get("sortAsc").and_then(Value::as_bool) {
        config["sortAsc"] = json!(sort_asc);
    }
    if let Some(show_fav) = prefs.get("showFavoritesOnly").and_then(Value::as_bool) {
        config["showFavoritesOnly"] = json!(show_fav);
    }
    if let Some(show_rec) = prefs.get("showRecentlyPlayed").and_then(Value::as_bool) {
        config["showRecentlyPlayed"] = json!(show_rec);
    }
    if let Some(limit) = prefs.get("recentlyPlayedLimit").and_then(Value::as_u64) {
        config["recentlyPlayedLimit"] = json!(limit);
    }
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(config_clone)
}

#[tauri::command]
pub fn get_favorites(state: State<'_, AppState>) -> Vec<String> {
    state
        .config()
        .get("favorites")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_recently_played(state: State<'_, AppState>, _limit: usize) -> Vec<Value> {
    state
        .config()
        .get("recentlyPlayed")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn wait_for_child(
    child: std::process::Child,
    window: Option<tauri::WebviewWindow>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
        #[cfg(target_os = "android")]
        let _ = window;
        #[cfg(not(target_os = "android"))]
        if let Some(window) = window {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    })
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub(crate) fn android_launch_target(package: &str, rom_uri: &str) -> Result<String, String> {
    // ROM URIs are passed through unchanged: a SAF content URI is not a
    // filesystem path and is never converted into one here.
    if package.trim().is_empty() {
        return Err("No Android emulator package is linked.".to_owned());
    }
    if rom_uri.trim().is_empty() {
        return Err("This game has no ROM location yet.".to_owned());
    }
    Ok(rom_uri.to_owned())
}

#[cfg(target_os = "android")]
fn launch_game_android(app: &AppHandle, package: &str, rom_uri: &str) -> Result<bool, String> {
    let target = android_launch_target(package, rom_uri)?;
    // On Android the opener plugin starts Intent.ACTION_VIEW with this URI,
    // which hands the ROM to the linked emulator package.
    let _ = package;
    app.opener()
        .open_url(target, None::<&str>)
        .map_err(|e| format!("Launch failed: {e}"))?;
    Ok(true)
}

#[tauri::command]
pub fn launch_game(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let game = state
        .games
        .read()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|g| g.id == id)
        .cloned()
        .ok_or_else(|| {
            "This game is no longer in your library. Rescan in Settings and try again.".to_owned()
        })?;
    let config = state.config();
    let system = config
        .get("systems")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|s| s.get("id").and_then(Value::as_str) == Some(&game.system))
        .ok_or_else(|| "Unknown system".to_owned())?;
    let emulator_id = system
        .get("emulator")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            format!(
                "No emulator is set for {}. Choose one in Settings.",
                system
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(&game.system)
            )
        })?;
    let base = crate::emulators::find_definition(emulator_id, &config)
        .ok_or_else(|| "Unknown emulator".to_owned())?;
    let definition = crate::emulators::selected_definition(&base, &config, emulator_id);
    #[cfg(target_os = "android")]
    {
        let package = crate::emulators::linked_package(&config, emulator_id).ok_or_else(|| {
            format!(
                "{} isn't linked yet. Link the installed app by package from the Emulators tab.",
                definition
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(emulator_id)
            )
        })?;
        return launch_game_android(&app, &package, &game.rom_path);
    }
    #[cfg(not(target_os = "android"))]
    let executable =
        crate::emulators::resolve_exe(&state.emu_dir, emulator_id, &definition, &config)
            .ok_or_else(|| {
                format!(
                    "{} isn't installed yet. Install it from the Emulators tab.",
                    definition
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(emulator_id)
                )
            })?;
    #[cfg(not(target_os = "android"))]
    let template = system
        .get("args")
        .and_then(Value::as_str)
        .or_else(|| definition.get("args").and_then(Value::as_str))
        .unwrap_or("{rom}");
    #[cfg(not(target_os = "android"))]
    let args: Vec<String> = split_args(template)
        .into_iter()
        .map(|part| part.replace("{rom}", &game.rom_path))
        .collect();
    #[cfg(not(target_os = "android"))]
    let app_bundle = cfg!(target_os = "macos")
        .then(|| {
            executable
                .ancestors()
                .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
        })
        .flatten();
    #[cfg(not(target_os = "android"))]
    let cwd = app_bundle
        .and_then(Path::parent)
        .or_else(|| executable.parent())
        .unwrap_or_else(|| Path::new("."));
    #[cfg(not(target_os = "android"))]
    let mut command = if let Some(bundle) = app_bundle {
        let mut command = Command::new("open");
        command
            .args(["--wait-apps", "-a"])
            .arg(bundle)
            .arg("--args")
            .args(args);
        command
    } else {
        let mut command = Command::new(&executable);
        command.args(args);
        command
    };
    #[cfg(not(target_os = "android"))]
    command
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(not(target_os = "android"))]
    let child = command.spawn().map_err(|e| format!("Launch failed: {e}"))?;
    #[cfg(not(target_os = "android"))]
    let window = config
        .get("hideWhilePlaying")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        .then(|| app.get_webview_window("main"))
        .flatten();
    #[cfg(not(target_os = "android"))]
    if let Some(window) = window.as_ref() {
        let _ = window.minimize();
    }
    #[cfg(not(target_os = "android"))]
    wait_for_child(child, window);
    Ok(true)
}

struct ScanOutcome {
    games: Vec<Game>,
    sizes: HashMap<String, u64>,
}

fn scan(
    app: &AppHandle,
    config: &Value,
    data_dir: &Path,
    known_sizes: &HashMap<String, u64>,
    reread_sizes: bool,
) -> Result<ScanOutcome, String> {
    let listings = ScanListings::default();
    let mut games = Vec::new();
    let mut scan_sizes: HashMap<String, u64> = HashMap::new();
    let systems = config
        .get("systems")
        .and_then(Value::as_array)
        .ok_or("Invalid settings")?;
    for system in systems {
        let Some(id) = system.get("id").and_then(Value::as_str) else {
            continue;
        };
        let extensions: HashSet<String> = system
            .get("extensions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_lowercase)
            .collect();
        if extensions.is_empty() {
            continue;
        }
        let dirs: Vec<PathBuf> =
            split_storage_refs(system.get("romDir").and_then(Value::as_str).unwrap_or(""))
                .into_iter()
                .filter_map(|r| r.as_path().cloned())
                .filter(|p| p.is_dir())
                .collect();
        if dirs.is_empty() {
            continue;
        }
        let mut files = Vec::new();
        for (root_index, root) in dirs.iter().enumerate() {
            allow_tree(app, root);
            walk_roms(
                &listings,
                root,
                root,
                root_index,
                0,
                &extensions,
                &mut files,
            );
        }
        let playlists: HashSet<String> = files
            .iter()
            .filter(|f| f.name.to_lowercase().ends_with(".m3u"))
            .map(|f| loose_key(&stem(&f.name)))
            .collect();
        files.retain(|f| {
            let lower = f.name.to_lowercase();
            if lower.contains("(track ") && lower.contains(')') {
                return false;
            }
            !(lower.contains("(disc ")
                && playlists.contains(&loose_key(
                    &Path::new(&f.name)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(""),
                )))
        });
        let best = select_best_roms(files, known_sizes, reread_sizes, &mut scan_sizes);
        let roots = media_roots(config, system, &dirs, data_dir);
        for root in &roots {
            allow_tree(app, root);
        }
        let indexes: Vec<MediaIndex> = roots
            .iter()
            .map(|root| index_media_root(&listings, root))
            .collect();
        let lists: Vec<HashMap<String, Value>> =
            dirs.iter().map(|root| read_gamelist(root)).collect();
        let best_files: Vec<RomFile> = best.into_values().collect();
        let system_games = map_limit(&best_files, SCAN_CONCURRENCY, &|file| {
            let base = Path::new(&file.name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file.name)
                .to_owned();
            let (media_paths, info, shell) = find_media(&indexes, &base, &listings);
            let mut metadata = Map::new();
            for list in &lists {
                if let Some(value) = list.get(&base.to_lowercase()).and_then(Value::as_object) {
                    metadata.extend(value.clone());
                    break;
                }
            }
            if let Some(info) = info.and_then(|v| v.as_object().cloned()) {
                metadata.extend(info);
            }
            let media = media_paths
                .into_iter()
                .filter_map(|(kind, path)| media_value(&kind, &path).map(|value| (kind, value)))
                .collect();
            let relative = file
                .path
                .strip_prefix(&file.root)
                .unwrap_or(&file.path)
                .to_string_lossy()
                .replace('\\', "/");
            let suffix = if file.root_index == 0 {
                relative
            } else {
                format!("{}:{}", file.root_index, relative)
            };
            let title = metadata
                .get("title")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| display_title(&base));
            Game {
                id: format!("{id}:{suffix}"),
                system: id.to_owned(),
                rom_path: file.path.to_string_lossy().to_string(),
                base,
                title,
                info: Value::Object(metadata),
                media,
                shell,
            }
        });
        games.extend(system_games);
    }
    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(ScanOutcome {
        games,
        sizes: scan_sizes,
    })
}

fn media_roots(config: &Value, system: &Value, dirs: &[PathBuf], data_dir: &Path) -> Vec<PathBuf> {
    let id = system.get("id").and_then(Value::as_str).unwrap_or_default();
    let mut roots = Vec::new();
    if let Some(media_root) = config
        .get("mediaRoot")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && !is_content_uri(s))
    {
        roots.push(PathBuf::from(media_root).join(id));
    }
    for dir in dirs {
        roots.push(dir.join("media"));
        roots.push(dir.clone());
    }
    roots.push(data_dir.join("media").join(id));
    roots.retain(|p| p.is_dir());
    roots
}

fn allow_tree(app: &AppHandle, path: &Path) {
    let _ = app.asset_protocol_scope().allow_directory(path, true);
}

fn walk_roms(
    listings: &ScanListings,
    root: &Path,
    dir: &Path,
    root_index: usize,
    depth: usize,
    extensions: &HashSet<String>,
    out: &mut Vec<RomFile>,
) {
    let entries = listings.list(dir);
    if extensions.contains(".nsp")
        && entries
            .iter()
            .any(|e| e.is_dir && matches!(e.name.to_lowercase().as_str(), "base" | "exefs"))
    {
        for main in [dir.join("base/exefs/main"), dir.join("exefs/main")] {
            if main.is_file() {
                let label = dir.file_name().and_then(|s| s.to_str()).unwrap_or("Game");
                out.push(RomFile {
                    name: format!("{label}.dump"),
                    path: main,
                    root: root.to_path_buf(),
                    root_index,
                    size: Some(9_000_000_000),
                    is_dump: true,
                });
                return;
            }
        }
    }
    for entry in entries.iter() {
        let path = &entry.path;
        let rom_ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .is_some_and(|e| extensions.contains(&e));
        if entry.is_dir {
            if rom_ext {
                out.push(RomFile {
                    name: entry.name.clone(),
                    size: Some(0),
                    is_dump: false,
                    path: path.clone(),
                    root: root.to_path_buf(),
                    root_index,
                });
            } else if depth < 4 && !skip_dir(&entry.name) {
                walk_roms(listings, root, path, root_index, depth + 1, extensions, out);
            }
        } else if entry.is_file && rom_ext {
            out.push(RomFile {
                name: entry.name.clone(),
                size: None,
                is_dump: false,
                path: path.clone(),
                root: root.to_path_buf(),
                root_index,
            });
        }
    }
}

fn skip_dir(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "source archives"
            | "_extras"
            | "extras"
            | "texture packs"
            | "save"
            | "saves"
            | "state"
            | "states"
            | "bios"
            | "cheats"
            | "patches"
            | "media"
            | "images"
            | "manuals"
            | "downloaded_media"
            | "covers"
            | "screenshots"
    )
}

fn copy_score(file: &RomFile) -> i64 {
    let name = file.name.to_lowercase();
    let mut score: i64 = 0;
    if name.contains("(u)")
        || name.contains("(usa")
        || name.contains("(us)")
        || name.contains("(e)")
        || name.contains("(eu)")
        || name.contains("(europe)")
        || name.contains("(world")
        || name.contains("(en)")
        || name.contains("[usa")
        || name.contains("(ue)")
    {
        score += 4;
    }
    if name.contains("(j)") || name.contains("(jp)") || name.contains("(japan)") {
        score -= 2;
    }
    if name.contains("[!]") {
        score += 2;
    }
    if ["update", "upd", "dlc", "(beta", "(proto", "(demo", "(hack"]
        .iter()
        .any(|s| name.contains(s))
        || has_dump_marker(&name)
    {
        score -= 6;
    }
    if !name.ends_with(".zip") {
        score += 1;
    }
    score
}

fn copy_size(
    file: &mut RomFile,
    known_sizes: &HashMap<String, u64>,
    reread_sizes: bool,
    scan_sizes: &mut HashMap<String, u64>,
) -> u64 {
    if file.size.is_none() {
        let key = file.path.to_string_lossy().to_string();
        file.size = Some(if !reread_sizes && known_sizes.contains_key(&key) {
            known_sizes[&key]
        } else {
            fs::metadata(&file.path)
                .map(|m| m.len())
                .unwrap_or_default()
        });
    }
    let size = file.size.unwrap_or_default();
    if !file.is_dump {
        scan_sizes.insert(file.path.to_string_lossy().to_string(), size);
    }
    size.min(9_000_000_000)
}

fn has_dump_marker(name: &str) -> bool {
    static DUMP_MARKER: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    DUMP_MARKER
        .get_or_init(|| regex::Regex::new(r"\[(?:b|h|t|o)\d*\]|\[v[1-9]\d*\]").unwrap())
        .is_match(name)
}

fn select_best_roms(
    files: Vec<RomFile>,
    known_sizes: &HashMap<String, u64>,
    reread_sizes: bool,
    scan_sizes: &mut HashMap<String, u64>,
) -> HashMap<String, RomFile> {
    let mut groups: HashMap<String, Vec<RomFile>> = HashMap::new();
    for file in files {
        let base = Path::new(&file.name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&file.name)
            .to_owned();
        let normalized = loose_key(&base);
        let key = if normalized.is_empty() {
            base.to_lowercase()
        } else {
            normalized
        };
        groups.entry(key).or_default().push(file);
    }
    let mut best = HashMap::new();
    for (key, group) in groups {
        let top_score = group.iter().map(copy_score).max().unwrap_or_default();
        let mut top: Vec<RomFile> = group
            .into_iter()
            .filter(|file| copy_score(file) == top_score)
            .collect();
        let pick = if top.len() > 1 {
            for file in &mut top {
                copy_size(file, known_sizes, reread_sizes, scan_sizes);
            }
            let mut pick = top.remove(0);
            for candidate in top {
                let pick_size = copy_size(&mut pick.clone(), known_sizes, reread_sizes, scan_sizes);
                let candidate_size = candidate.size.unwrap_or_default().min(9_000_000_000);
                if pick_size < candidate_size {
                    pick = candidate;
                }
            }
            pick
        } else {
            top.remove(0)
        };
        best.insert(key, pick);
    }
    best
}

fn index_media_root(listings: &ScanListings, root: &Path) -> MediaIndex {
    let mut index = MediaIndex {
        game_dirs: HashMap::new(),
        kinds: HashMap::new(),
        files: HashSet::new(),
    };
    for entry in listings.list(root).iter().filter(|e| e.is_dir) {
        let name = entry.name.to_lowercase();
        if let Some((kind, _)) = media_kind_folder(&name) {
            let map = index.kinds.entry(kind.to_owned()).or_default();
            for file in listings.list(&entry.path).iter().filter(|f| f.is_file) {
                index
                    .files
                    .insert(file.path.to_string_lossy().to_lowercase());
                if valid_media_extension(kind, &file.path) {
                    map.entry(stem(&file.name))
                        .or_insert_with(|| file.path.clone());
                }
            }
        } else {
            index.game_dirs.insert(name, entry.path.clone());
        }
    }
    index
}

fn media_kind_folder(name: &str) -> Option<(&'static str, &'static [&'static str])> {
    [
        ("front", &["covers", "box2dfront", "boxart"][..]),
        ("frontHQ", &["cover-hq"][..]),
        ("screenshot", &["screenshots", "snaps", "images"][..]),
        ("title", &["titlescreens", "titles"][..]),
        ("back", &["backcovers", "box2dback"][..]),
        ("spine", &["spines", "box2dside"][..]),
        ("disc", &["physicalmedia", "discs", "support"][..]),
        ("fanart", &["fanart", "backgrounds"][..]),
        ("logo", &["marquees", "wheel", "logos"][..]),
        ("video", &["videos"][..]),
        ("manual", &["manuals"][..]),
    ]
    .into_iter()
    .find(|(_, folders)| folders.contains(&name))
}

fn valid_media_extension(kind: &str, path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if kind == "manual" {
        return ext == "pdf";
    }
    if kind == "video" {
        return ["mp4", "webm"].contains(&ext.as_str());
    }
    ["png", "jpg", "jpeg", "webp", "gif"].contains(&ext.as_str())
}

// Manual paths stay filesystem paths for the native opener; artwork uses file URLs.
fn media_value(kind: &str, path: &Path) -> Option<String> {
    if kind == "manual" {
        Some(path.to_string_lossy().into_owned())
    } else {
        Url::from_file_path(path).ok().map(|url| url.to_string())
    }
}

fn find_media(
    indexes: &[MediaIndex],
    base: &str,
    listings: &ScanListings,
) -> (HashMap<String, PathBuf>, Option<Value>, Option<String>) {
    let key = base.to_lowercase();
    let mut media = HashMap::new();
    let mut info = None;
    let mut seen: HashSet<String> = HashSet::new();
    for index in indexes {
        let dir = index
            .game_dirs
            .get(&key)
            .or_else(|| index.game_dirs.get(&clean_title(base).to_lowercase()));
        if let Some(dir) = dir {
            let files = listings.list(dir);
            for file in files.iter().filter(|f| f.is_file) {
                seen.insert(file.path.to_string_lossy().to_lowercase());
            }
            for (kind, names) in media_names() {
                if media.contains_key(kind) {
                    continue;
                }
                let hit = names.iter().find_map(|name| {
                    files
                        .iter()
                        .filter(|f| {
                            f.is_file
                                && stem(&f.name) == *name
                                && valid_media_extension(kind, &f.path)
                        })
                        .min_by_key(|f| {
                            if f.path
                                .extension()
                                .is_some_and(|e| e.eq_ignore_ascii_case("png"))
                            {
                                0
                            } else {
                                1
                            }
                        })
                });
                if let Some(hit) = hit {
                    media.insert(kind.to_owned(), hit.path.clone());
                }
            }
            if info.is_none() {
                if let Some(file) = files
                    .iter()
                    .find(|f| f.is_file && f.name.eq_ignore_ascii_case("info.json"))
                {
                    info = fs::read_to_string(&file.path)
                        .ok()
                        .and_then(|s| serde_json::from_str(&s).ok());
                }
            }
        }
        for (kind, paths) in &index.kinds {
            if !media.contains_key(kind) {
                if let Some(path) = paths.get(&key) {
                    media.insert(kind.clone(), path.clone());
                }
            }
        }
    }
    let mut shell = None;
    if let Some(disc) = media.get("disc") {
        let shell_file = disc.with_extension("json");
        let shell_key = shell_file.to_string_lossy().to_lowercase();
        let listed = seen.contains(&shell_key)
            || indexes.iter().any(|index| index.files.contains(&shell_key));
        if listed {
            if let Ok(text) = fs::read_to_string(&shell_file) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    if let Some(value) = parsed.get("shell").and_then(Value::as_str) {
                        let valid = value.len() == 7
                            && value.starts_with('#')
                            && value[1..].chars().all(|c| c.is_ascii_hexdigit());
                        if valid {
                            shell = Some(value.to_owned());
                        }
                    }
                }
            }
        }
    }
    (media, info, shell)
}

fn media_names() -> Vec<(&'static str, &'static [&'static str])> {
    vec![
        ("front", &["front", "cover", "box-front", "boxfront", "box"]),
        ("frontHQ", &["front-hq"]),
        ("back", &["back", "box-back", "boxback"]),
        ("spine", &["spine", "box-spine", "side"]),
        (
            "disc",
            &["disc", "cd", "cart", "cartridge", "media", "physicalmedia"],
        ),
        ("manual", &["manual"]),
        ("screenshot", &["screenshot", "snap", "screen"]),
        ("title", &["title", "titlescreen"]),
        ("fanart", &["fanart", "background", "bg"]),
        ("logo", &["logo", "marquee", "wheel"]),
        ("video", &["video", "trailer"]),
    ]
}

fn read_gamelist(root: &Path) -> HashMap<String, Value> {
    let Ok(xml) = fs::read_to_string(root.join("gamelist.xml")) else {
        return HashMap::new();
    };
    parse_gamelist(&xml)
}

fn parse_gamelist(xml: &str) -> HashMap<String, Value> {
    let mut map = HashMap::new();
    let Ok(game_re) = regex::Regex::new(r"(?s)<game[\s>].*?</game>") else {
        return map;
    };
    for game in game_re.find_iter(xml).map(|m| m.as_str()) {
        let Some(path) = xml_tag(game, "path") else {
            continue;
        };
        let mut info = Map::new();
        for (tag, key) in [
            ("name", "title"),
            ("desc", "description"),
            ("developer", "developer"),
            ("publisher", "publisher"),
            ("genre", "genre"),
            ("players", "players"),
        ] {
            if let Some(value) = xml_tag(game, tag) {
                info.insert(key.to_owned(), Value::String(value));
            }
        }
        if let Some(released) = xml_tag(game, "releasedate") {
            info.insert(
                "year".to_owned(),
                Value::String(released.chars().take(4).collect()),
            );
        }
        map.insert(stem(&path).to_lowercase(), Value::Object(info));
    }
    map
}

fn xml_tag(xml: &str, tag: &str) -> Option<String> {
    let expression = regex::Regex::new(&format!(r"(?s)<{tag}>(.*?)</{tag}>")).ok()?;
    let text = expression.captures(xml)?.get(1)?.as_str().trim();
    Some(quick_xml::escape::unescape(text).ok()?.into_owned())
}

fn stem(name: &str) -> String {
    Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name)
        .to_lowercase()
}

fn loose_key(text: &str) -> String {
    clean_title(text)
        .to_lowercase()
        .replace('&', " ")
        .split_whitespace()
        .filter(|word| *word != "and" && *word != "the")
        .flat_map(str::chars)
        .filter(char::is_ascii_alphanumeric)
        .collect()
}

fn clean_title(name: &str) -> String {
    static BRACKETED: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    static RELEASE_NUMBER: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    static ENCRYPTION_SUFFIX: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    static WHITESPACE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let value = BRACKETED
        .get_or_init(|| regex::Regex::new(r"\s*[\(\[][^)\]]*[\)\]]").unwrap())
        .replace_all(name, "")
        .replace('_', " ");
    let value = RELEASE_NUMBER
        .get_or_init(|| regex::Regex::new(r"^\d{3,5}\s*-?\s+").unwrap())
        .replace(&value, "");
    let value = ENCRYPTION_SUFFIX
        .get_or_init(|| regex::Regex::new(r"(?i)\s*\b(decrypted|encrypted)\b\s*$").unwrap())
        .replace(&value, "");
    let cleaned = WHITESPACE
        .get_or_init(|| regex::Regex::new(r"\s+").unwrap())
        .replace_all(&value, " ")
        .trim()
        .to_owned();
    if cleaned.is_empty() {
        name.to_owned()
    } else {
        cleaned
    }
}

fn display_title(name: &str) -> String {
    let value = clean_title(name);
    let (title, suffix) = value
        .split_once(" - ")
        .map_or((value.as_str(), None), |(title, suffix)| {
            (title, Some(suffix))
        });
    for article in ["The", "A", "An"] {
        if let Some(prefix) = title.strip_suffix(&format!(" {article}")) {
            let prefix = prefix.trim_end_matches(',').trim_end();
            if !prefix.is_empty() {
                return match suffix {
                    Some(suffix) => format!("{article} {prefix} - {suffix}"),
                    None => format!("{article} {prefix}"),
                };
            }
        }
    }
    value
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
/// Runs off the main thread so the Tauri dialog plugin's `blocking_*` APIs
/// can dispatch the native sheet to the main runloop and wait for it.
pub async fn pick_folder(app: AppHandle, title: String) -> Option<String> {
    app.dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn pick_folder(_app: AppHandle, _title: String) -> Result<Option<String>, String> {
    // Dialog plugin does not support Android folder picking. A SAF grant
    // must come from the native picker and persists as a content URI.
    Err(
        "Folder selection on Android needs a document-tree grant; the dialog plugin does not support folder picking there."
            .to_owned(),
    )
}

#[tauri::command]
pub fn open_manual(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn supports_self_update(os: &str, arch: &str, appimage: bool) -> bool {
    matches!((os, arch), ("macos", "aarch64"))
        || matches!((os, arch), ("linux", "aarch64") if appimage)
}

fn self_update_supported() -> bool {
    supports_self_update(
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::env::var_os("APPIMAGE").is_some(),
    )
}

fn manual_update_hint() -> &'static str {
    if cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none() {
        "This Linux install is managed by your package manager. Install the matching ARM64 package from the release page."
    } else {
        "Download the matching platform and architecture release from the release page."
    }
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<Value, String> {
    const REPO: &str = "Pyrodrifter/PyroCade";
    let current = env!("CARGO_PKG_VERSION");
    let response = reqwest::Client::builder()
        .user_agent("PyroCade-Frontend")
        .build()
        .map_err(|e| e.to_string())?
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if response.status().as_u16() == 404 {
        return Ok(
            json!({"current":current,"available":false,"canInstall":false,"manualHint":"No published releases yet."}),
        );
    }
    if !response.status().is_success() {
        return Err(format!(
            "GitHub {}: {}{}",
            response.status(),
            response
                .status()
                .canonical_reason()
                .unwrap_or("request failed"),
            if response.status().as_u16() == 403 {
                " (rate limited — try again later)"
            } else {
                ""
            }
        ));
    }
    let release: Value = response.json().await.map_err(|e| e.to_string())?;
    let tag = release
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let latest = tag.trim_start_matches(['v', 'V']);
    let available = version_parts(latest) > version_parts(current);
    let can_install = if self_update_supported() {
        match app.updater() {
            Ok(updater) => updater.check().await.is_ok_and(|update| update.is_some()),
            Err(_) => false,
        }
    } else {
        false
    };
    Ok(json!({
        "current":current,"latest":latest,"available":available,
        "name":release.get("name").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(tag),
        "notes":release.get("body").and_then(Value::as_str).unwrap_or(""),
        "url":release.get("html_url"),"installer":Value::Null,"canInstall":can_install,
        "manualHint":manual_update_hint()
    }))
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<Value, String> {
    if self_update_supported() {
        if let Ok(updater) = app.updater() {
            if let Ok(Some(update)) = updater.check().await {
                let version = update.version.clone();
                let progress_version = version.clone();
                let progress_app = app.clone();
                let mut downloaded = 0usize;
                update
                    .download_and_install(
                        move |chunk, total| {
                            downloaded += chunk;
                            let total = total.unwrap_or_default();
                            let pct = if total > 0 {
                                downloaded as f64 / total as f64
                            } else {
                                0.0
                            };
                            let _ = progress_app.emit(
                                "app:updateProgress",
                                json!({
                                    "stage": format!("Downloading PyroCade {progress_version}…"),
                                    "pct": pct,
                                    "got": downloaded,
                                    "total": total
                                }),
                            );
                        },
                        || {},
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                app.emit(
                    "app:updateProgress",
                    json!({"stage":"Update installed; restart PyroCade to finish.","pct":1,"done":true}),
                )
                .map_err(|e| e.to_string())?;
                return Ok(json!({"version":version,"mode":"updater"}));
            }
        }
    }

    let update = check_app_update(app.clone()).await?;
    if !update
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err("PyroCade is already up to date.".to_owned());
    }
    let url = update
        .get("url")
        .and_then(Value::as_str)
        .ok_or("Release page is unavailable")?
        .to_owned();
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(json!({"version":update.get("latest"),"mode":"manual"}))
}

#[tauri::command]
pub fn open_release(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") {
        return Err("Not a GitHub link".to_owned());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn merge_object(target: &mut Value, source: &Value) {
    let (Some(target), Some(source)) = (target.as_object_mut(), source.as_object()) else {
        return;
    };
    for (key, value) in source {
        if key == "systems" {
            continue;
        }
        if value.is_object() && target.get(key).is_some_and(Value::is_object) {
            merge_object(target.get_mut(key).unwrap(), value);
        } else {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn split_args(value: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut any = false;
    for ch in value.chars() {
        if ch == '"' {
            quoted = !quoted;
            any = true;
        } else if ch.is_whitespace() && !quoted {
            if any {
                result.push(std::mem::take(&mut current));
                any = false;
            }
        } else {
            current.push(ch);
            any = true;
        }
    }
    if any {
        result.push(current);
    }
    result
}

fn version_parts(value: &str) -> (u64, u64, u64) {
    let mut parts = value
        .trim_start_matches(['v', 'V'])
        .split(['.', '+', '-'])
        .map(|s| s.parse::<u64>().unwrap_or_default());
    (
        parts.next().unwrap_or_default(),
        parts.next().unwrap_or_default(),
        parts.next().unwrap_or_default(),
    )
}

#[cfg(test)]
mod library_tests {
    use super::*;

    #[test]
    fn self_updater_is_limited_to_supported_arm64_installs() {
        assert!(supports_self_update("macos", "aarch64", false));
        assert!(supports_self_update("linux", "aarch64", true));
        assert!(!supports_self_update("linux", "aarch64", false));
        assert!(!supports_self_update("linux", "x86_64", true));
    }

    fn rom_file(name: &str) -> RomFile {
        RomFile {
            name: name.to_owned(),
            path: PathBuf::from(name),
            root: PathBuf::from("roms"),
            root_index: 0,
            size: None,
            is_dump: false,
        }
    }

    fn select(files: Vec<RomFile>) -> HashMap<String, RomFile> {
        let mut sizes = HashMap::new();
        select_best_roms(files, &HashMap::new(), false, &mut sizes)
    }

    #[test]
    fn manual_media_keeps_a_filesystem_path() {
        assert_eq!(
            media_value("manual", Path::new("/library/manual.pdf")),
            Some("/library/manual.pdf".to_owned())
        );
        assert_eq!(
            media_value("front", Path::new("/library/front.png")),
            Some("file:///library/front.png".to_owned())
        );
    }

    #[test]
    fn game_serialization_preserves_the_renderer_payload_contract() {
        let game = Game {
            id: "snes:game".to_owned(),
            system: "snes".to_owned(),
            rom_path: "/roms/game.sfc".to_owned(),
            base: "game".to_owned(),
            title: "Game".to_owned(),
            info: serde_json::json!({"year":"1998"}),
            media: HashMap::from([
                ("front".to_owned(), "file:///media/front.png".to_owned()),
                ("manual".to_owned(), "/media/manual.pdf".to_owned()),
            ]),
            shell: Some("#a1b2c3".to_owned()),
        };

        let payload = serde_json::to_value(game).unwrap();

        assert_eq!(payload["id"], "snes:game");
        assert_eq!(payload["romPath"], "/roms/game.sfc");
        assert_eq!(payload["info"]["year"], "1998");
        assert_eq!(payload["media"]["front"], "file:///media/front.png");
        assert_eq!(payload["media"]["manual"], "/media/manual.pdf");
        assert_eq!(payload["shell"], "#a1b2c3");
    }

    #[test]
    fn local_media_aliases_and_video_files_are_indexable() {
        assert_eq!(
            media_kind_folder("images").map(|(kind, _)| kind),
            Some("screenshot")
        );
        assert_eq!(
            media_kind_folder("wheel").map(|(kind, _)| kind),
            Some("logo")
        );
        assert!(valid_media_extension("video", Path::new("trailer.webm")));
        assert!(valid_media_extension("manual", Path::new("manual.pdf")));
    }

    #[test]
    fn gamelist_metadata_decodes_entities_and_released_year() {
        let games = parse_gamelist(
            "<game><path>./Mario &amp; Luigi.rom</path><name>Mario &amp; Luigi</name><desc>Save &amp; play</desc><releasedate>19981021T000000</releasedate></game>",
        );
        let info = games.get("mario & luigi").unwrap();
        assert_eq!(info["title"], "Mario & Luigi");
        assert_eq!(info["description"], "Save & play");
        assert_eq!(info["year"], "1998");
    }

    #[test]
    fn rom_selection_uses_clean_titles_and_rejects_numbered_dumps() {
        let selected = select(vec![
            rom_file("Game (USA) [v1].zip"),
            rom_file("Game (USA) [!].chd"),
        ]);
        assert_eq!(selected.len(), 1);
        assert_eq!(selected.values().next().unwrap().name, "Game (USA) [!].chd");
        assert_eq!(clean_title("0004 - Zelda (USA) [!] Encrypted"), "Zelda");
        assert_eq!(
            display_title("Legend of Zelda, The - Ocarina (USA)"),
            "The Legend of Zelda - Ocarina"
        );
    }

    #[test]
    fn android_launch_passes_content_uri_through_unchanged() {
        let uri = "content://com.android.externalstorage.documents/tree/abc/document/rom.zip";
        assert_eq!(
            android_launch_target("com.retroarch.aarch64", uri).unwrap(),
            uri
        );
        assert!(android_launch_target("", uri).is_err());
        assert!(android_launch_target("com.retroarch.aarch64", "").is_err());
    }

    // A directory-ROM is itself the game: bundles carry no inner file with
    // the ROM extension, so walking them would list nothing at all.
    #[test]
    fn directory_roms_are_collected_like_files() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-walk-roms-test-{}", uuid::Uuid::new_v4()));
        let bundle = root.join("Game One.app");
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::write(bundle.join("Contents/MacOS/Game"), [0u8; 42]).unwrap();
        fs::create_dir_all(root.join("Game Two.app")).unwrap();
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested/Game Three.nsp"), [0u8; 7]).unwrap();
        fs::create_dir_all(root.join("media")).unwrap();
        fs::write(root.join("media/Game Four.nsp"), [0u8; 7]).unwrap();
        let extensions: HashSet<String> = [".app", ".nsp"].iter().map(|s| s.to_string()).collect();
        let mut out = Vec::new();
        walk_roms(
            &ScanListings::default(),
            &root,
            &root,
            0,
            0,
            &extensions,
            &mut out,
        );
        let names: Vec<_> = out.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"Game One.app"));
        assert!(names.contains(&"Game Two.app"));
        assert!(names.contains(&"Game Three.nsp"));
        assert!(!names.contains(&"Game Four.nsp"));
        // Directory-ROMs report size 0: they are never walked (copy_score
        // only uses size as a tie-break, and bundles hold tens of GB).
        assert_eq!(
            out.iter().find(|f| f.name == "Game One.app").unwrap().size,
            Some(0)
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn child_monitor_waits_for_process_exit() {
        // childDelaySeconds keeps the child alive long enough to distinguish waiting from dropping.
        const CHILD_DELAY_SECONDS: u64 = 1;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-child-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let marker = root.join("exited");
        let command = format!("sleep {CHILD_DELAY_SECONDS}; printf done > \"$1\"");
        let child = Command::new("sh")
            .args(["-c", &command, "sh"])
            .arg(&marker)
            .spawn()
            .unwrap();

        super::wait_for_child(child, None).join().unwrap();

        let result = fs::read_to_string(&marker);
        let _ = fs::remove_dir_all(&root);
        assert_eq!(result.unwrap(), "done");
    }

    #[test]
    fn favorites_filter_keeps_only_favorited_games() {
        let config = json!({
            "favorites": ["snes:zelda", "nes:mario"],
            "showFavoritesOnly": true,
            "recentlyPlayed": [],
            "sortKey": "title",
            "sortAsc": true
        });
        let mut games = vec![
            Game {
                id: "snes:zelda".to_owned(),
                system: "snes".to_owned(),
                rom_path: String::new(),
                base: "zelda".to_owned(),
                title: "Zelda".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "nes:mario".to_owned(),
                system: "nes".to_owned(),
                rom_path: String::new(),
                base: "mario".to_owned(),
                title: "Mario".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "ps1:finalfantasy".to_owned(),
                system: "ps1".to_owned(),
                rom_path: String::new(),
                base: "finalfantasy".to_owned(),
                title: "Final Fantasy".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
        ];
        super::apply_library_state(&mut games, &config);
        assert_eq!(games.len(), 2);
        let ids: Vec<&str> = games.iter().map(|g| g.id.as_str()).collect();
        assert!(ids.contains(&"snes:zelda"));
        assert!(ids.contains(&"nes:mario"));
        assert!(!ids.contains(&"ps1:finalfantasy"));
    }

    #[test]
    fn sort_by_favorites_places_favorites_first() {
        let config = json!({
            "favorites": ["snes:zelda"],
            "showFavoritesOnly": false,
            "recentlyPlayed": [],
            "sortKey": "favorites",
            "sortAsc": true
        });
        let mut games = vec![
            Game {
                id: "nes:mario".to_owned(),
                system: "nes".to_owned(),
                rom_path: String::new(),
                base: "mario".to_owned(),
                title: "Mario".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "snes:zelda".to_owned(),
                system: "snes".to_owned(),
                rom_path: String::new(),
                base: "zelda".to_owned(),
                title: "Zelda".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "ps1:ff".to_owned(),
                system: "ps1".to_owned(),
                rom_path: String::new(),
                base: "ff".to_owned(),
                title: "Final Fantasy".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
        ];
        super::apply_library_state(&mut games, &config);
        assert_eq!(games[0].id, "snes:zelda"); // favorites first
    }

    #[test]
    fn recently_played_injection_adds_missing_games() {
        let config = json!({
            "favorites": [],
            "showFavoritesOnly": false,
            "showRecentlyPlayed": true,
            "recentlyPlayed": [
                {"id": "ps1:crash", "title": "Crash Bandicoot", "timestamp": 1000000},
                {"id": "snes:zelda", "title": "Zelda", "timestamp": 900000}
            ],
            "recentlyPlayedLimit": 20,
            "sortKey": "title",
            "sortAsc": true
        });
        let mut games = vec![Game {
            id: "snes:zelda".to_owned(),
            system: "snes".to_owned(),
            rom_path: String::new(),
            base: "zelda".to_owned(),
            title: "Zelda".to_owned(),
            info: Value::Null,
            media: HashMap::new(),
            shell: None,
        }];
        super::apply_library_state(&mut games, &config);
        // Crash Bandicoot should be injected (not in original library).
        assert!(games.iter().any(|g| g.id == "ps1:crash"));
        // Zelda should still be present.
        assert!(games.iter().any(|g| g.id == "snes:zelda"));
    }

    #[test]
    fn sort_by_title_ascending_and_descending() {
        let mut games = vec![
            Game {
                id: "a".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "a".to_owned(),
                title: "Zebra".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "b".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "b".to_owned(),
                title: "Apple".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "c".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "c".to_owned(),
                title: "Mango".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
        ];
        let config_asc = json!({"favorites":[],"showFavoritesOnly":false,"showRecentlyPlayed":false,"recentlyPlayed":[],"recentlyPlayedLimit":20,"sortKey":"title","sortAsc":true});
        let config_desc = json!({"favorites":[],"showFavoritesOnly":false,"showRecentlyPlayed":false,"recentlyPlayed":[],"recentlyPlayedLimit":20,"sortKey":"title","sortAsc":false});
        super::apply_library_state(&mut games, &config_asc);
        assert_eq!(games[0].title, "Apple");
        assert_eq!(games[2].title, "Zebra");
        let mut games2 = vec![
            Game {
                id: "a".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "a".to_owned(),
                title: "Zebra".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "b".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "b".to_owned(),
                title: "Apple".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
            Game {
                id: "c".to_owned(),
                system: String::new(),
                rom_path: String::new(),
                base: "c".to_owned(),
                title: "Mango".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
            },
        ];
        super::apply_library_state(&mut games2, &config_desc);
        assert_eq!(games2[0].title, "Zebra");
        assert_eq!(games2[2].title, "Apple");
    }

    #[test]
    fn multidisc_handling_preserves_root_index() {
        let files = vec![
            RomFile {
                name: "Game (USA).chd".to_owned(),
                path: PathBuf::from("Game (USA).chd"),
                root: PathBuf::from("roms"),
                root_index: 0,
                size: None,
                is_dump: false,
            },
            RomFile {
                name: "Game (USA) (Disc 2).chd".to_owned(),
                path: PathBuf::from("Game (USA) (Disc 2).chd"),
                root: PathBuf::from("roms"),
                root_index: 1,
                size: None,
                is_dump: false,
            },
        ];
        let best = select(files);
        assert_eq!(best.len(), 1);
        let best_file = best.values().next().unwrap();
        assert_eq!(best_file.root_index, 0);
        // Disc 2 should reference root_index 1.
        let files2 = vec![
            RomFile {
                name: "Game (USA).chd".to_owned(),
                path: PathBuf::from("Game (USA).chd"),
                root: PathBuf::from("roms"),
                root_index: 0,
                size: None,
                is_dump: false,
            },
            RomFile {
                name: "Game (USA) (Disc 2).chd".to_owned(),
                path: PathBuf::from("Game (USA) (Disc 2).chd"),
                root: PathBuf::from("roms"),
                root_index: 1,
                size: None,
                is_dump: false,
            },
        ];
        let best2 = select(files2);
        assert_eq!(best2.len(), 1);
    }

    #[test]
    fn tied_copies_use_cached_sizes_without_statting() {
        let mut sizes = HashMap::new();
        let known: HashMap<String, u64> =
            HashMap::from([("a/Game.chd".to_owned(), 10), ("b/Game.chd".to_owned(), 99)]);
        let mut small = rom_file("Game.chd");
        small.path = PathBuf::from("a/Game.chd");
        let mut big = rom_file("Game.chd");
        big.path = PathBuf::from("b/Game.chd");
        let best = select_best_roms(vec![small, big], &known, false, &mut sizes);
        assert_eq!(
            best.values().next().unwrap().path,
            PathBuf::from("b/Game.chd")
        );
        assert_eq!(sizes.get("a/Game.chd"), Some(&10));
        assert_eq!(sizes.get("b/Game.chd"), Some(&99));
    }

    #[test]
    fn cache_key_tracks_version_media_extra_and_system_shape() {
        let config = json!({
            "mediaRoot": "/media",
            "extraGames": [{"id": "x"}],
            "systems": [{"id": "snes", "romDir": "/roms", "extensions": [".sfc"], "direct": false}]
        });
        let key = library_cache_key(&config);
        assert_eq!(key["version"], app_version());
        assert_eq!(key["mediaRoot"], "/media");
        assert_eq!(key["extraGames"].as_array().unwrap().len(), 1);
        assert_eq!(key["systems"][0][0], "snes");
        assert_eq!(key["systems"][0][3], false);
    }

    #[test]
    fn cache_roundtrip_returns_games_only_for_matching_key() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-cache-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let config = json!({"mediaRoot": "", "extraGames": [], "systems": []});
        let games = vec![Game {
            id: "snes:game".to_owned(),
            system: "snes".to_owned(),
            rom_path: "/roms/game.sfc".to_owned(),
            base: "game".to_owned(),
            title: "Game".to_owned(),
            info: Value::Null,
            media: HashMap::new(),
            shell: Some("#123abc".to_owned()),
        }];
        let raw = serde_json::to_string(&games).unwrap();
        let sizes = HashMap::from([("/roms/game.sfc".to_owned(), 42)]);
        assert!(write_library_cache(&config, &dir, &raw, &sizes, None));
        let (cached, known) = read_library_cache(&config, &dir);
        assert_eq!(cached.unwrap().len(), 1);
        assert_eq!(known.get("/roms/game.sfc"), Some(&42));
        assert!(!write_library_cache(
            &config,
            &dir,
            &raw,
            &sizes,
            Some(&games)
        ));
        let other = json!({"mediaRoot": "/elsewhere", "extraGames": [], "systems": []});
        let (miss, kept) = read_library_cache(&other, &dir);
        assert!(miss.is_none());
        assert_eq!(kept.get("/roms/game.sfc"), Some(&42));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn disc_sidecar_shell_is_read_only_when_listed() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-shell-test-{}", uuid::Uuid::new_v4()));
        let game_dir = dir.join("Game");
        fs::create_dir_all(&game_dir).unwrap();
        fs::write(game_dir.join("disc.png"), [0u8; 4]).unwrap();
        fs::write(game_dir.join("disc.json"), r##"{"shell":"#00ff88"}"##).unwrap();
        let listings = ScanListings::default();
        let mut index = MediaIndex {
            game_dirs: HashMap::new(),
            kinds: HashMap::new(),
            files: HashSet::new(),
        };
        index.game_dirs.insert("game".to_owned(), game_dir);
        let (_media, _info, shell) = find_media(&[index], "Game", &listings);
        assert_eq!(shell.as_deref(), Some("#00ff88"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_sorts_titles_case_insensitively() {
        let mut titles = vec!["zebra".to_owned(), "Apple".to_owned(), "mango".to_owned()];
        titles.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        assert_eq!(titles, vec!["Apple", "mango", "zebra"]);
    }
}
