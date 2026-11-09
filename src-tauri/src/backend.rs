use crate::config::{config_for_save, load_config, save_config};
use crate::storage::{is_content_uri, split_storage_refs};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
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

#[derive(Clone, Default, Serialize, Deserialize)]
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
    #[serde(default)]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scanned_title: Option<String>,
    #[serde(default)]
    pub custom_title: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emulator: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added: Option<String>,
}

#[derive(Clone)]
struct RomFile {
    name: String,
    path: PathBuf,
    root: PathBuf,
    root_index: usize,
    size: Option<u64>,
    is_dump: bool,
    added: Option<String>,
    title_override: Option<String>,
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
        log_start(&data_dir);
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
    let mut config = state.config();
    // ScreenScraper passwords stay in the app data config; the renderer never sees them.
    if let Some(object) = config.as_object_mut() {
        object.remove("screenscraper");
    }
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
    let mut cfg = cfg;
    // ScreenScraper credentials are owned by the backend; the renderer cannot overwrite them.
    if let Some(section) = current.get("screenscraper") {
        cfg["screenscraper"] = section.clone();
    } else if let Some(object) = cfg.as_object_mut() {
        object.remove("screenscraper");
    }
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

/// Apply collection state: favorites, hidden, renames, per-game details/emulator, orders.
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

    let hidden_games: std::collections::HashSet<String> = config
        .get("hiddenGames")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let game_details = config
        .get("gameDetails")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let game_emulators = config
        .get("gameEmulators")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let game_orders = config
        .get("gameOrders")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    // Annotate each scanned game with its collection state before sorting/filtering.
    for game in games.iter_mut() {
        if game.scanned_title.is_none() {
            game.scanned_title = Some(game.title.clone());
        }
        let scanned = game
            .scanned_title
            .clone()
            .unwrap_or_else(|| game.title.clone());
        game.hidden = hidden_games.contains(&game.id);
        if let Some(details) = game_details.get(&game.id).and_then(Value::as_object) {
            let custom_title = details
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .filter(|s| *s != scanned);
            if let Some(title) = custom_title {
                game.title = title.to_owned();
                game.custom_title = true;
            } else {
                game.title = scanned.clone();
                game.custom_title = false;
            }
            game.version = details
                .get("version")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
            game.media_type = details
                .get("mediaType")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
        } else {
            game.title = scanned.clone();
            game.custom_title = false;
            game.version = None;
            game.media_type = None;
        }
        if let Some(emulator) = game_emulators.get(&game.id).and_then(Value::as_str) {
            let emulator = emulator.trim();
            game.emulator = if emulator.is_empty() {
                None
            } else {
                Some(emulator.to_owned())
            };
        } else {
            game.emulator = None;
        }
    }

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
                    hidden: false,
                    scanned_title: None,
                    custom_title: false,
                    version: None,
                    media_type: None,
                    emulator: None,
                    added: None,
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
            "custom" => {
                let rank = |game: &Game| {
                    game_orders
                        .get(&game.system)
                        .and_then(Value::as_array)
                        .and_then(|ids| ids.iter().position(|id| id.as_str() == Some(&game.id)))
                        .unwrap_or(usize::MAX)
                };
                let a_rank = rank(a);
                let b_rank = rank(b);
                if a.system != b.system {
                    a.system.cmp(&b.system)
                } else if a_rank != b_rank {
                    a_rank.cmp(&b_rank)
                } else {
                    a.title.to_lowercase().cmp(&b.title.to_lowercase())
                }
            }
            _ => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        };
        if sort_key == "custom" {
            cmp
        } else if sort_asc {
            cmp
        } else {
            cmp.reverse()
        }
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

// Hiding writes to the collection state; the ROM folder is never renamed, moved or deleted.
#[tauri::command]
pub fn set_game_hidden(
    state: State<'_, AppState>,
    game_id: String,
    hidden: bool,
) -> Result<Game, String> {
    {
        let games = state.games.read().map_err(|e| e.to_string())?;
        if !games.iter().any(|g| g.id == game_id) {
            return Err("Select a game in your library first.".to_owned());
        }
    }
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let mut hidden_games: Vec<String> = config
        .get_mut("hiddenGames")
        .and_then(Value::as_array_mut)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if hidden {
        if !hidden_games.contains(&game_id) {
            hidden_games.push(game_id.clone());
        }
    } else {
        hidden_games.retain(|id| id != &game_id);
    }
    *config.get_mut("hiddenGames").unwrap() =
        Value::Array(hidden_games.into_iter().map(Value::String).collect());
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    let mut games = state.games.write().map_err(|e| e.to_string())?;
    let game = games
        .iter_mut()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Select a game in your library first.".to_owned())?;
    game.hidden = hidden;
    Ok(game.clone())
}

#[tauri::command]
pub fn set_system_games_hidden(
    state: State<'_, AppState>,
    system: String,
    hidden: bool,
) -> Result<Vec<Game>, String> {
    let config_snapshot = state.config();
    if !config_snapshot
        .get("systems")
        .and_then(Value::as_array)
        .is_some_and(|systems| {
            systems
                .iter()
                .any(|s| s.get("id").and_then(Value::as_str) == Some(system.as_str()))
        })
    {
        return Err("Unknown system.".to_owned());
    }
    let system_games: Vec<String> = {
        let games = state.games.read().map_err(|e| e.to_string())?;
        games
            .iter()
            .filter(|g| g.system == system)
            .map(|g| g.id.clone())
            .collect()
    };
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let mut hidden_games: Vec<String> = config
        .get_mut("hiddenGames")
        .and_then(Value::as_array_mut)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    for game_id in &system_games {
        if hidden {
            if !hidden_games.contains(game_id) {
                hidden_games.push(game_id.clone());
            }
        } else {
            hidden_games.retain(|id| id != game_id);
        }
    }
    *config.get_mut("hiddenGames").unwrap() =
        Value::Array(hidden_games.into_iter().map(Value::String).collect());
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    let mut games = state.games.write().map_err(|e| e.to_string())?;
    let mut updated = Vec::new();
    for game in games.iter_mut() {
        if game.system == system {
            game.hidden = hidden;
            updated.push(game.clone());
        }
    }
    Ok(updated)
}

// The details editor (M03) is the only writer of title/version/mediaType overrides.
#[tauri::command]
pub fn set_game_metadata(state: State<'_, AppState>, opts: Value) -> Result<Game, String> {
    let game_id = opts
        .get("gameId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if game_id.is_empty() {
        return Err("Select a game in your library first.".to_owned());
    }
    {
        let games = state.games.read().map_err(|e| e.to_string())?;
        if !games.iter().any(|g| g.id == game_id) {
            return Err("Select a game in your library first.".to_owned());
        }
    }
    let has_title = opts.get("title").and_then(Value::as_str).is_some();
    let title_raw = opts
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let has_version = opts.get("version").and_then(Value::as_str).is_some();
    let version_raw = opts
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let has_media = opts.get("mediaType").and_then(Value::as_str).is_some();
    let media_raw = opts
        .get("mediaType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if has_title {
        let trimmed = title_raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if !trimmed.is_empty() && trimmed.len() > 200 {
            return Err("Enter a title of up to 200 characters.".to_owned());
        }
    }
    if has_version && version_raw.trim().len() > 80 {
        return Err("Enter a version of up to 80 characters.".to_owned());
    }
    if has_media
        && !["", "disc", "switch", "switch2", "gba", "n64", "nds"].contains(&media_raw.trim())
    {
        return Err("Choose a supported media type.".to_owned());
    }

    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let details_map = config
        .get_mut("gameDetails")
        .and_then(Value::as_object_mut)
        .ok_or("Invalid game details")?
        .entry(game_id.clone())
        .or_insert_with(|| json!({}));
    let details_obj = details_map.as_object_mut().ok_or("Invalid game details")?;
    let scanned_title = {
        let games = state.games.read().map_err(|e| e.to_string())?;
        games
            .iter()
            .find(|g| g.id == game_id)
            .and_then(|g| g.scanned_title.clone())
            .unwrap_or_default()
    };
    if has_title {
        let trimmed = title_raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() || trimmed == scanned_title {
            details_obj.remove("title");
        } else {
            details_obj.insert("title".to_owned(), Value::String(trimmed));
        }
    }
    if has_version {
        let trimmed = version_raw.trim().to_owned();
        if trimmed.is_empty() {
            details_obj.remove("version");
        } else {
            details_obj.insert("version".to_owned(), Value::String(trimmed));
        }
    }
    if has_media {
        let trimmed = media_raw.trim().to_owned();
        if trimmed.is_empty() {
            details_obj.remove("mediaType");
        } else {
            details_obj.insert("mediaType".to_owned(), Value::String(trimmed));
        }
    }
    if details_obj.is_empty() {
        if let Some(map) = config.get_mut("gameDetails").and_then(Value::as_object_mut) {
            map.remove(&game_id);
        }
    }
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    let mut games = state.games.write().map_err(|e| e.to_string())?;
    let game = games
        .iter_mut()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Select a game in your library first.".to_owned())?;
    let scanned = game
        .scanned_title
        .clone()
        .unwrap_or_else(|| game.title.clone());
    let custom = config_clone
        .get("gameDetails")
        .and_then(|v| v.get(&game_id))
        .and_then(|v| v.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != scanned);
    if let Some(title) = custom {
        game.title = title.to_owned();
        game.custom_title = true;
    } else {
        game.title = scanned.clone();
        game.custom_title = false;
    }
    game.version = config_clone
        .get("gameDetails")
        .and_then(|v| v.get(&game_id))
        .and_then(|v| v.get("version"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    game.media_type = config_clone
        .get("gameDetails")
        .and_then(|v| v.get(&game_id))
        .and_then(|v| v.get("mediaType"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    Ok(game.clone())
}

#[tauri::command]
pub fn set_game_emulator(state: State<'_, AppState>, opts: Value) -> Result<Game, String> {
    let game_id = opts
        .get("gameId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if game_id.is_empty() {
        return Err("Select a game in your library first.".to_owned());
    }
    let emulator_raw = opts
        .get("emulator")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_owned();
    {
        let games = state.games.read().map_err(|e| e.to_string())?;
        if !games.iter().any(|g| g.id == game_id) {
            return Err("Select a game in your library first.".to_owned());
        }
    }
    if !emulator_raw.is_empty() && emulator_raw != "__direct" {
        let config_snapshot = state.config();
        if crate::emulators::find_definition(&emulator_raw, &config_snapshot).is_none() {
            return Err("That emulator is no longer set up.".to_owned());
        }
    }
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let map = config
        .get_mut("gameEmulators")
        .and_then(Value::as_object_mut)
        .ok_or("Invalid emulator settings")?;
    if emulator_raw.is_empty() {
        map.remove(&game_id);
    } else {
        map.insert(game_id.clone(), Value::String(emulator_raw.clone()));
    }
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    let mut games = state.games.write().map_err(|e| e.to_string())?;
    let game = games
        .iter_mut()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Select a game in your library first.".to_owned())?;
    game.emulator = if emulator_raw.is_empty() {
        None
    } else {
        Some(emulator_raw)
    };
    Ok(game.clone())
}

#[tauri::command]
pub fn save_game_order(state: State<'_, AppState>, opts: Value) -> Result<Vec<String>, String> {
    let system = opts
        .get("system")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if system.is_empty() {
        return Err("Choose a console to reorder.".to_owned());
    }
    let game_ids: Vec<String> = opts
        .get("gameIds")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let config_snapshot = state.config();
    if !config_snapshot
        .get("systems")
        .and_then(Value::as_array)
        .is_some_and(|systems| {
            systems
                .iter()
                .any(|s| s.get("id").and_then(Value::as_str) == Some(system.as_str()))
        })
    {
        return Err("Choose a console to reorder.".to_owned());
    }
    let actual: Vec<String> = {
        let games = state.games.read().map_err(|e| e.to_string())?;
        games
            .iter()
            .filter(|g| g.system == system)
            .map(|g| g.id.clone())
            .collect()
    };
    let valid: HashSet<&str> = actual.iter().map(String::as_str).collect();
    let mut seen = HashSet::new();
    for id in &game_ids {
        if !valid.contains(id.as_str()) || !seen.insert(id.as_str()) {
            return Err(
                "The game order does not match this console. Rescan and try again.".to_owned(),
            );
        }
    }
    let mut order = game_ids.clone();
    for id in &actual {
        if !order.contains(id) {
            order.push(id.clone());
        }
    }
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let map = config
        .get_mut("gameOrders")
        .and_then(Value::as_object_mut)
        .ok_or("Invalid game orders")?;
    map.insert(
        system.clone(),
        Value::Array(order.iter().map(|id| Value::String(id.clone())).collect()),
    );
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(order)
}

#[tauri::command]
pub fn list_extra_games(state: State<'_, AppState>) -> Vec<Value> {
    let config = state.config();
    config
        .get("extraGames")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
            let missing =
                !path.is_empty() && !is_content_uri(path) && !std::path::Path::new(path).exists();
            json!({
                "id": entry.get("id").and_then(Value::as_str).unwrap_or(""),
                "system": entry.get("system").and_then(Value::as_str).unwrap_or(""),
                "path": path,
                "title": entry.get("title").and_then(Value::as_str).unwrap_or(""),
                "missing": missing,
            })
        })
        .collect()
}

#[tauri::command]
pub fn remove_game(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    if let Some(extra) = config.get_mut("extraGames").and_then(Value::as_array_mut) {
        extra.retain(|x| x.get("id").and_then(Value::as_str) != Some(&id));
    }
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(true)
}

/// Adds one game file to a system without a ROM folder. Opens the native
/// file picker, so it must be `async` like other dialog commands.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn add_game(
    app: AppHandle,
    state: State<'_, AppState>,
    opts: Value,
) -> Result<Option<Value>, String> {
    let system = opts
        .get("system")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if system.is_empty() {
        return Err("Choose a system first.".to_owned());
    }
    let config_snapshot = state.config();
    let sys = config_snapshot
        .get("systems")
        .and_then(Value::as_array)
        .and_then(|systems| {
            systems
                .iter()
                .find(|s| s.get("id").and_then(Value::as_str) == Some(system.as_str()))
                .cloned()
        })
        .ok_or_else(|| "Choose a system first.".to_owned())?;
    let sys_name = sys
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&system)
        .to_owned();
    let Some(path) = app
        .dialog()
        .file()
        .set_title(format!("Add a game to {sys_name}"))
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(None);
    };
    let path_string = path.to_string_lossy().to_owned();
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let extra = config
        .get_mut("extraGames")
        .and_then(Value::as_array_mut)
        .ok_or("Invalid settings")?;
    if extra.iter().any(|x| {
        x.get("system").and_then(Value::as_str) == Some(system.as_str())
            && x.get("path")
                .and_then(Value::as_str)
                .is_some_and(|p| Path::new(p) == path.as_path())
    }) {
        return Err("That game is already in your library.".to_owned());
    }
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_owned();
    let guess = {
        let stem_name = Path::new(&file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_name)
            .to_owned();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if (ext == "exe" || ext == "app")
            && path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.len() > 2)
        {
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .unwrap_or(&stem_name)
                .to_owned()
        } else {
            display_title(&stem_name)
        }
    };
    let title_over = opts
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(120).collect::<String>());
    let title = title_over.unwrap_or(guess);
    let entry = json!({
        "id": uuid::Uuid::new_v4().to_string()[..8].to_owned(),
        "system": system,
        "path": path_string,
        "title": title,
    });
    extra.push(entry.clone());
    let config_clone = config.clone();
    drop(config);
    save_config(&state.config_path, &config_clone)?;
    Ok(Some(entry))
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn add_game(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _opts: Value,
) -> Result<Option<Value>, String> {
    Err(
        "Adding a single file on Android needs a document grant; use a ROM folder instead."
            .to_owned(),
    )
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

// ---------- Launch logging and Steam/gamescope environment ----------
// Main wrote data/logs/pyrocade.log so a start that fails on someone else's device
// can be looked at without asking them to run anything. Launch children inherit
// the parent environment; the only per-child change is the Steam LD sanitization
// below (and nothing at all on Android, where ROM URIs stay untouched).
fn log_path(data_dir: &Path) -> PathBuf {
    data_dir.join("logs").join("pyrocade.log")
}

fn append_launch_log(data_dir: &Path, entry: &str) {
    let path = log_path(data_dir);
    if let Some(dir) = path.parent() {
        if fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 512 * 1024 {
            let _ = fs::rename(&path, path.with_extension("log.old"));
        }
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let stamp = chrono::Utc::now().to_rfc3339();
        let _ = writeln!(file, "{stamp} {entry}");
    }
}

fn env_or_empty(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

fn log_start(data_dir: &Path) {
    let desktop = env_or_empty("XDG_CURRENT_DESKTOP");
    let session = env_or_empty("XDG_SESSION_TYPE");
    let display = env_or_empty("DISPLAY");
    let wayland = !env_or_empty("WAYLAND_DISPLAY").is_empty()
        || !env_or_empty("GAMESCOPE_WAYLAND_DISPLAY").is_empty();
    let steam = steam_start_detected(cfg!(target_os = "linux"), &|name| std::env::var(name).ok());
    let app_image = !env_or_empty("APPIMAGE").is_empty();
    append_launch_log(
        data_dir,
        &format!(
            "start {} platform={} arch={} desktop={} session={} wayland={} display={} steam={} appImage={}",
            app_version(),
            std::env::consts::OS,
            std::env::consts::ARCH,
            desktop,
            session,
            wayland,
            display,
            steam,
            app_image
        ),
    );
}

fn steam_start_detected(is_linux: bool, get: &dyn Fn(&str) -> Option<String>) -> bool {
    if !is_linux {
        return false;
    }
    for key in ["SteamGameId", "SteamAppId", "STEAM_COMPAT_APP_ID"] {
        if get(key).is_some_and(|v| !v.trim().is_empty()) {
            return true;
        }
    }
    is_gamescope(get)
}

fn is_gamescope(get: &dyn Fn(&str) -> Option<String>) -> bool {
    get("XDG_CURRENT_DESKTOP").as_deref() == Some("gamescope")
        || get("GAMESCOPE_WAYLAND_DISPLAY").is_some_and(|v| !v.trim().is_empty())
}

fn steam_filtered_ld_library_path(value: &str) -> Option<String> {
    let kept: Vec<&str> = value
        .split(':')
        .filter(|entry| {
            if entry.is_empty() {
                return false;
            }
            let lower = entry.to_lowercase();
            !(lower.contains("steam-runtime")
                || lower.contains("steamrt")
                || lower.contains("ubuntu12_32")
                || lower.contains("ubuntu12_64")
                || lower.contains("pressure-vessel")
                || lower.contains("/steam/"))
        })
        .collect();
    if kept.is_empty() {
        None
    } else {
        Some(kept.join(":"))
    }
}

fn log_launch(data_dir: &Path, kind: &str, game_id: &str, emulator_id: &str, fix_note: &str) {
    if fix_note.is_empty() {
        append_launch_log(
            data_dir,
            &format!("launch kind={kind} game={game_id} emulator={emulator_id}"),
        );
    } else {
        append_launch_log(
            data_dir,
            &format!(
                "launch kind={kind} game={game_id} emulator={emulator_id} steamFix={fix_note}"
            ),
        );
    }
}

#[cfg(not(target_os = "android"))]
fn apply_steam_fix_to_command(command: &mut Command) -> String {
    if !cfg!(target_os = "linux") {
        return String::new();
    }
    let mut notes: Vec<String> = Vec::new();
    if std::env::var_os("LD_PRELOAD").is_some() {
        command.env_remove("LD_PRELOAD");
        notes.push("cleared LD_PRELOAD".to_owned());
    }
    if let Ok(ld_library) = std::env::var("LD_LIBRARY_PATH") {
        if let Some(kept) = steam_filtered_ld_library_path(&ld_library) {
            if kept != ld_library {
                command.env("LD_LIBRARY_PATH", &kept);
                notes.push("removed Steam libraries from LD_LIBRARY_PATH".to_owned());
            }
        } else if !ld_library.is_empty() {
            command.env_remove("LD_LIBRARY_PATH");
            notes.push("removed Steam libraries from LD_LIBRARY_PATH".to_owned());
        }
    }
    if is_gamescope(&|name| std::env::var(name).ok()) && std::env::var_os("DISPLAY").is_none() {
        notes.push("DISPLAY unset under gamescope; X11 emulators may fail".to_owned());
    }
    notes.join(", ")
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

#[cfg(not(target_os = "android"))]
fn launch_direct(
    app: &AppHandle,
    state: &AppState,
    config: &Value,
    game: &Game,
) -> Result<bool, String> {
    let file = Path::new(&game.rom_path);
    if !file.exists() {
        let name = file
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&game.rom_path);
        return Err(format!("{} is missing. Rescan in Settings.", name));
    }
    #[cfg(unix)]
    let is_app = file.extension().and_then(|s| s.to_str()) == Some("app");
    #[cfg(not(unix))]
    let is_app = false;
    #[cfg(unix)]
    let is_program = is_app
        || fs::metadata(file)
            .map(|m| {
                use std::os::unix::fs::PermissionsExt;
                m.permissions().mode() & 0o111 != 0
            })
            .unwrap_or(false);
    #[cfg(not(unix))]
    let is_program = file.extension().and_then(|s| s.to_str()) == Some("exe");
    if !is_program {
        app.opener()
            .open_path(&game.rom_path, None::<&str>)
            .map_err(|e| format!("Couldn't open: {e}"))?;
        log_launch(&state.data_dir, "direct-opener", &game.id, "", "");
        return Ok(true);
    }
    let executable = file.to_path_buf();
    let app_bundle = cfg!(target_os = "macos")
        .then(|| {
            executable
                .ancestors()
                .find(|p| p.extension().and_then(|ext| ext.to_str()) == Some("app"))
        })
        .flatten();
    let cwd = app_bundle
        .and_then(Path::parent)
        .or_else(|| executable.parent())
        .unwrap_or_else(|| Path::new("."));
    let mut command = if let Some(bundle) = app_bundle {
        let mut command = Command::new("open");
        command.args(["--wait-apps", "-a"]).arg(bundle);
        command
    } else {
        Command::new(&executable)
    };
    let fix_note = apply_steam_fix_to_command(&mut command);
    command
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = command.spawn().map_err(|e| format!("Launch failed: {e}"))?;
    let window = config
        .get("hideWhilePlaying")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        .then(|| app.get_webview_window("main"))
        .flatten();
    if let Some(window) = window.as_ref() {
        let _ = window.minimize();
    }
    wait_for_child(child, window);
    log_launch(&state.data_dir, "direct", &game.id, "", &fix_note);
    Ok(true)
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
    let own_emulator = config
        .get("gameEmulators")
        .and_then(|v| v.get(&game.id))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    let system_direct = system
        .get("direct")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let is_direct = own_emulator == "__direct" || (own_emulator.is_empty() && system_direct);
    if is_direct {
        #[cfg(target_os = "android")]
        {
            return Err("Direct launch is not available on Android.".to_owned());
        }
        #[cfg(not(target_os = "android"))]
        {
            return launch_direct(&app, &state, &config, &game);
        }
    }
    let emulator_id = if !own_emulator.is_empty() {
        own_emulator
    } else {
        system
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
            })?
    };
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
    let template = if emulator_id == system.get("emulator").and_then(Value::as_str).unwrap_or("") {
        system
            .get("args")
            .and_then(Value::as_str)
            .or_else(|| definition.get("args").and_then(Value::as_str))
            .unwrap_or("{rom}")
    } else {
        definition
            .get("args")
            .and_then(Value::as_str)
            .unwrap_or("{rom}")
    };
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
    let fix_note = apply_steam_fix_to_command(&mut command);
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
    #[cfg(not(target_os = "android"))]
    {
        let data_dir = state.data_dir.clone();
        let game_id = game.id.clone();
        let emu_id = emulator_id.to_owned();
        log_launch(&data_dir, "emulator", &game_id, &emu_id, &fix_note);
    }
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
        let extra_entries: Vec<Value> = config
            .get("extraGames")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter(|x| x.get("system").and_then(Value::as_str) == Some(id))
                    .filter(|x| {
                        let path = x.get("path").and_then(Value::as_str).unwrap_or("");
                        !path.is_empty() && (is_content_uri(path) || Path::new(path).exists())
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        if dirs.is_empty() && extra_entries.is_empty() {
            continue;
        }
        let mut files = Vec::new();
        // Direct systems scan only the top folder, because game folders hold helper binaries.
        let start_depth = if system
            .get("direct")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            4
        } else {
            0
        };
        for (root_index, root) in dirs.iter().enumerate() {
            allow_tree(app, root);
            walk_roms(
                &listings,
                root,
                root,
                root_index,
                start_depth,
                &extensions,
                &mut files,
            );
        }
        for entry in &extra_entries {
            let entry_id = entry
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let entry_path = entry
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let entry_title = entry
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
            let file_name = Path::new(&entry_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_owned();
            if file_name.is_empty() {
                continue;
            }
            let file_path = PathBuf::from(&entry_path);
            let parent = file_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."));
            files.push(RomFile {
                name: file_name,
                path: file_path,
                root: parent,
                root_index: 0,
                size: None,
                is_dump: false,
                added: Some(entry_id),
                title_override: entry_title,
            });
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
            let game_id = if let Some(added) = file.added.clone() {
                format!("{id}:added:{added}")
            } else {
                format!("{id}:{suffix}")
            };
            let title = file.title_override.clone().unwrap_or_else(|| {
                metadata
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or_else(|| display_title(&base))
            });
            Game {
                id: game_id,
                system: id.to_owned(),
                rom_path: file.path.to_string_lossy().to_string(),
                base,
                title,
                info: Value::Object(metadata),
                media,
                shell,
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: file.added.clone(),
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
                    added: None,
                    title_override: None,
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
                    added: None,
                    title_override: None,
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
                added: None,
                title_override: None,
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

fn switch_title_id(name: &str) -> Option<(String, u32)> {
    static TITLE_ID: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = TITLE_ID.get_or_init(|| regex::Regex::new(r"\[(?i)([0-9a-f]{16})\]").unwrap());
    let caps = re.captures(name)?;
    let id = u64::from_str_radix(caps.get(1)?.as_str(), 16).ok()?;
    let base = format!("{:016x}", id & !0x1fff_u64);
    Some((base, (id & 0x1fff_u64) as u32))
}

fn switch_group_key(name: &str) -> Option<String> {
    switch_title_id(name).map(|(base, _)| base)
}

fn copy_score(file: &RomFile) -> i64 {
    if file.added.is_some() {
        return i64::MAX;
    }
    let name = file.name.to_lowercase();
    let mut score: i64 = 0;
    if let Some((_, part)) = switch_title_id(&file.name) {
        score += if part == 0 { 8 } else { -8 };
    }
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
        // Switch updates/DLC group by title ID base instead of file name.
        let key = if let Some(group) = switch_group_key(&file.name) {
            format!("switch:{group}")
        } else {
            let normalized = loose_key(&base);
            if normalized.is_empty() {
                base.to_lowercase()
            } else {
                normalized
            }
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

fn os_release() -> Option<String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        std::process::Command::new("uname")
            .arg("-r")
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
            .filter(|release| !release.is_empty())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

fn feedback_diagnostics() -> String {
    let version = env!("CARGO_PKG_VERSION");
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let os_detail = match os_release() {
        Some(release) => format!("{os} {release} ({arch})"),
        None => format!("{os} ({arch})"),
    };
    let tauri_version = tauri::VERSION;
    let installation = if cfg!(debug_assertions) {
        "From source"
    } else {
        "Packaged app"
    };
    format!(
        "PyroCade: {version}\nOS: {os_detail}\nTauri: {tauri_version}\nInstallation: {installation}"
    )
}

#[tauri::command]
pub fn feedback_info() -> String {
    feedback_diagnostics()
}

#[tauri::command]
pub fn feedback_copy(app: AppHandle, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Nothing to copy yet.".to_owned());
    }
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|e| format!("Could not copy the report: {e}"))
}

#[tauri::command]
pub fn feedback_open(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/Pyrodrifter/PyroCade/issues/") {
        return Err("Not a GitHub issue link".to_owned());
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

    #[test]
    fn feedback_diagnostics_lists_only_basic_device_details() {
        let diagnostics = feedback_diagnostics();
        assert!(diagnostics.contains(&format!("PyroCade: {}", env!("CARGO_PKG_VERSION"))));
        assert!(diagnostics.contains("OS: "));
        assert!(diagnostics.contains("Tauri: "));
        assert!(diagnostics.contains("Installation: "));
        assert!(!diagnostics.contains("Electron"));
        assert!(!diagnostics.contains("data/"));
    }

    #[test]
    fn feedback_issue_url_must_target_this_repos_issue_pages() {
        assert!(
            "https://github.com/Pyrodrifter/PyroCade/issues/new?template=bug_report.md"
                .starts_with("https://github.com/Pyrodrifter/PyroCade/issues/")
        );
        assert!(
            !"https://github.com/Pyrodrifter/PyroCade/releases"
                .starts_with("https://github.com/Pyrodrifter/PyroCade/issues/")
        );
        assert!(
            !"https://example.com/issues/new"
                .starts_with("https://github.com/Pyrodrifter/PyroCade/issues/")
        );
    }

    fn rom_file(name: &str) -> RomFile {
        RomFile {
            name: name.to_owned(),
            path: PathBuf::from(name),
            root: PathBuf::from("roms"),
            root_index: 0,
            size: None,
            is_dump: false,
            added: None,
            title_override: None,
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
            hidden: false,
            scanned_title: Some("Game".to_owned()),
            custom_title: false,
            version: None,
            media_type: None,
            emulator: None,
            added: None,
        };

        let payload = serde_json::to_value(game).unwrap();

        assert_eq!(payload["id"], "snes:game");
        assert_eq!(payload["romPath"], "/roms/game.sfc");
        assert_eq!(payload["info"]["year"], "1998");
        assert_eq!(payload["media"]["front"], "file:///media/front.png");
        assert_eq!(payload["media"]["manual"], "/media/manual.pdf");
        assert_eq!(payload["shell"], "#a1b2c3");
        assert_eq!(payload["hidden"], false);
        assert_eq!(payload["scannedTitle"], "Game");
        assert_eq!(payload["customTitle"], false);
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
    fn switch_updates_and_dlc_group_with_their_base_game() {
        let selected = select(vec![
            rom_file("Game [0100abcd12340000][v0].nsp"),
            rom_file("Game [0100abcd12340800][v0].nsp"),
            rom_file("Game [0100abcd12341000][v0].nsp"),
        ]);
        assert_eq!(selected.len(), 1);
        assert_eq!(
            selected.values().next().unwrap().name,
            "Game [0100abcd12340000][v0].nsp"
        );
        assert_eq!(
            switch_group_key("Game [0100ABCD12340800][v0].nsp"),
            Some("0100abcd12340000".to_owned())
        );
        assert_eq!(switch_group_key("Game.nsp"), None);
    }

    #[test]
    fn apply_library_state_carries_hidden_renames_and_emulator_overrides() {
        let config = json!({
            "favorites": [],
            "hiddenGames": ["snes:secret"],
            "gameDetails": {"snes:zelda": {"title": "Custom Zelda", "version": "1.01", "mediaType": "disc"}},
            "gameEmulators": {"snes:zelda": "snes9x"},
            "gameOrders": {},
            "recentlyPlayed": [],
            "showFavoritesOnly": false,
            "showRecentlyPlayed": false,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
            },
            Game {
                id: "snes:secret".to_owned(),
                system: "snes".to_owned(),
                rom_path: String::new(),
                base: "secret".to_owned(),
                title: "Secret".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
            },
        ];
        super::apply_library_state(&mut games, &config);
        let zelda = games.iter().find(|g| g.id == "snes:zelda").unwrap();
        assert_eq!(zelda.title, "Custom Zelda");
        assert_eq!(zelda.scanned_title.as_deref(), Some("Zelda"));
        assert!(zelda.custom_title);
        assert_eq!(zelda.version.as_deref(), Some("1.01"));
        assert_eq!(zelda.media_type.as_deref(), Some("disc"));
        assert_eq!(zelda.emulator.as_deref(), Some("snes9x"));
        assert!(!zelda.hidden);
        let secret = games.iter().find(|g| g.id == "snes:secret").unwrap();
        assert!(secret.hidden);
        assert_eq!(secret.title, "Secret");
    }

    #[test]
    fn apply_library_state_honours_custom_order_per_system() {
        let config = json!({
            "favorites": [],
            "hiddenGames": [],
            "gameDetails": {},
            "gameEmulators": {},
            "gameOrders": {"snes": ["snes:b", "snes:a"]},
            "recentlyPlayed": [],
            "showFavoritesOnly": false,
            "showRecentlyPlayed": false,
            "sortKey": "custom",
            "sortAsc": true
        });
        let mut games = vec![
            Game {
                id: "snes:a".to_owned(),
                system: "snes".to_owned(),
                rom_path: String::new(),
                base: "a".to_owned(),
                title: "Apple".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
            },
            Game {
                id: "snes:b".to_owned(),
                system: "snes".to_owned(),
                rom_path: String::new(),
                base: "b".to_owned(),
                title: "Zebra".to_owned(),
                info: Value::Null,
                media: HashMap::new(),
                shell: None,
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
            },
        ];
        super::apply_library_state(&mut games, &config);
        assert_eq!(games[0].id, "snes:b");
        assert_eq!(games[1].id, "snes:a");
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

    #[test]
    fn steam_start_requires_linux_and_a_steam_marker() {
        let plain = |_: &str| None;
        assert!(!steam_start_detected(true, &plain));
        assert!(!steam_start_detected(false, &|_| Some("123".to_owned())));
        assert!(steam_start_detected(true, &|name| {
            (name == "SteamGameId").then_some("123".to_owned())
        }));
        assert!(steam_start_detected(true, &|name| {
            (name == "XDG_CURRENT_DESKTOP").then_some("gamescope".to_owned())
        }));
        assert!(steam_start_detected(true, &|name| {
            (name == "GAMESCOPE_WAYLAND_DISPLAY").then_some("wayland-0".to_owned())
        }));
    }

    #[test]
    fn steam_library_filter_removes_only_steam_runtime_entries() {
        let mixed = "/usr/lib:/home/u/.local/lib:/run/steam-runtime/libs:/opt/STEAM/libs:/home/u/pressure-vessel/libs";
        assert_eq!(
            steam_filtered_ld_library_path(mixed).unwrap(),
            "/usr/lib:/home/u/.local/lib"
        );
        assert!(steam_filtered_ld_library_path("/run/steamrt/libs").is_none());
        assert!(steam_filtered_ld_library_path("").is_none());
        assert_eq!(
            steam_filtered_ld_library_path("/usr/lib:/bin").unwrap(),
            "/usr/lib:/bin"
        );
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

    // Direct systems start at depth 4: the same walk contract as scan uses.
    #[test]
    fn direct_depth_skips_nested_helper_binaries() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-direct-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("Game One")).unwrap();
        fs::write(root.join("Game One/play.exe"), [0u8; 7]).unwrap();
        fs::write(root.join("Top.exe"), [0u8; 7]).unwrap();
        let extensions: HashSet<String> = [".exe"].iter().map(|s| s.to_string()).collect();
        let mut shallow = Vec::new();
        walk_roms(
            &ScanListings::default(),
            &root,
            &root,
            0,
            4,
            &extensions,
            &mut shallow,
        );
        let names: Vec<_> = shallow.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"Top.exe"));
        assert!(!names.contains(&"play.exe"));
        let mut deep = Vec::new();
        walk_roms(
            &ScanListings::default(),
            &root,
            &root,
            0,
            0,
            &extensions,
            &mut deep,
        );
        assert!(deep.iter().any(|f| f.name == "play.exe"));
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
            hidden: false,
            scanned_title: None,
            custom_title: false,
            version: None,
            media_type: None,
            emulator: None,
            added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                hidden: false,
                scanned_title: None,
                custom_title: false,
                version: None,
                media_type: None,
                emulator: None,
                added: None,
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
                added: None,
                title_override: None,
            },
            RomFile {
                name: "Game (USA) (Disc 2).chd".to_owned(),
                path: PathBuf::from("Game (USA) (Disc 2).chd"),
                root: PathBuf::from("roms"),
                root_index: 1,
                size: None,
                is_dump: false,
                added: None,
                title_override: None,
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
                added: None,
                title_override: None,
            },
            RomFile {
                name: "Game (USA) (Disc 2).chd".to_owned(),
                path: PathBuf::from("Game (USA) (Disc 2).chd"),
                root: PathBuf::from("roms"),
                root_index: 1,
                size: None,
                is_dump: false,
                added: None,
                title_override: None,
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
            hidden: false,
            scanned_title: None,
            custom_title: false,
            version: None,
            media_type: None,
            emulator: None,
            added: None,
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
