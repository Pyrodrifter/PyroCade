use crate::backend::{AppState, Game};
use image::GenericImageView;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::{self, OpenOptions};
use std::io::{BufReader, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const LIBRETRO: &str = "https://thumbnails.libretro.com";
const SWITCH_DATABASE: &str = "https://www.gametdb.com/switchtdb.txt?LANG=EN";
const SWITCH_IMAGES: &str = "https://art.gametdb.com/switch";
const MARIOWIKI: &str = "https://www.mariowiki.com";
const MARIOWIKI_IMAGES: &str = "https://mario.wiki.gallery";
const ARCHIVE_API: &str = "https://archive.org";
const ARCHIVE_IIIF: &str = "https://iiif.archive.org/image/iiif/3";
const ARCHIVE_COLLECTION: &str = "softwareboxart";
const LAUNCHBOX_METADATA: &str = "https://gamesdb.launchbox-app.com/Metadata.zip";
const LAUNCHBOX_IMAGES: &str = "https://images.launchbox-app.com";
const SCREENSCRAPER_API: &str = "https://api.screenscraper.fr/api2";
const SCREENSCRAPER_SOFTNAME: &str = "PyroCade";
// LAUNCHBOX_INDEX_VERSION is the LaunchBox index schema version; a different on-disk version rebuilds from the database download.
const LAUNCHBOX_INDEX_VERSION: u64 = 2;
// LAUNCHBOX_KEEP bounds front files kept per game, so the cached index stays small.
const LAUNCHBOX_KEEP: usize = 6;
// SCREENSCRAPER_CRC_LIMIT bounds checksum hashing to cartridge-sized ROMs; larger disc images are matched by name and size.
const SCREENSCRAPER_CRC_LIMIT: u64 = 64 * 1024 * 1024;
// USER_AGENT stays PyroCade-Frontend: the branch host and the web sources share it.
const USER_AGENT: &str = "PyroCade-Frontend";
const WEB_CACHE_AGE_SECS: u64 = 30 * 86400;
const ARCHIVE_INDEX_VERSION: u64 = 2;
const ARCHIVE_MAX_FILE_BYTES: u64 = 19 * 1024 * 1024;
// MAX_ARTWORK_PIXELS caps one image at 40 million pixels, because compressed bytes do not bound decoded memory.
const MAX_ARTWORK_PIXELS: u64 = 40_000_000;
// MAX_SWITCH_CODES bounds title collisions, because each match multiplies remote requests.
const MAX_SWITCH_CODES: usize = 4;
// MANUAL_MAX_BYTES caps one manual PDF; manuals are PDF files, not images.
const MANUAL_MAX_BYTES: usize = 150 * 1024 * 1024;
const TYPES: &[(&str, &str, Option<&str>)] = &[
    ("front", "covers", Some("Named_Boxarts")),
    ("frontHQ", "cover-hq", None),
    ("screenshot", "screenshots", Some("Named_Snaps")),
    ("title", "titlescreens", Some("Named_Titles")),
    ("back", "backcovers", Some("Named_Boxarts")),
    ("spine", "spines", None),
    ("disc", "discs", Some("Named_Titles")),
    ("fanart", "fanart", None),
    ("manual", "manuals", None),
];

#[derive(Default)]
pub struct ArtworkControl {
    job: Option<Value>,
    cancelled: Option<Arc<AtomicBool>>,
}

#[tauri::command]
pub async fn fetch_art(
    state: State<'_, AppState>,
    sys_id: String,
    base: String,
    options: Option<Value>,
) -> Result<Value, String> {
    let game = state
        .games
        .read()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|g| g.system == sys_id && g.base == base)
        .cloned()
        .ok_or_else(|| "Game is no longer in your library. Rescan and try again.".to_owned())?;
    let config = state.config();
    let types = if options
        .as_ref()
        .and_then(|o| o.get("hq"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        vec!["frontHQ".to_owned()]
    } else {
        vec!["front".to_owned(), "screenshot".to_owned()]
    };
    let retry_missing = options
        .as_ref()
        .and_then(|o| o.get("retryMissing"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let refreshed_indexes = Arc::new(Mutex::new(HashSet::new()));
    // Automatic lookups reuse a cached LaunchBox index; only the Artwork page may build it.
    let result = download_game(
        &state.app,
        &game,
        &types,
        &config,
        &state.data_dir,
        None,
        retry_missing,
        &refreshed_indexes,
        false,
    )
    .await;
    update_game_media(&state.games, &game.id, &result);
    Ok(result.get("media").cloned().unwrap_or_else(|| json!({})))
}

#[tauri::command]
pub fn artwork_status(state: State<'_, AppState>) -> Option<Value> {
    state.artwork.lock().ok()?.job.clone()
}

#[tauri::command]
pub fn cancel_artwork_download(app: AppHandle, state: State<'_, AppState>) -> Option<Value> {
    let mut control = state.artwork.lock().ok()?;
    if control
        .job
        .as_ref()
        .and_then(|j| j.get("status"))
        .and_then(Value::as_str)
        == Some("running")
    {
        if let Some(cancelled) = &control.cancelled {
            cancelled.store(true, Ordering::Relaxed);
        }
        if let Some(job) = control.job.as_mut() {
            job["status"] = Value::String("cancelling".to_owned());
        }
        emit_job(&app, &mut control, None, true);
    }
    control.job.clone()
}

#[tauri::command]
pub fn start_artwork_download(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Value,
) -> Result<Value, String> {
    let mut control = state.artwork.lock().map_err(|e| e.to_string())?;
    if control
        .job
        .as_ref()
        .and_then(|j| j.get("status"))
        .and_then(Value::as_str)
        .is_some_and(|s| s == "running" || s == "cancelling")
    {
        return Err("An artwork download is already running".to_owned());
    }
    let scope = options
        .get("scope")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !["game", "system", "library"].contains(&scope) {
        return Err("Choose a download scope".to_owned());
    }
    let known: HashSet<&str> = TYPES.iter().map(|(kind, _, _)| *kind).collect();
    let types: Vec<String> = options
        .get("types")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|kind| known.contains(*kind))
        .map(str::to_owned)
        .collect();
    if types.is_empty() {
        return Err("Choose at least one artwork type".to_owned());
    }
    let retry_missing = options
        .get("retryMissing")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let all_games = state.games.read().map_err(|e| e.to_string())?.clone();
    let games: Vec<Game> = all_games
        .into_iter()
        .filter(|game| match scope {
            "game" => options.get("gameId").and_then(Value::as_str) == Some(&game.id),
            "system" => options.get("systemId").and_then(Value::as_str) == Some(&game.system),
            _ => true,
        })
        .collect();
    if games.is_empty() {
        return Err("No games found. Add a ROM folder and rescan your library first.".to_owned());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    control.cancelled = Some(cancel.clone());
    control.job = Some(json!({
        "id":uuid::Uuid::new_v4().to_string(),"seq":0,"status":"running","scope":scope,"types":types,
        "total":games.len(),"completed":0,"downloaded":0,"existing":0,"missing":0,"unsupported":0,"errors":0,
        "lastTitle":"Preparing download…","entries":[],"startedAt":chrono::Utc::now().timestamp_millis()
    }));
    emit_job(&app, &mut control, None, true);
    let initial = control.job.clone().expect("job was initialized");
    let types = types.clone();
    drop(control);

    let queue = Arc::new(Mutex::new(VecDeque::from(games)));
    let refreshed_indexes = Arc::new(Mutex::new(HashSet::new()));
    let config = state.config();
    let data_dir = state.data_dir.clone();
    let game_store = state.games.clone();
    let job_store = state.artwork.clone();
    let app_for_task = app.clone();
    let worker_count = 2;
    tauri::async_runtime::spawn(async move {
        let mut workers = Vec::new();
        for _ in 0..worker_count {
            let queue = queue.clone();
            let cancelled = cancel.clone();
            let config = config.clone();
            let data_dir = data_dir.clone();
            let game_store = game_store.clone();
            let job_store = job_store.clone();
            let app = app_for_task.clone();
            let types = types.clone();
            let refreshed_indexes = refreshed_indexes.clone();
            workers.push(tauri::async_runtime::spawn(async move {
                loop {
                    if cancelled.load(Ordering::Relaxed) {
                        break;
                    }
                    let game = queue.lock().ok().and_then(|mut q| q.pop_front());
                    let Some(game) = game else {
                        break;
                    };
                    if let Ok(mut control) = job_store.lock() {
                        if let Some(job) = control.job.as_mut() {
                            job["lastTitle"] = Value::String(game.title.clone());
                        }
                        emit_job(&app, &mut control, None, false);
                    }
                    let result = download_game(
                        &app,
                        &game,
                        &types,
                        &config,
                        &data_dir,
                        Some(&cancelled),
                        retry_missing,
                        &refreshed_indexes,
                        true,
                    )
                    .await;
                    update_game_media(&game_store, &game.id, &result);
                    if let Ok(mut control) = job_store.lock() {
                        if let Some(job) = control.job.as_mut() {
                            increment(job, "completed", 1);
                            for key in ["downloaded", "existing", "missing"] {
                                increment(job, key, result[key].as_u64().unwrap_or_default());
                            }
                            increment(
                                job,
                                "unsupported",
                                u64::from(result["unsupported"].as_bool().unwrap_or(false)),
                            );
                            increment(
                                job,
                                "errors",
                                u64::from(
                                    result["errors"].as_array().is_some_and(|e| !e.is_empty()),
                                ),
                            );
                            let mut entries =
                                job["entries"].as_array().cloned().unwrap_or_default();
                            entries.insert(0, result.clone());
                            entries.truncate(8);
                            job["entries"] = Value::Array(entries);
                        }
                        let item = (result["downloaded"].as_u64().unwrap_or_default() > 0)
                            .then_some(result);
                        emit_job(&app, &mut control, item, false);
                    }
                }
            }));
        }
        for worker in workers {
            let _ = worker.await;
        }
        if let Ok(mut control) = job_store.lock() {
            if let Some(job) = control.job.as_mut() {
                job["status"] = Value::String(
                    if cancel.load(Ordering::Relaxed) {
                        "cancelled"
                    } else {
                        "complete"
                    }
                    .to_owned(),
                );
                job["finishedAt"] = json!(chrono::Utc::now().timestamp_millis());
            }
            emit_job(&app_for_task, &mut control, None, true);
            control.cancelled = None;
        }
    });
    Ok(initial)
}

#[tauri::command]
pub fn open_artwork_folder(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let path = state.data_dir.join("media");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_artwork(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Value,
) -> Result<Option<Value>, String> {
    let game_id = options
        .get("gameId")
        .and_then(Value::as_str)
        .ok_or("Select a game in your library first.")?;
    let kind = options
        .get("kind")
        .and_then(Value::as_str)
        .ok_or("Choose an artwork type.")?;
    if ![
        "front",
        "back",
        "spine",
        "disc",
        "screenshot",
        "title",
        "fanart",
        "manual",
    ]
    .contains(&kind)
    {
        return Err("Choose an artwork type.".to_owned());
    }
    let game = state
        .games
        .read()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|g| g.id == game_id)
        .cloned()
        .ok_or("Select a game in your library first.")?;
    if kind == "manual" {
        let Some(source) = app
            .dialog()
            .file()
            .set_title(format!("Choose the manual for {}", game.title))
            .blocking_pick_file()
            .and_then(|p| p.into_path().ok())
        else {
            return Ok(None);
        };
        let bytes = fs::read(&source).map_err(|e| e.to_string())?;
        if !valid_pdf(&bytes) {
            return Err(format!(
                "{} is not a PDF file.",
                source
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("The chosen file")
            ));
        }
        let base = safe_base(&game.base)?;
        let directory = state
            .data_dir
            .join("media")
            .join(&game.system)
            .join("manuals");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let file = directory.join(format!("{base}.pdf"));
        if fs::canonicalize(&file).ok() != fs::canonicalize(&source).ok() {
            let temporary = file.with_extension("pdf.tmp");
            fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
            fs::rename(&temporary, &file).map_err(|e| e.to_string())?;
        }
        // Manual payloads stay filesystem paths for the native opener and viewer.
        let _ = app.asset_protocol_scope().allow_file(&file);
        let stored = file.to_string_lossy().into_owned();
        let result = json!({"gameId":game.id,"media":{"manual":stored},"replace":true});
        update_game_media(&state.games, &game.id, &result);
        return Ok(Some(result));
    }
    let Some(source) = app
        .dialog()
        .file()
        .set_title("Choose artwork image")
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(None);
    };
    let bytes = fs::read(source).map_err(|e| e.to_string())?;
    let image = image::load_from_memory(&bytes)
        .map_err(|_| "Choose a valid image smaller than 40 megapixels.".to_owned())?;
    let dimensions = image.dimensions();
    if dimensions.0 == 0
        || dimensions.1 == 0
        || dimensions.0 > 16384
        || dimensions.1 > 16384
        || u64::from(dimensions.0) * u64::from(dimensions.1) > MAX_ARTWORK_PIXELS
    {
        return Err("Choose a valid image smaller than 40 megapixels.".to_owned());
    }
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let directory = state
        .data_dir
        .join("media")
        .join(&game.system)
        .join(type_folder(kind));
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let file = directory.join(format!("{}.png", safe_base(&game.base)?));
    let temporary = file.with_extension("png.tmp");
    fs::write(&temporary, png.into_inner()).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &file).map_err(|e| e.to_string())?;
    let _ = app.asset_protocol_scope().allow_file(&file);
    let url = Url::from_file_path(&file)
        .map_err(|_| "Could not create artwork URL".to_owned())?
        .to_string();
    let result = json!({"gameId":game.id,"media":{kind:url},"replace":true});
    update_game_media(&state.games, &game.id, &result);
    Ok(Some(result))
}

#[tauri::command]
pub fn artwork_sources(state: State<'_, AppState>) -> Value {
    let config = state.config();
    let built = fs::metadata(web_cache_file(&state.data_dir, "launchbox-index.json"))
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let section = config.get("screenscraper");
    let field = |key: &str| {
        section
            .and_then(|s| s.get(key))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned()
    };
    let has_password = !field("password").is_empty();
    let has_dev_password = !field("devPassword").is_empty();
    json!({
        "launchbox": {"built": built},
        "screenscraper": {
            "user": field("user"),
            "devId": field("devId"),
            "hasPassword": has_password,
            "hasDevPassword": has_dev_password,
            "ready": screenscraper_configured(&config)
        }
    })
}

#[tauri::command]
pub fn set_screenscraper(state: State<'_, AppState>, details: Value) -> Result<Value, String> {
    if !details.is_object() {
        return Err("Invalid ScreenScraper details".to_owned());
    }
    let text = |key: &str| {
        details
            .get(key)
            .and_then(Value::as_str)
            .map(|s| s.trim().chars().take(200).collect::<String>())
    };
    let mut current = state.config.write().map_err(|e| e.to_string())?;
    let old = current
        .get("screenscraper")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let old_field = |key: &str| {
        old.get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned()
    };
    let clear = details
        .get("clear")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let next_section = if clear {
        json!({"user": "", "devId": "", "password": "", "devPassword": ""})
    } else {
        let mut next = old.clone();
        if let Some(value) = text("user") {
            next["user"] = json!(value);
        }
        if let Some(value) = text("devId") {
            next["devId"] = json!(value);
        }
        // An empty password field keeps the saved password.
        if let Some(value) = text("password") {
            if !value.is_empty() {
                next["password"] = json!(value);
            }
        }
        if let Some(value) = text("devPassword") {
            if !value.is_empty() {
                next["devPassword"] = json!(value);
            }
        }
        if next.get("user").is_none() {
            next["user"] = json!(old_field("user"));
        }
        if next.get("devId").is_none() {
            next["devId"] = json!(old_field("devId"));
        }
        if next.get("password").is_none() {
            next["password"] = json!(old_field("password"));
        }
        if next.get("devPassword").is_none() {
            next["devPassword"] = json!(old_field("devPassword"));
        }
        next
    };
    current["screenscraper"] = next_section;
    let next = crate::config::config_for_save(current.clone(), &current)?;
    crate::config::save_config(&state.config_path, &next)?;
    *current = next;
    drop(current);
    Ok(artwork_sources(state))
}

#[tauri::command]
pub fn manual_url(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let candidate = Path::new(&path);
    let known = path.to_lowercase().ends_with(".pdf")
        && candidate.is_file()
        && state
            .games
            .read()
            .map(|games| {
                games
                    .iter()
                    .any(|g| g.media.get("manual").is_some_and(|m| m == &path))
            })
            .unwrap_or(false);
    if !known {
        return Err("Manual not found.".to_owned());
    }
    let _ = app.asset_protocol_scope().allow_file(candidate);
    Url::from_file_path(candidate)
        .map(|url| url.to_string())
        .map_err(|_| "Manual not found.".to_owned())
}

#[tauri::command]
pub async fn find_manuals(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Value>, String> {
    let Some(folder) = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(None);
    };
    let mut pdfs: Vec<PathBuf> = Vec::new();
    let mut stack = vec![(folder.clone(), 0_u8)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && depth < 6 {
                stack.push((p, depth + 1));
            } else if p.is_file()
                && p.extension()
                    .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("pdf"))
            {
                pdfs.push(p);
                if pdfs.len() >= 20000 {
                    break;
                }
            }
        }
        if pdfs.len() >= 20000 {
            break;
        }
    }
    let mut by_key: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for p in &pdfs {
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        for key in [manual_loose_key(stem), manual_bare_key(stem)] {
            if !key.is_empty() {
                by_key.entry(key).or_default().push(p.clone());
            }
        }
    }
    let games = state.games.read().map_err(|e| e.to_string())?.clone();
    let mut matched = Vec::new();
    for game in &games {
        if game.media.contains_key("manual") || game.media.get("manual").is_some() {
            continue;
        }
        let names = [game.base.clone(), game.title.clone()];
        let mut seen = HashSet::new();
        let mut options: Vec<PathBuf> = Vec::new();
        for name in &names {
            for key in [manual_loose_key(name), manual_bare_key(name)] {
                if key.is_empty() {
                    continue;
                }
                if let Some(paths) = by_key.get(&key) {
                    for path in paths {
                        if seen.insert(path.clone()) {
                            options.push(path.clone());
                        }
                    }
                }
            }
        }
        if options.is_empty() {
            continue;
        }
        let config = state.config();
        let system_words: Vec<String> = config
            .get("systems")
            .and_then(Value::as_array)
            .and_then(|systems| {
                systems
                    .iter()
                    .find(|s| s.get("id").and_then(Value::as_str) == Some(&game.system))
            })
            .map(|s| {
                ["name", "id", "libretro"]
                    .into_iter()
                    .filter_map(|k| s.get(k).and_then(Value::as_str).map(|v| v.to_lowercase()))
                    .collect()
            })
            .unwrap_or_default();
        let best = options
            .iter()
            .find(|p| {
                let lower = p.to_string_lossy().to_lowercase();
                system_words
                    .iter()
                    .any(|w| !w.is_empty() && lower.contains(w))
            })
            .cloned()
            .unwrap_or_else(|| options[0].clone());
        let Ok(bytes) = fs::read(&best) else { continue };
        if !valid_pdf(&bytes) {
            continue;
        }
        let Ok(base) = safe_base(&game.base) else {
            continue;
        };
        let dest = state
            .data_dir
            .join("media")
            .join(&game.system)
            .join("manuals")
            .join(format!("{base}.pdf"));
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::canonicalize(&dest).ok() == fs::canonicalize(&best).ok() {
            let _ = app.asset_protocol_scope().allow_file(&dest);
            let stored = dest.to_string_lossy().into_owned();
            let entry = json!({"gameId": game.id, "media": {"manual": stored}, "replace": true});
            update_game_media(&state.games, &game.id, &entry);
            matched.push(entry);
            continue;
        }
        let temporary = dest.with_extension("pdf.tmp");
        if fs::write(&temporary, bytes).is_err() {
            continue;
        }
        if fs::rename(&temporary, &dest).is_err() {
            let _ = fs::remove_file(&temporary);
            continue;
        }
        let _ = app.asset_protocol_scope().allow_file(&dest);
        let stored = dest.to_string_lossy().into_owned();
        let entry = json!({"gameId": game.id, "media": {"manual": stored}, "replace": true});
        update_game_media(&state.games, &game.id, &entry);
        matched.push(entry);
    }
    Ok(Some(json!({"found": pdfs.len(), "matched": matched})))
}

fn valid_pdf(bytes: &[u8]) -> bool {
    bytes.len() >= 5 && &bytes[0..5] == b"%PDF-"
}

fn manual_loose_key(name: &str) -> String {
    let cleaned = clean_title_like(name);
    let lower = cleaned.to_lowercase();
    let without = regex::Regex::new(r"&|\band\b|\bthe\b")
        .unwrap()
        .replace_all(&lower, "");
    without
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn manual_bare_key(name: &str) -> String {
    static BRAND: OnceLock<regex::Regex> = OnceLock::new();
    let brand = BRAND.get_or_init(|| {
        regex::Regex::new(r"(?i)^\s*(disney\s*[-•]?\s*pixar|disney|pixar|dreamworks|nickelodeon|nicktoons)('s)?\b[\s:-]*").unwrap()
    });
    let cleaned = clean_title_like(name);
    if !brand.is_match(&cleaned) {
        return String::new();
    }
    let stripped = brand.replace(&cleaned, "");
    let key = manual_loose_key(&stripped);
    if key.len() >= 6 { key } else { String::new() }
}

async fn request_pdf(
    url: Url,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    polite_gap(PoliteSite::ScreenScraper).await;
    let response = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    match response.status().as_u16() {
        404 | 410 => return Ok(None),
        429 | 503 => {
            return Err("ScreenScraper asked PyroCade to slow down; try again later".to_owned());
        }
        status if !response.status().is_success() => {
            return Err(format!("ScreenScraper returned HTTP {status}"));
        }
        _ => {}
    }
    if response
        .content_length()
        .is_some_and(|n| n > MANUAL_MAX_BYTES as u64)
    {
        return Err("Manual is too large".to_owned());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
    if bytes.len() > MANUAL_MAX_BYTES {
        return Err("Manual is too large".to_owned());
    }
    if !valid_pdf(&bytes) {
        return Err("Manual source did not return a PDF".to_owned());
    }
    Ok(Some(bytes))
}

async fn screenscraper_manual_urls(
    game: &Game,
    system: u32,
    credentials: &ScreenScraperCredentials,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Vec<String>, String> {
    let rom_size = fs::metadata(&game.rom_path).map(|meta| meta.len()).ok();
    let crc = rom_size.and_then(|size| screenscraper_crc(game, size));
    let url = screenscraper_lookup_url(game, system, credentials, rom_size, crc);
    let Some(data) = screenscraper_json(url, cancelled).await? else {
        return Ok(Vec::new());
    };
    let Some(medias) = data
        .get("response")
        .and_then(|r| r.get("jeu"))
        .and_then(|j| j.get("medias"))
        .and_then(Value::as_array)
    else {
        return Ok(Vec::new());
    };
    let file = web_cache_file(data_dir, "screenscraper.json");
    let key = format!("ss-manual/{system}/{}", game.id);
    if let Some(cached) = web_cache_get(&file, &key) {
        if let Some(urls) = cached.as_array() {
            let found: Vec<String> = urls
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect();
            if !found.is_empty() {
                return Ok(found);
            }
        }
    }
    let mut candidates: Vec<(u32, String)> = medias
        .iter()
        .filter(|media| media.get("type").and_then(Value::as_str) == Some("manuel"))
        .filter_map(|media| {
            let url = media.get("url").and_then(Value::as_str)?;
            if !screenscraper_media_url(url) {
                return None;
            }
            let region = media.get("region").and_then(Value::as_str).unwrap_or("");
            Some((screenscraper_region_rank(region), url.to_owned()))
        })
        .collect();
    candidates.sort_by_key(|(rank, _)| *rank);
    candidates.truncate(6);
    let found: Vec<String> = candidates.into_iter().map(|(_, url)| url).collect();
    web_cache_set(&file, &key, json!(found));
    Ok(found)
}

async fn fetch_screenscraper_manual(
    game: &Game,
    sys_id: &str,
    config: &Value,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    let Some(system) = screenscraper_system(sys_id) else {
        return Ok(None);
    };
    let Some(credentials) = screenscraper_credentials(config) else {
        return Ok(None);
    };
    let urls = screenscraper_manual_urls(game, system, &credentials, data_dir, cancelled).await?;
    for url in urls {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        match request_pdf(parsed, cancelled).await {
            Ok(Some(bytes)) => return Ok(Some(bytes)),
            Ok(None) => {}
            Err(error) => {
                if error == "Cancelled" || cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    return Err(error);
                }
            }
        }
    }
    Ok(None)
}

fn emit_job(app: &AppHandle, control: &mut ArtworkControl, item: Option<Value>, force: bool) {
    let Some(job) = control.job.as_mut() else {
        return;
    };
    if !force && item.is_none() {
        return;
    }
    let sequence = job["seq"].as_u64().unwrap_or_default() + 1;
    job["seq"] = json!(sequence);
    let mut event = job.clone();
    if let Some(item) = item {
        event["item"] = item;
    }
    let _ = app.emit("art:progress", event);
}

fn increment(value: &mut Value, key: &str, amount: u64) {
    let next = value.get(key).and_then(Value::as_u64).unwrap_or_default() + amount;
    value[key] = json!(next);
}

fn update_game_media(store: &Arc<RwLock<Vec<Game>>>, game_id: &str, result: &Value) {
    let Some(media) = result.get("media").and_then(Value::as_object) else {
        return;
    };
    let replace = result
        .get("replace")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if let Ok(mut games) = store.write() {
        if let Some(game) = games.iter_mut().find(|g| g.id == game_id) {
            for (kind, url) in media {
                if replace || !game.media.contains_key(kind) {
                    if let Some(url) = url.as_str() {
                        game.media.insert(kind.clone(), url.to_owned());
                    }
                }
            }
        }
    }
}

async fn download_game(
    app: &AppHandle,
    game: &Game,
    types: &[String],
    config: &Value,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    retry_missing: bool,
    refreshed_indexes: &Arc<Mutex<HashSet<String>>>,
    allow_index_download: bool,
) -> Value {
    let system = config
        .get("systems")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|s| s.get("id").and_then(Value::as_str) == Some(&game.system));
    let Some(system) = system else {
        return empty_result(game, true);
    };
    let switch = system.get("artworkProvider").and_then(Value::as_str) == Some("gametdb-switch");
    let system_id = system
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let fallback = mariowiki_covers(&system_id)
        || archive_covers(&system_id)
        || launchbox_covers(&system_id)
        || screenscraper_covers(&system_id, config);
    if !switch && system.get("libretro").and_then(Value::as_str).is_none() && !fallback {
        return empty_result(game, true);
    }
    let base = match safe_base(&game.base) {
        Ok(base) => base,
        Err(error) => {
            return json!({"gameId":game.id,"title":game.title,"media":{},"downloaded":0,"existing":0,"missing":0,"errors":[error],"unsupported":false});
        }
    };
    let mut media = serde_json::Map::new();
    let mut downloaded = 0_u64;
    let mut existing = 0_u64;
    let mut missing = 0_u64;
    let mut errors = Vec::new();
    for kind in types {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            break;
        }
        if game.media.contains_key(kind) {
            existing += 1;
            continue;
        }
        if kind == "manual" {
            let manual_path = data_dir
                .join("media")
                .join(&game.system)
                .join("manuals")
                .join(format!("{base}.pdf"));
            if manual_path.is_file() {
                existing += 1;
                let _ = app.asset_protocol_scope().allow_file(&manual_path);
                media.insert(
                    kind.clone(),
                    Value::String(manual_path.to_string_lossy().into_owned()),
                );
                continue;
            }
            match fetch_screenscraper_manual(game, &system_id, config, data_dir, cancelled).await {
                Ok(Some(bytes)) => {
                    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                        break;
                    }
                    match write_new(&manual_path, &bytes) {
                        Ok(true) => {
                            downloaded += 1;
                            let _ = app.asset_protocol_scope().allow_file(&manual_path);
                            media.insert(
                                kind.clone(),
                                Value::String(manual_path.to_string_lossy().into_owned()),
                            );
                        }
                        Ok(false) => {
                            existing += 1;
                            let _ = app.asset_protocol_scope().allow_file(&manual_path);
                            media.insert(
                                kind.clone(),
                                Value::String(manual_path.to_string_lossy().into_owned()),
                            );
                        }
                        Err(error) => errors.push(error),
                    }
                }
                Ok(None) => missing += 1,
                Err(_) if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) => break,
                Err(error) => errors.push(error),
            }
            continue;
        }
        let Some((_, folder, remote)) = TYPES.iter().find(|(name, _, _)| name == kind) else {
            continue;
        };
        let path = data_dir
            .join("media")
            .join(&game.system)
            .join(folder)
            .join(format!("{base}.png"));
        if path.is_file() {
            existing += 1;
            // Cached media enters the asset scope before its file:// reaches the renderer.
            let _ = app.asset_protocol_scope().allow_file(&path);
            if let Ok(url) = Url::from_file_path(&path) {
                media.insert(kind.clone(), Value::String(url.to_string()));
            }
            continue;
        }
        let primary = if switch {
            fetch_switch_image(
                system,
                game,
                kind,
                data_dir,
                cancelled,
                retry_missing,
                refreshed_indexes,
            )
            .await
        } else if let Some(remote) = remote {
            fetch_libretro_image(
                system,
                &base,
                kind,
                remote,
                data_dir,
                cancelled,
                retry_missing,
                refreshed_indexes,
            )
            .await
        } else {
            Ok(None)
        };
        // Front covers only, after the existing providers, never replacing an existing cover:
        // the media/file checks above already returned `existing`, so a fallback here can only fill a gap.
        let result = if kind == "front"
            && !matches!(primary, Ok(Some(_)))
            && !cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
        {
            let mut primary_error: Option<String> = None;
            let mut primary_cancelled = false;
            if let Err(error) = primary {
                if error == "Cancelled" || cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    primary_cancelled = true;
                } else {
                    primary_error = Some(error);
                }
            }
            let mariowiki_refresh =
                refresh_index(retry_missing, refreshed_indexes, "mariowiki".to_owned());
            let mut outcome: Option<Result<Option<Vec<u8>>, String>> = None;
            if primary_cancelled {
                outcome = Some(Err("Cancelled".to_owned()));
            }
            if outcome.is_none() && mariowiki_covers(&system_id) {
                let wiki =
                    fetch_mariowiki_image(game, &system_id, data_dir, cancelled, mariowiki_refresh)
                        .await;
                match wiki {
                    Ok(Some(bytes)) => outcome = Some(Ok(Some(bytes))),
                    Ok(None) => {}
                    Err(error) => {
                        if error == "Cancelled"
                            || cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                        {
                            outcome = Some(Err(error));
                        } else if primary_error.is_none() {
                            primary_error = Some(error);
                        }
                    }
                }
            }
            if outcome.is_none()
                && !cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                && archive_covers(&system_id)
            {
                let archive_refresh = refresh_index(
                    retry_missing,
                    refreshed_indexes,
                    "internet-archive".to_owned(),
                );
                let archive = fetch_internet_archive_image(
                    game,
                    &system_id,
                    data_dir,
                    cancelled,
                    archive_refresh,
                )
                .await;
                match archive {
                    Ok(Some(bytes)) => outcome = Some(Ok(Some(bytes))),
                    Ok(None) => {}
                    Err(error) => {
                        if error == "Cancelled"
                            || cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                        {
                            outcome = Some(Err(error));
                        } else if primary_error.is_none() {
                            primary_error = Some(error);
                        }
                    }
                }
            }
            if outcome.is_none()
                && !cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                && launchbox_covers(&system_id)
            {
                let launchbox_refresh =
                    refresh_index(retry_missing, refreshed_indexes, "launchbox".to_owned());
                let launchbox = fetch_launchbox_image(
                    game,
                    &system_id,
                    data_dir,
                    cancelled,
                    launchbox_refresh,
                    allow_index_download,
                )
                .await;
                match launchbox {
                    Ok(Some(bytes)) => outcome = Some(Ok(Some(bytes))),
                    Ok(None) => {}
                    Err(error) => {
                        if error == "Cancelled"
                            || cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                        {
                            outcome = Some(Err(error));
                        } else if primary_error.is_none() {
                            primary_error = Some(error);
                        }
                    }
                }
            }
            if outcome.is_none()
                && !cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                && screenscraper_covers(&system_id, config)
            {
                let screenscraper_refresh =
                    refresh_index(retry_missing, refreshed_indexes, "screenscraper".to_owned());
                let screenscraper = fetch_screenscraper_image(
                    game,
                    &system_id,
                    config,
                    data_dir,
                    cancelled,
                    screenscraper_refresh,
                )
                .await;
                match screenscraper {
                    Ok(Some(bytes)) => outcome = Some(Ok(Some(bytes))),
                    Ok(None) => {}
                    Err(error) => {
                        if error == "Cancelled"
                            || cancelled.is_some_and(|c| c.load(Ordering::Relaxed))
                        {
                            outcome = Some(Err(error));
                        } else if primary_error.is_none() {
                            primary_error = Some(error);
                        }
                    }
                }
            }
            match outcome {
                Some(Ok(Some(bytes))) => Ok(Some(bytes)),
                Some(Err(error)) => Err(error),
                Some(Ok(None)) => match primary_error {
                    Some(error) => Err(error),
                    None => Ok(None),
                },
                None => match primary_error {
                    Some(error) => Err(error),
                    None => Ok(None),
                },
            }
        } else {
            primary
        };
        match result {
            Ok(Some(bytes)) => {
                if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    break;
                }
                match write_new(&path, &bytes) {
                    Ok(true) => downloaded += 1,
                    Ok(false) => existing += 1,
                    Err(error) => {
                        errors.push(error);
                        continue;
                    }
                }
                // Fresh files enter the asset scope before their file:// is handed out.
                let _ = app.asset_protocol_scope().allow_file(&path);
                if let Ok(url) = Url::from_file_path(&path) {
                    media.insert(kind.clone(), Value::String(url.to_string()));
                }
            }
            Ok(None) => missing += 1,
            Err(_) if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) => break,
            Err(error) => errors.push(error),
        }
    }
    json!({"gameId":game.id,"title":game.title,"media":media,"downloaded":downloaded,"existing":existing,"missing":missing,"errors":errors,"unsupported":false})
}

fn empty_result(game: &Game, unsupported: bool) -> Value {
    json!({"gameId":game.id,"title":game.title,"media":{},"downloaded":0,"existing":0,"missing":0,"errors":[],"unsupported":unsupported})
}

async fn fetch_libretro_image(
    system: &Value,
    base: &str,
    kind: &str,
    remote: &str,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    retry_missing: bool,
    refreshed_indexes: &Arc<Mutex<HashSet<String>>>,
) -> Result<Option<Vec<u8>>, String> {
    let category = system
        .get("libretro")
        .and_then(Value::as_str)
        .ok_or("Artwork system is missing its Libretro name")?;
    let dir = data_dir.join("media").join("_index");
    let file = dir.join(format!(
        "{}-{}.json",
        system.get("id").and_then(Value::as_str).unwrap_or("system"),
        kind
    ));
    let system_id = system.get("id").and_then(Value::as_str).unwrap_or("system");
    let refresh = refresh_index(
        retry_missing,
        refreshed_indexes,
        format!("{system_id}/{kind}"),
    );
    let mut cached_files = vec![file.clone()];
    if kind == "front" {
        cached_files.push(dir.join(format!("{system_id}.json")));
    }
    let cached_names = if refresh {
        None
    } else {
        cached_files.into_iter().find_map(|cached| {
            let fresh = cached
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age.as_secs() < 30 * 86400);
            if !fresh {
                return None;
            }
            fs::read_to_string(cached)
                .ok()
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        })
    };
    let names = match cached_names {
        Some(names) => names,
        None => {
            let mut url = Url::parse(&format!("{LIBRETRO}/")).map_err(|e| e.to_string())?;
            url.path_segments_mut()
                .map_err(|_| "Invalid artwork URL".to_owned())?
                .push(category)
                .push(remote);
            let text = request_text(url, cancelled).await?.unwrap_or_default();
            let regex = regex::Regex::new(r#"href="([^"?]*?\.png)""#).unwrap();
            let names: Vec<String> = regex
                .captures_iter(&text)
                .filter_map(|c| c.get(1).map(|m| m.as_str().to_owned()))
                .filter(|name| Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name))
                .collect();
            if !text.is_empty() && names.is_empty() {
                return Err(format!("Could not read the {remote} artwork list"));
            }
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            fs::write(
                &file,
                serde_json::to_vec(&names).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            names
        }
    };
    let mut names = names;
    names.sort_by_key(|name| artwork_region_rank(name));
    let wanted = loose_key(base);
    let name = names
        .into_iter()
        .find(|name| loose_key(name.trim_end_matches(".png")) == wanted);
    let Some(name) = name else {
        return Ok(None);
    };
    let mut url = Url::parse(&format!("{LIBRETRO}/")).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Invalid artwork URL".to_owned())?
        .push(category)
        .push(remote)
        .push(&name);
    request_image(url, cancelled).await
}

async fn fetch_switch_image(
    system: &Value,
    game: &Game,
    kind: &str,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    retry_missing: bool,
    refreshed_indexes: &Arc<Mutex<HashSet<String>>>,
) -> Result<Option<Vec<u8>>, String> {
    if !["front", "frontHQ", "disc", "back"].contains(&kind) {
        return Ok(None);
    }
    let file = data_dir.join("media/_index/gametdb-switch.txt");
    let refresh = refresh_index(
        retry_missing,
        refreshed_indexes,
        "gametdb-switch".to_owned(),
    );
    let cached_text = if refresh {
        None
    } else if file
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age.as_secs() < 7 * 86400)
    {
        fs::read_to_string(&file).ok()
    } else {
        None
    };
    let text = match cached_text {
        Some(text) => text,
        None => {
            let text = request_text(
                Url::parse(SWITCH_DATABASE).map_err(|e| e.to_string())?,
                cancelled,
            )
            .await?
            .ok_or("Could not read the GameTDB Switch title list")?;
            if !text.contains("TITLES =") {
                return Err("Could not read the GameTDB Switch title list".to_owned());
            }
            fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
            fs::write(&file, &text).map_err(|e| e.to_string())?;
            text
        }
    };
    let clean = |s: &str| {
        regex::Regex::new(r"\bv?\d+(?:\.\d+)+\b|\s*\([^)]*\)|\s*\[[^]]*\]")
            .unwrap()
            .replace_all(s, "")
            .to_string()
    };
    let keys = [
        loose_key(&clean(&game.title)),
        loose_key(&clean(&game.base)),
    ];
    let line_re = regex::Regex::new(r"(?m)^([A-Z0-9]{5}) = (.+)$").unwrap();
    let mut codes = Vec::new();
    for capture in line_re.captures_iter(&text) {
        let Some(title) = capture.get(2).map(|m| m.as_str()) else {
            continue;
        };
        let Some(code) = capture.get(1).map(|m| m.as_str()) else {
            continue;
        };
        if keys.contains(&loose_key(title)) && !codes.iter().any(|seen| seen == code) {
            codes.push(code.to_owned());
            if codes.len() == MAX_SWITCH_CODES {
                break;
            }
        }
    }
    let category = match kind {
        "frontHQ" => "coverHQ",
        "front" => "cover",
        "back" => "backHQ",
        _ => "label",
    };
    let extension = if kind == "disc" { "png" } else { "jpg" };
    for code in codes {
        for region in ["US", "EN", "JA"] {
            if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                return Err("Cancelled".to_owned());
            }
            let url = Url::parse(&format!(
                "{SWITCH_IMAGES}/{category}/{region}/{code}.{extension}"
            ))
            .map_err(|e| e.to_string())?;
            if let Some(bytes) = request_image(url, cancelled).await? {
                return Ok(Some(bytes));
            }
        }
    }
    let _ = system;
    Ok(None)
}

async fn request_text(
    url: Url,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<String>, String> {
    let Some(bytes) = request_bytes(url, cancelled).await? else {
        return Ok(None);
    };
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|e| e.to_string())
}

async fn request_image(
    url: Url,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    let Some(bytes) = request_bytes(url, cancelled).await? else {
        return Ok(None);
    };
    let image = image::load_from_memory(&bytes)
        .map_err(|_| "Artwork server did not return a valid image".to_owned())?;
    let (width, height) = image.dimensions();
    if width == 0
        || height == 0
        || width > 16384
        || height > 16384
        || u64::from(width) * u64::from(height) > MAX_ARTWORK_PIXELS
    {
        return Err("Invalid artwork dimensions".to_owned());
    }
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(Some(output.into_inner()))
}

async fn request_bytes(
    url: Url,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    let response = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(18))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "Artwork server returned HTTP {}",
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > 20 * 1024 * 1024)
    {
        return Err("Artwork image is too large".to_owned());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Artwork image is too large".to_owned());
    }
    Ok(Some(bytes.to_vec()))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PoliteSite {
    MarioWiki,
    Archive,
    LaunchBox,
    ScreenScraper,
}

fn polite_last(site: PoliteSite) -> &'static Mutex<Option<Instant>> {
    static MARIO_LAST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    static ARCHIVE_LAST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    static LAUNCHBOX_LAST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    static SCREENSCRAPER_LAST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    match site {
        PoliteSite::MarioWiki => MARIO_LAST.get_or_init(|| Mutex::new(None)),
        PoliteSite::Archive => ARCHIVE_LAST.get_or_init(|| Mutex::new(None)),
        PoliteSite::LaunchBox => LAUNCHBOX_LAST.get_or_init(|| Mutex::new(None)),
        PoliteSite::ScreenScraper => SCREENSCRAPER_LAST.get_or_init(|| Mutex::new(None)),
    }
}

async fn polite_gap(site: PoliteSite) {
    loop {
        let now = Instant::now();
        let wait = {
            let mut guard = polite_last(site).lock().unwrap();
            match *guard {
                Some(last) => {
                    let eligible = last + Duration::from_secs(1);
                    if now < eligible {
                        Some(eligible - now)
                    } else {
                        *guard = Some(now);
                        None
                    }
                }
                None => {
                    *guard = Some(now);
                    None
                }
            }
        };
        if let Some(d) = wait {
            tokio::time::sleep(d).await;
        } else {
            break;
        }
    }
}

async fn polite_bytes(
    url: Url,
    site: PoliteSite,
    site_name: &'static str,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    polite_gap(site).await;
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    let response = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if status == 404 || status == 410 {
        return Ok(None);
    }
    if status == 429 || status == 503 {
        return Err(format!(
            "{site_name} asked PyroCade to slow down (HTTP {status}); try again later"
        ));
    }
    if !response.status().is_success() {
        return Err(format!("{site_name} returned HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 25 * 1024 * 1024 {
        return Err(format!("{site_name} sent an unreadable reply"));
    }
    Ok(Some(bytes.to_vec()))
}

async fn polite_text(
    url: Url,
    site: PoliteSite,
    site_name: &'static str,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<String>, String> {
    let Some(bytes) = polite_bytes(url, site, site_name, cancelled).await? else {
        return Ok(None);
    };
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|e| e.to_string())
}

async fn polite_json(
    url: Url,
    site: PoliteSite,
    site_name: &'static str,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Value>, String> {
    let Some(bytes) = polite_bytes(url, site, site_name, cancelled).await? else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| format!("{site_name} sent an unreadable reply"))
}

fn web_cache_file(data_dir: &Path, name: &str) -> PathBuf {
    data_dir.join("media").join("_index").join(name)
}

fn web_cache_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn read_web_cache(file: &Path) -> serde_json::Map<String, Value> {
    let Ok(text) = fs::read_to_string(file) else {
        return serde_json::Map::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&text) else {
        return serde_json::Map::new();
    };
    parsed.as_object().cloned().unwrap_or_default()
}

fn web_cache_get(file: &Path, key: &str) -> Option<Value> {
    let _guard = web_cache_lock().lock().unwrap();
    let cache = read_web_cache(file);
    let entry = cache.get(key)?;
    let at = entry.get("at").and_then(Value::as_i64)?;
    let now = chrono::Utc::now().timestamp_millis();
    if now - at < 0 || (now - at) as u64 >= WEB_CACHE_AGE_SECS * 1000 {
        return None;
    }
    entry.get("value").cloned()
}

fn web_cache_set(file: &Path, key: &str, value: Value) {
    let _guard = web_cache_lock().lock().unwrap();
    let mut cache = read_web_cache(file);
    cache.insert(
        key.to_owned(),
        json!({"at": chrono::Utc::now().timestamp_millis(), "value": value}),
    );
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let tmp = file.with_extension("json.tmp");
    if let Ok(text) = serde_json::to_string(&cache) {
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, file);
        }
    }
}

fn untrusted_re() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"(?i)\([^)]*\b(?:demo|beta|proto|prototype|sample|kiosk|hack|modification|unl|unlicensed|pirate|aftermarket|homebrew)\b[^)]*\)|\[h\d*[^\]]*\]").unwrap())
}

fn trusted_release(base: &str) -> bool {
    !untrusted_re().is_match(base)
}

fn without_version(key: &str) -> String {
    regex::Regex::new(r"(?i)version")
        .unwrap()
        .replace_all(key, "")
        .into_owned()
}

fn region_of(text: &str) -> &'static str {
    let mut groups: Vec<String> = Vec::new();
    groups.extend(
        regex::Regex::new(r"\([^)]*\)")
            .unwrap()
            .find_iter(text)
            .map(|m| m.as_str().to_owned()),
    );
    groups.extend(
        regex::Regex::new(r"\[[^\]]*\]")
            .unwrap()
            .find_iter(text)
            .map(|m| m.as_str().to_owned()),
    );
    let s = groups.join(" ");
    if regex::Regex::new(r"(?i)\b(USA?|U|NTSC-U|Canada|North America)\b|-USA\b|\(UE?\)")
        .unwrap()
        .is_match(&s)
    {
        return "us";
    }
    if regex::Regex::new(r"(?i)\b(Europe|EUR?|E|PAL|UK|UKV|NOE|FRA|ESP|Spain|Germany|France|Italy|Australia|World)\b").unwrap().is_match(&s) {
        return "eu";
    }
    if regex::Regex::new(r"(?i)\b(Japan|JPN?|J)\b")
        .unwrap()
        .is_match(&s)
    {
        return "jp";
    }
    ""
}

fn franchise_matches(text: &str) -> bool {
    regex::Regex::new(r"(?i)\b(mario|luigi|yoshi|wario|waluigi|peach|bowser|toad|donkey kong|diddy kong|smash bros|game & watch|nes remix|wrecking crew|picross)").unwrap().is_match(text)
}

fn clean_title_like(name: &str) -> String {
    let value = regex::Regex::new(r"\s*[\(\[][^\)\]]*[\)\]]")
        .unwrap()
        .replace_all(name, "")
        .replace('_', " ");
    let value = regex::Regex::new(r"^\d{3,5}\s*-?\s+")
        .unwrap()
        .replace(&value, "");
    let value = regex::Regex::new(r"(?i)\s*\b(decrypted|encrypted)\b\s*$")
        .unwrap()
        .replace(&value, "");
    let cleaned = regex::Regex::new(r"\s+")
        .unwrap()
        .replace_all(&value, " ")
        .trim()
        .to_owned();
    if cleaned.is_empty() {
        name.to_owned()
    } else {
        cleaned
    }
}

fn fallback_key(value: &str) -> String {
    let cleaned = clean_title_like(value);
    let lower = cleaned.to_lowercase();
    let without = regex::Regex::new(r"&|\band\b|\bthe\b")
        .unwrap()
        .replace_all(&lower, "");
    without
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn artwork_title_keys(game: &Game) -> Vec<String> {
    let mut keys = Vec::new();
    for source in [&game.title, &game.base] {
        if source.is_empty() {
            continue;
        }
        let cleaned = regex::Regex::new(r"\bv?\d+(?:\.\d+)+\b|\s*\([^)]*\)|\s*\[[^\]]*\]")
            .unwrap()
            .replace_all(source, "")
            .into_owned();
        keys.push(fallback_key(&cleaned));
        let split = regex::Regex::new(r"([a-z])([A-Z])")
            .unwrap()
            .replace_all(&cleaned, "$1 $2")
            .into_owned();
        keys.push(fallback_key(&split));
    }
    keys.retain(|k| !k.is_empty());
    keys.dedup();
    keys
}

fn mariowiki_covers(sys_id: &str) -> bool {
    matches!(
        sys_id,
        "nes"
            | "snes"
            | "n64"
            | "gc"
            | "wii"
            | "wiiu"
            | "switch"
            | "switch2"
            | "gb"
            | "gbc"
            | "gba"
            | "nds"
            | "3ds"
    )
}

fn mariowiki_system_names(sys_id: &str) -> &'static [&'static str] {
    match sys_id {
        "nes" => &["Nintendo Entertainment System", "Family Computer"],
        "snes" => &["Super Nintendo Entertainment System", "Super Famicom"],
        "n64" => &["Nintendo 64"],
        "gc" => &["Nintendo GameCube"],
        "wii" => &["Wii"],
        "wiiu" => &["Wii U"],
        "switch" => &["Nintendo Switch"],
        "switch2" => &["Nintendo Switch 2"],
        "gb" => &["Game Boy"],
        "gbc" => &["Game Boy Color"],
        "gba" => &["Game Boy Advance"],
        "nds" => &["Nintendo DS"],
        "3ds" => &["Nintendo 3DS"],
        _ => &[],
    }
}

fn wiki_page_names(title: &str) -> Vec<String> {
    let stripped = regex::Regex::new(r"\s*\([^)]*\)|\s*\[[^\]]*\]|\s*\{[^}]*\}")
        .unwrap()
        .replace_all(title, "")
        .into_owned();
    let stripped = regex::Regex::new(r"\bv?\d+(?:\.\d+)+\b")
        .unwrap()
        .replace_all(&stripped, "")
        .into_owned();
    let stripped = stripped.replace('_', " ");
    let t = regex::Regex::new(r"\s+")
        .unwrap()
        .replace_all(&stripped, " ")
        .trim()
        .to_owned();
    if t.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    for v in [
        t.clone(),
        t.replacen(" - ", ": ", 1),
        t.replace(" - ", ": "),
    ] {
        if !out.contains(&v) {
            out.push(v);
        }
    }
    out.truncate(3);
    out
}

fn encode_uri_component(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric()
            || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')')
        {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn wiki_image_url(file: &str, host: &str) -> String {
    let mut name = file.trim().replace(' ', "_");
    if let Some(first) = name.chars().next() {
        name = first.to_uppercase().collect::<String>() + &name[first.len_utf8()..];
    }
    let hex = format!("{:x}", md5::compute(name.as_bytes()));
    format!(
        "{host}/images/{}/{}/{}",
        &hex[0..1],
        &hex[0..2],
        encode_uri_component(&name)
    )
}

fn wiki_page_url(name: &str) -> String {
    let underscored = name.replace(' ', "_");
    let encoded = encode_uri_component(&underscored).replace("%2F", "/");
    format!("{MARIOWIKI}/{encoded}?action=raw")
}

fn infobox_images(text: &str) -> Option<Vec<String>> {
    if !regex::Regex::new(r"(?i)\{\{\s*game infobox")
        .unwrap()
        .is_match(text)
    {
        return None;
    }
    let line = regex::Regex::new(r"(?im)^\|\s*image\s*=(.*)$")
        .unwrap()
        .captures(text)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_owned()))
        .unwrap_or_default();
    let images: Vec<String> = regex::Regex::new(r"(?i)\[\[\s*File\s*:\s*([^\|\]]+)")
        .unwrap()
        .captures_iter(&line)
        .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_owned()))
        .take(3)
        .collect();
    Some(images)
}

fn is_front_cover(file: &str, text: &str, sys_id: &str) -> bool {
    let bare = file
        .rsplit('.')
        .nth(1)
        .unwrap_or(file)
        .replace(['_', '-'], " ");
    if regex::Regex::new(r"(?i)\b(back|rear|spine|side|cart|cartridge|disc|label|manual|logo|screenshot|sticker|card|insert)\b")
        .unwrap()
        .is_match(&bare)
    {
        return false;
    }
    if regex::Regex::new(r"(?i)\bback (cover|box|of the box)\b")
        .unwrap()
        .is_match(text)
    {
        return false;
    }
    let categories: Vec<String> =
        regex::Regex::new(r"(?i)\[\[\s*Category\s*:\s*([^\]\|]+?)\s*game covers\s*[\]\|]")
            .unwrap()
            .captures_iter(text)
            .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_lowercase()))
            .collect();
    mariowiki_system_names(sys_id)
        .iter()
        .any(|name| categories.iter().any(|c| c == &name.to_lowercase()))
}

async fn wiki_page(
    name: &str,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<String>, String> {
    let url = Url::parse(&wiki_page_url(name)).map_err(|e| e.to_string())?;
    let mut text = polite_text(url, PoliteSite::MarioWiki, "Super Mario Wiki", cancelled).await?;
    if let Some(t) = text.clone() {
        let target = regex::Regex::new(r"(?i)^\s*#REDIRECT\s*\[\[([^\]\|#]+)")
            .unwrap()
            .captures(&t)
            .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_owned()));
        if let Some(target) = target {
            let url = Url::parse(&wiki_page_url(&target)).map_err(|e| e.to_string())?;
            text = polite_text(url, PoliteSite::MarioWiki, "Super Mario Wiki", cancelled).await?;
        }
    }
    Ok(text)
}

async fn fetch_mariowiki_image(
    game: &Game,
    sys_id: &str,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
) -> Result<Option<Vec<u8>>, String> {
    if !mariowiki_covers(sys_id) {
        return Ok(None);
    }
    if !trusted_release(&game.base) {
        return Ok(None);
    }
    let probe = if !game.title.is_empty() {
        &game.title
    } else {
        &game.base
    };
    if !franchise_matches(probe) && !franchise_matches(&game.base) {
        return Ok(None);
    }
    let names = wiki_page_names(if !game.title.is_empty() {
        &game.title
    } else {
        &game.base
    });
    let key = format!(
        "v1/{sys_id}/{}",
        names.first().map(String::as_str).unwrap_or("")
    );
    let file = web_cache_file(data_dir, "mariowiki.json");
    let mut urls: Option<Vec<String>> = None;
    if !refresh {
        if let Some(cached) = web_cache_get(&file, &key) {
            if let Some(arr) = cached.as_array() {
                let list: Vec<String> = arr
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
                urls = Some(list);
            }
        }
    }
    if urls.is_none() {
        let mut found: Vec<String> = Vec::new();
        let mut done = false;
        for name in &names {
            if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                return Err("Cancelled".to_owned());
            }
            let text = wiki_page(name, cancelled).await?;
            let Some(text) = text else { continue };
            let Some(files) = infobox_images(&text) else {
                continue;
            };
            for candidate in files {
                let file_page = format!("File:{candidate}");
                let file_text = wiki_page(&file_page, cancelled).await?;
                if let Some(file_text) = file_text {
                    if is_front_cover(&candidate, &file_text, sys_id) {
                        found = vec![wiki_image_url(&candidate, MARIOWIKI_IMAGES)];
                        break;
                    }
                }
                if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    return Err("Cancelled".to_owned());
                }
            }
            // The game's own page exists: no cover for this system means stop.
            done = true;
            break;
        }
        let _ = done;
        web_cache_set(&file, &key, json!(found));
        urls = Some(found);
    }
    for url in urls.unwrap_or_default() {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        match request_image(parsed, cancelled).await {
            Ok(Some(bytes)) => return Ok(Some(bytes)),
            Ok(None) => continue,
            Err(error) => {
                if error == "Cancelled" || cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    return Err(error);
                }
                continue;
            }
        }
    }
    Ok(None)
}

fn archive_covers(sys_id: &str) -> bool {
    archive_system_names(sys_id).is_some()
}

fn archive_system_names(sys_id: &str) -> Option<&'static [&'static str]> {
    match sys_id {
        "nds" => Some(&["nintendo ds", "nds"]),
        "3ds" => Some(&["nintendo 3ds", "3ds"]),
        "gba" => Some(&["game boy advance", "gameboy advance", "gba"]),
        "gbc" => Some(&["game boy color", "gameboy color", "gbc"]),
        "gb" => Some(&["game boy", "gameboy", "gb"]),
        "snes" => Some(&[
            "snes",
            "super nintendo",
            "super nintendo entertainment system",
            "super famicom",
            "sfc",
        ]),
        "nes" => Some(&[
            "nes",
            "nintendo entertainment system",
            "famicom",
            "nintendo famicom",
        ]),
        "n64" => Some(&["n64", "nintendo 64"]),
        "gc" => Some(&["gamecube", "nintendo gamecube", "gcn"]),
        "wii" => Some(&["wii", "nintendo wii"]),
        "wiiu" => Some(&["wii u", "nintendo wii u"]),
        "switch" => Some(&["nintendo switch", "switch"]),
        "ps1" => Some(&[
            "ps1",
            "psx",
            "playstation",
            "sony playstation",
            "playstation 1",
        ]),
        "ps2" => Some(&["ps2", "playstation 2", "sony playstation 2"]),
        "ps3" => Some(&["ps3", "playstation 3", "sony playstation 3"]),
        "psp" => Some(&["psp", "playstation portable", "sony psp"]),
        "dreamcast" => Some(&["dreamcast", "sega dreamcast"]),
        "genesis" => Some(&["genesis", "mega drive", "sega genesis", "sega mega drive"]),
        "xbox" => Some(&["xbox", "microsoft xbox"]),
        "x360" => Some(&["xbox 360", "microsoft xbox 360"]),
        "a2600" => Some(&["atari 2600", "atari vcs"]),
        _ => None,
    }
}

fn archive_serial(sys_id: &str) -> Option<&'static str> {
    match sys_id {
        "nds" => Some(r"\b(?:NTR|TWL)-[A-Z0-9]{3,4}\b"),
        "3ds" => Some(r"\bCTR-[A-Z0-9]{3,4}\b"),
        "gba" => Some(r"\bAGB-[A-Z0-9]{3,4}\b"),
        "gbc" => Some(r"\bCGB-[A-Z0-9]{3,4}\b"),
        "gb" => Some(r"\bDMG-[A-Z0-9]{2,4}\b"),
        "snes" => Some(r"\b(?:SNS|SHVC)-[A-Z0-9]{2,4}\b"),
        "nes" => Some(r"\bNES-[A-Z0-9]{2,4}\b"),
        "n64" => Some(r"\bNUS-[A-Z0-9]{3,4}\b"),
        "gc" => Some(r"\bDOL-[A-Z0-9]{3,4}\b"),
        "wii" => Some(r"\bRVL-[A-Z0-9]{3,4}\b"),
        "wiiu" => Some(r"\bWUP-[A-Z0-9]{3,4}\b"),
        "switch" => Some(r"\bHAC-[A-Z0-9]{4,5}\b"),
        "psp" => Some(r"\bU[LC][UEJAK][SM][- ]?\d{5}\b"),
        _ => None,
    }
}

fn archive_over(sys_id: &str) -> &'static [&'static str] {
    match sys_id {
        "3ds" => &["nds"],
        "gba" => &["gb", "gbc"],
        "gbc" => &["gb"],
        "snes" => &["nes"],
        "wiiu" => &["wii"],
        "ps2" => &["ps1"],
        "ps3" => &["ps1"],
        "psp" => &["ps1"],
        "x360" => &["xbox"],
        _ => &[],
    }
}

const LAUNCHBOX_PLATFORMS: &[(&str, &str)] = &[
    ("ps1", "Sony Playstation"),
    ("ps2", "Sony Playstation 2"),
    ("ps3", "Sony Playstation 3"),
    ("ps4", "Sony Playstation 4"),
    ("psp", "Sony PSP"),
    ("switch", "Nintendo Switch"),
    ("switch2", "Nintendo Switch 2"),
    ("wiiu", "Nintendo Wii U"),
    ("wii", "Nintendo Wii"),
    ("gc", "Nintendo GameCube"),
    ("n64", "Nintendo 64"),
    ("snes", "Super Nintendo Entertainment System"),
    ("nes", "Nintendo Entertainment System"),
    ("3ds", "Nintendo 3DS"),
    ("nds", "Nintendo DS"),
    ("gba", "Nintendo Game Boy Advance"),
    ("gbc", "Nintendo Game Boy Color"),
    ("gb", "Nintendo Game Boy"),
    ("dreamcast", "Sega Dreamcast"),
    ("genesis", "Sega Genesis"),
    ("xbox", "Microsoft Xbox"),
    ("x360", "Microsoft Xbox 360"),
    ("a2600", "Atari 2600"),
    ("arcade", "Arcade"),
    ("pc", "Windows"),
];

const SCREENSCRAPER_SYSTEMS: &[(&str, u32)] = &[
    ("genesis", 1),
    ("nes", 3),
    ("snes", 4),
    ("gb", 9),
    ("gbc", 10),
    ("gba", 12),
    ("gc", 13),
    ("n64", 14),
    ("nds", 15),
    ("wii", 16),
    ("3ds", 17),
    ("wiiu", 18),
    ("dreamcast", 23),
    ("a2600", 26),
    ("xbox", 32),
    ("x360", 33),
    ("ps1", 57),
    ("ps2", 58),
    ("ps3", 59),
    ("psp", 61),
    ("arcade", 75),
    ("switch", 225),
];

const SCREENSCRAPER_REGIONS: &[&str] = &["us", "wor", "ss", "eu", "uk", "fr", "de", "jp"];

fn launchbox_platform(sys_id: &str) -> Option<&'static str> {
    LAUNCHBOX_PLATFORMS
        .iter()
        .find(|(id, _)| *id == sys_id)
        .map(|(_, name)| *name)
}

fn launchbox_covers(sys_id: &str) -> bool {
    launchbox_platform(sys_id).is_some()
}

fn screenscraper_system(sys_id: &str) -> Option<u32> {
    SCREENSCRAPER_SYSTEMS
        .iter()
        .find(|(id, _)| *id == sys_id)
        .map(|(_, system)| *system)
}

struct ScreenScraperCredentials {
    user: String,
    dev_id: String,
    password: String,
    dev_password: String,
}

fn screenscraper_credentials(config: &Value) -> Option<ScreenScraperCredentials> {
    let section = config.get("screenscraper")?;
    let field = |key: &str| {
        section
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_owned()
    };
    let credentials = ScreenScraperCredentials {
        user: field("user"),
        dev_id: field("devId"),
        password: field("password"),
        dev_password: field("devPassword"),
    };
    if credentials.user.is_empty()
        || credentials.dev_id.is_empty()
        || credentials.password.is_empty()
        || credentials.dev_password.is_empty()
    {
        None
    } else {
        Some(credentials)
    }
}

fn screenscraper_configured(config: &Value) -> bool {
    screenscraper_credentials(config).is_some()
}

fn screenscraper_covers(sys_id: &str, config: &Value) -> bool {
    screenscraper_system(sys_id).is_some() && screenscraper_configured(config)
}

fn screenscraper_region_rank(region: &str) -> u32 {
    SCREENSCRAPER_REGIONS
        .iter()
        .position(|known| *known == region)
        .unwrap_or(SCREENSCRAPER_REGIONS.len()) as u32
}

fn screenscraper_media_url(url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    parsed.scheme() == "https"
        && parsed
            .host_str()
            .is_some_and(|host| host == "screenscraper.fr" || host.ends_with(".screenscraper.fr"))
}

fn front_shapes(sys_id: &str) -> &'static [f64] {
    match sys_id {
        "nds" | "3ds" => &[0.89],
        "gba" | "gbc" | "gb" => &[1.0],
        "snes" | "n64" => &[1.38, 0.72],
        "nes" => &[0.73, 1.4],
        "gc" | "wii" | "wiiu" => &[0.72],
        "switch" => &[0.62],
        "ps1" | "dreamcast" => &[1.0],
        "ps2" | "genesis" | "xbox" | "x360" => &[0.71],
        "ps3" => &[0.86],
        "psp" => &[0.58],
        "a2600" => &[0.74],
        _ => &[],
    }
}

fn fits_front(sys_id: &str, width: u32, height: u32) -> bool {
    if width == 0 || height == 0 {
        return false;
    }
    let ratio = width as f64 / height as f64;
    front_shapes(sys_id)
        .iter()
        .any(|shape| (ratio / shape - 1.0).abs() <= 0.08)
}

fn archive_tokens(value: &str) -> String {
    value.to_lowercase().replace('_', " ").trim().to_owned()
}

fn systems_of(title: &str, subjects: &[String]) -> Vec<String> {
    let mut words: HashSet<String> = HashSet::new();
    for s in subjects {
        words.insert(archive_tokens(s));
    }
    for g in regex::Regex::new(r"\(([^)]+)\)")
        .unwrap()
        .captures_iter(title)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_owned()))
    {
        words.insert(archive_tokens(&g));
    }
    for part in regex::Regex::new(r"\s+[-–—]\s+").unwrap().split(title) {
        words.insert(archive_tokens(part));
    }
    let mut found: Vec<String> = Vec::new();
    for sys in [
        "nds",
        "3ds",
        "gba",
        "gbc",
        "gb",
        "snes",
        "nes",
        "n64",
        "gc",
        "wii",
        "wiiu",
        "switch",
        "ps1",
        "ps2",
        "ps3",
        "psp",
        "dreamcast",
        "genesis",
        "xbox",
        "x360",
        "a2600",
    ] {
        let names = archive_system_names(sys).unwrap_or(&[]);
        let serial_hit =
            archive_serial(sys).is_some_and(|p| regex::Regex::new(p).unwrap().is_match(title));
        if names.iter().any(|n| words.contains(*n)) || serial_hit {
            found.push(sys.to_owned());
        }
    }
    let serial: Vec<String> = found
        .iter()
        .filter(|id| {
            archive_serial(id).is_some_and(|p| regex::Regex::new(p).unwrap().is_match(title))
        })
        .cloned()
        .collect();
    if serial.len() == 1 {
        return serial;
    }
    let mut set: HashSet<String> = found.into_iter().collect();
    for id in set.clone() {
        for lower in archive_over(&id) {
            set.remove(*lower);
        }
    }
    set.into_iter().collect()
}

fn item_name(title: &str) -> String {
    let split = regex::Regex::new(r"\s+(?:[\[\(]|(?:PAL|NTSC(?:-[UJ])?)\b|[A-Z]{2,4}-[A-Z0-9]{2,5}(?:-[A-Z0-9]{1,3})*\b|\d{3,4} ?[dD][pP][iI]\b|\d{2}-[bB][iI][tT]\b)")
        .unwrap()
        .split(title)
        .next()
        .unwrap_or(title)
        .to_owned();
    let parts: Vec<&str> = regex::Regex::new(r"\s+[-–—]\s+")
        .unwrap()
        .split(&split)
        .collect();
    let all_names: Vec<&str> = [
        "nds",
        "3ds",
        "gba",
        "gbc",
        "gb",
        "snes",
        "nes",
        "n64",
        "gc",
        "wii",
        "wiiu",
        "switch",
        "ps1",
        "ps2",
        "ps3",
        "psp",
        "dreamcast",
        "genesis",
        "xbox",
        "x360",
        "a2600",
    ]
    .into_iter()
    .flat_map(|id| archive_system_names(id).unwrap_or(&[]).iter().copied())
    .collect();
    let stop = parts.iter().position(|p| {
        let toks = archive_tokens(p);
        all_names.contains(&toks.as_str())
            || regex::Regex::new(r"(?i)^(box|cover|complete|scans?|full cover|europe|usa|japan)\b")
                .unwrap()
                .is_match(p)
    });
    let mut name = if let Some(idx) = stop {
        if idx > 0 {
            parts[..idx].join(" - ")
        } else {
            split.clone()
        }
    } else {
        split
    };
    name = regex::Regex::new(r"(?i)^scans?\s+-\s+")
        .unwrap()
        .replace(&name, "")
        .into_owned();
    name = regex::Regex::new(
        r"(?i)\s+(?:box scans?|box art|boxart|box|hi ?res|scans?|covers?|full cover)\b.*$",
    )
    .unwrap()
    .replace(&name, "")
    .trim()
    .to_owned();
    let mut sorted = all_names.clone();
    sorted.sort_by_key(|n| std::cmp::Reverse(n.len()));
    for n in sorted {
        let suffix = format!(" {n}");
        if name.to_lowercase().ends_with(&suffix) {
            name = name[..name.len() - suffix.len()].trim().to_owned();
            break;
        }
    }
    name.trim().to_owned()
}

#[derive(Clone, Debug)]
struct ArchiveItem {
    id: String,
    key: String,
    system: String,
    region: &'static str,
}

fn index_item(doc: &Value) -> Option<ArchiveItem> {
    let id = doc
        .get("identifier")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let title = doc
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if !regex::Regex::new(r"^[\w.-]+$").unwrap().is_match(&id)
        || title.is_empty()
        || regex::Regex::new(r"(?i)\b(display|promo\w*|demo|demonstration|custom|fan ?made|fan ?art|mock-?up|reproduction|repro|not for resale|nfr|sample|kiosk|beta|prototype)\b").unwrap().is_match(&title)
        || (regex::Regex::new(r"(?i)\b(manual|map|poster|inserts?|cart|cartridge|disc|label|card|registration card|guide ?book|strategy guide|catalog(?:ue)?|flyer|ad|advert\w*|offer|sweepstakes|coupon)\b").unwrap().is_match(&title)
            && !regex::Regex::new(r"(?i)\b(box|boxes|cover|covers|complete)\b").unwrap().is_match(&title))
    {
        return None;
    }
    let subjects: Vec<String> = doc
        .get("subject")
        .map(|s| {
            if let Some(arr) = s.as_array() {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            } else if let Some(single) = s.as_str() {
                vec![single.to_owned()]
            } else {
                Vec::new()
            }
        })
        .unwrap_or_default();
    if subjects.iter().any(|s| regex::Regex::new(r"(?i)\b(display|promo\w*|demo|demonstration|custom|fan ?made|fan ?art|mock-?up|reproduction|repro|not for resale|nfr|sample|kiosk|beta|prototype)\b").unwrap().is_match(s)) {
        return None;
    }
    if subjects.iter().any(|s| regex::Regex::new(r"(?i)\b(manual|map|poster|inserts?|cart|cartridge|disc|label|card|registration card|guide ?book|strategy guide|catalog(?:ue)?|flyer|ad|advert\w*|offer|sweepstakes|coupon)\b").unwrap().is_match(s))
        && !regex::Regex::new(r"(?i)\b(box|boxes|cover|covers|complete)\b").unwrap().is_match(&title)
        && !subjects.iter().any(|s| regex::Regex::new(r"(?i)\b(box|boxes|cover|covers|complete)\b").unwrap().is_match(s))
    {
        return None;
    }
    let systems = systems_of(&title, &subjects);
    if systems.len() != 1 {
        return None;
    }
    let key = fallback_key(&item_name(&title));
    if key.len() < 3
        || regex::Regex::new(r"^(?:\d+(?:games?)?in1|(?:\d+)?(?:game)?pack|doublepack|combo(?:pack)?|collection|compilation)$").unwrap().is_match(&key)
    {
        return None;
    }
    Some(ArchiveItem {
        id,
        key,
        system: systems.into_iter().next().unwrap_or_default(),
        region: region_of(&title),
    })
}

fn front_files(files: &[Value]) -> Vec<String> {
    let mut out: Vec<(bool, String)> = files
        .iter()
        .filter_map(|f| {
            let name = f.get("name").and_then(Value::as_str)?;
            let format = f.get("format").and_then(Value::as_str).unwrap_or("");
            let size: u64 = f
                .get("size")
                .and_then(|s| {
                    if let Some(n) = s.as_u64() {
                        Some(n)
                    } else if let Some(s) = s.as_str() {
                        s.parse().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(u64::MAX);
            if !regex::Regex::new(r"(?i)^(JPEG|PNG)$").unwrap().is_match(format) || size > ARCHIVE_MAX_FILE_BYTES {
                return None;
            }
            let base_raw = name.rsplit('/').next().unwrap_or(name);
            let base_no_ext = base_raw.rsplit('.').last().unwrap_or(base_raw);
            // Strip only the final extension (name may contain dots).
            let base_no_ext = if let Some(dot) = base_raw.rfind('.') {
                &base_raw[..dot]
            } else {
                base_no_ext
            };
            let camel = regex::Regex::new(r"([a-z])([A-Z])")
                .unwrap()
                .replace_all(base_no_ext, "$1 $2")
                .into_owned();
            let base = camel
                .to_lowercase()
                .replace(['_', '.', '-'], " ");
            if !regex::Regex::new(r"\bfront\b").unwrap().is_match(&base) {
                return None;
            }
            if regex::Regex::new(r"\b(back|rear|reverse|spine|side|cart|cartridge|disc|disk|cd|dvd|umd|media|label|manual|insert|inlay|inside|inner|survey|poster|card|sleeve|obi|tray|case|shell|sticker|thumb|thumbnail|preview|ad|advert|outer|slip ?cover)\b").unwrap().is_match(&base) {
                return None;
            }
            Some((!regex::Regex::new(r"(?i)^jpe?g$").unwrap().is_match(format), name.to_owned()))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out.into_iter().map(|(_, n)| n).collect()
}

fn archive_index_file(data_dir: &Path) -> PathBuf {
    web_cache_file(data_dir, "archive-boxart.json")
}

fn group_archive_items(
    items: &[ArchiveItem],
) -> HashMap<String, HashMap<String, Vec<ArchiveItem>>> {
    let mut by_system: HashMap<String, HashMap<String, Vec<ArchiveItem>>> = HashMap::new();
    for item in items {
        let keys = [item.key.clone(), without_version(&item.key)];
        let map = by_system.entry(item.system.clone()).or_default();
        for k in keys {
            if k.is_empty() {
                continue;
            }
            map.entry(k).or_default().push(item.clone());
        }
    }
    by_system
}

async fn build_archive_index(
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Vec<ArchiveItem>, String> {
    let mut docs: Vec<Value> = Vec::new();
    for page in 1..=5 {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        let mut url =
            Url::parse(&format!("{ARCHIVE_API}/advancedsearch.php")).map_err(|e| e.to_string())?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("q", &format!("collection:{ARCHIVE_COLLECTION}"));
            q.append_pair("rows", "10000");
            q.append_pair("page", &page.to_string());
            q.append_pair("output", "json");
            q.append_pair("fl[]", "identifier");
            q.append_pair("fl[]", "title");
            q.append_pair("fl[]", "subject");
        }
        let data = polite_json(url, PoliteSite::Archive, "The Internet Archive", cancelled)
            .await?
            .ok_or("Could not read the Internet Archive box art list")?;
        let response = data
            .get("response")
            .and_then(Value::as_object)
            .ok_or("Could not read the Internet Archive box art list")?;
        let found = response
            .get("docs")
            .and_then(Value::as_array)
            .ok_or("Could not read the Internet Archive box art list")?;
        docs.extend(found.iter().cloned());
        if found.is_empty() {
            break;
        }
        if let Some(total) = response.get("numFound").and_then(Value::as_u64) {
            if (docs.len() as u64) >= total {
                break;
            }
        }
    }
    let items: Vec<ArchiveItem> = docs.iter().filter_map(index_item).collect();
    if items.is_empty() {
        return Err("The Internet Archive box art list was empty".to_owned());
    }
    let file = archive_index_file(data_dir);
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let built = json!({
        "version": ARCHIVE_INDEX_VERSION,
        "built": chrono::Utc::now().timestamp_millis(),
        "items": items.iter().map(|i| json!({
            "id": i.id, "key": i.key, "system": i.system, "region": i.region
        })).collect::<Vec<_>>()
    });
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(&built).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
    Ok(items)
}

async fn load_archive_index(
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
) -> Result<HashMap<String, HashMap<String, Vec<ArchiveItem>>>, String> {
    let file = archive_index_file(data_dir);
    let now_ms = chrono::Utc::now().timestamp_millis() as u64;
    let age_ms: u64 = file
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX);
    let mut want_refresh = refresh;
    if want_refresh && age_ms < 86400 * 1000 {
        want_refresh = false;
    }
    if !want_refresh && age_ms < WEB_CACHE_AGE_SECS * 1000 {
        if let Ok(text) = fs::read_to_string(&file) {
            if let Ok(cached) = serde_json::from_str::<Value>(&text) {
                if cached.get("version").and_then(Value::as_u64) == Some(ARCHIVE_INDEX_VERSION) {
                    if let Some(items) = cached.get("items").and_then(Value::as_array) {
                        let parsed: Vec<ArchiveItem> = items
                            .iter()
                            .filter_map(|v| {
                                Some(ArchiveItem {
                                    id: v.get("id").and_then(Value::as_str)?.to_owned(),
                                    key: v.get("key").and_then(Value::as_str)?.to_owned(),
                                    system: v.get("system").and_then(Value::as_str)?.to_owned(),
                                    region: match v.get("region").and_then(Value::as_str) {
                                        Some("us") => "us",
                                        Some("eu") => "eu",
                                        Some("jp") => "jp",
                                        _ => "",
                                    },
                                })
                            })
                            .collect();
                        if !parsed.is_empty() {
                            if now_ms >= (cached.get("built").and_then(Value::as_u64).unwrap_or(0))
                            {
                                return Ok(group_archive_items(&parsed));
                            }
                        }
                    }
                }
            }
        }
    }
    let items = build_archive_index(data_dir, cancelled).await?;
    Ok(group_archive_items(&items))
}

async fn archive_scan_size(
    id: &str,
    name: &str,
    files_file: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<(u32, u32)>, String> {
    let key = format!("size:{id}/{name}");
    if let Some(cached) = web_cache_get(files_file, &key) {
        if cached.is_null() {
            return Ok(None);
        }
        if let Some(arr) = cached.as_array() {
            if arr.len() == 2 {
                let w = arr[0].as_u64().unwrap_or(0) as u32;
                let h = arr[1].as_u64().unwrap_or(0) as u32;
                if w > 0 && h > 0 {
                    return Ok(Some((w, h)));
                }
            }
        }
        return Ok(None);
    }
    let target = format!("{id}/{name}");
    let url = Url::parse(&format!(
        "{ARCHIVE_IIIF}/{}/info.json",
        encode_uri_component(&target)
    ))
    .map_err(|e| e.to_string())?;
    let info = polite_json(url, PoliteSite::Archive, "The Internet Archive", cancelled).await?;
    let size = info.as_ref().and_then(|v| {
        let w = v.get("width").and_then(Value::as_u64)?;
        let h = v.get("height").and_then(Value::as_u64)?;
        if w > 0 && h > 0 {
            Some((w as u32, h as u32))
        } else {
            None
        }
    });
    web_cache_set(
        files_file,
        &key,
        size.map(|(w, h)| json!([w, h])).unwrap_or(Value::Null),
    );
    Ok(size)
}

async fn archive_item_files(
    id: &str,
    files_file: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Vec<String>, String> {
    if let Some(cached) = web_cache_get(files_file, id) {
        if let Some(arr) = cached.as_array() {
            return Ok(arr
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect());
        }
    }
    let url = Url::parse(&format!(
        "{ARCHIVE_API}/metadata/{}/files",
        encode_uri_component(id)
    ))
    .map_err(|e| e.to_string())?;
    let data = polite_json(url, PoliteSite::Archive, "The Internet Archive", cancelled).await?;
    let names = data
        .as_ref()
        .and_then(|v| v.get("result"))
        .and_then(Value::as_array)
        .map(|arr| front_files(arr))
        .unwrap_or_default();
    web_cache_set(files_file, id, json!(names));
    Ok(names)
}

async fn fetch_internet_archive_image(
    game: &Game,
    sys_id: &str,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
) -> Result<Option<Vec<u8>>, String> {
    if !archive_covers(sys_id) {
        return Ok(None);
    }
    if !trusted_release(&game.base) {
        return Ok(None);
    }
    let by_system = load_archive_index(data_dir, cancelled, refresh).await?;
    let Some(by_key) = by_system.get(sys_id) else {
        return Ok(None);
    };
    let own = region_of(&game.base);
    let rank = |r: &str| -> i32 {
        if !r.is_empty() && r == own {
            0
        } else {
            match r {
                "us" => 1,
                "eu" => 2,
                "jp" => 3,
                _ => 4,
            }
        }
    };
    let mut seen: HashMap<String, ArchiveItem> = HashMap::new();
    for key in artwork_title_keys(game) {
        for expanded in [key.clone(), without_version(&key)] {
            if let Some(list) = by_key.get(&expanded) {
                for item in list {
                    seen.entry(item.id.clone()).or_insert_with(|| item.clone());
                }
            }
        }
    }
    let mut items: Vec<ArchiveItem> = seen.into_values().collect();
    items.sort_by_key(|i| rank(i.region));
    items.truncate(3);
    let files_file = web_cache_file(data_dir, "archive-items.json");
    let mut urls: Vec<String> = Vec::new();
    for item in items {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        for name in archive_item_files(&item.id, &files_file, cancelled)
            .await?
            .into_iter()
            .take(2)
        {
            let Some(size) = archive_scan_size(&item.id, &name, &files_file, cancelled).await?
            else {
                continue;
            };
            if !fits_front(sys_id, size.0, size.1) {
                continue;
            }
            let target = format!("{}/{}", item.id, name);
            urls.push(format!(
                "{ARCHIVE_IIIF}/{}/full/!1600,1600/0/default.jpg",
                encode_uri_component(&target)
            ));
        }
    }
    urls.truncate(4);
    for url in urls {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        match request_image(parsed, cancelled).await {
            Ok(Some(bytes)) => return Ok(Some(bytes)),
            Ok(None) => continue,
            Err(error) => {
                if error == "Cancelled" || cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    return Err(error);
                }
                continue;
            }
        }
    }
    Ok(None)
}

fn launchbox_front_rank(image_type: &str, region: &str) -> Option<u32> {
    let type_rank = match image_type {
        "Box - Front" => 0,
        "Box - Front - Reconstructed" => 1,
        _ => return None,
    };
    let region_rank = if region.is_empty() {
        1
    } else if regex::Regex::new(r"North America|United States|World|Canada")
        .unwrap()
        .is_match(region)
    {
        0
    } else if regex::Regex::new(r"Europe|United Kingdom|Australia|Oceania")
        .unwrap()
        .is_match(region)
    {
        2
    } else {
        3
    };
    Some(type_rank * 10 + region_rank)
}

fn launchbox_file_ok(name: &str) -> bool {
    regex::Regex::new(r"(?i)^[\w.-]+\.(png|jpe?g)$")
        .unwrap()
        .is_match(name)
}

fn parse_launchbox_metadata<R: Read>(
    source: R,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<
    (
        HashMap<String, HashMap<String, Vec<String>>>,
        HashMap<String, HashMap<String, Vec<String>>>,
    ),
    String,
> {
    let wanted: HashSet<String> = LAUNCHBOX_PLATFORMS
        .iter()
        .map(|(_, platform)| (*platform).to_owned())
        .collect();
    let mut platform_of: HashMap<String, String> = HashMap::new();
    let mut names: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    let mut ranked: HashMap<String, HashMap<String, Vec<(u32, String)>>> = HashMap::new();
    let mut reader = quick_xml::Reader::from_reader(BufReader::new(source));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut record = false;
    let mut fields: HashMap<String, String> = HashMap::new();
    let mut field: Option<String> = None;
    let mut text = String::new();
    let mut events: u64 = 0;
    loop {
        buffer.clear();
        events += 1;
        if events % 4096 == 0 && cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(event)) => {
                let tag = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                match tag.as_str() {
                    "Game" | "GameAlternateName" | "GameImage" => {
                        record = true;
                        fields.clear();
                        field = None;
                    }
                    _ => {
                        if record {
                            field = Some(tag);
                            text.clear();
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::Text(event)) => {
                if field.is_some() {
                    let decoded = event.unescape().map(|s| s.into_owned()).unwrap_or_default();
                    text.push_str(&decoded);
                }
            }
            Ok(quick_xml::events::Event::End(event)) => {
                let tag = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                match tag.as_str() {
                    "Game" | "GameAlternateName" | "GameImage" => {
                        let id = fields.get("DatabaseID").cloned().unwrap_or_default();
                        if !id.is_empty() {
                            match tag.as_str() {
                                "Game" => {
                                    let platform =
                                        fields.get("Platform").cloned().unwrap_or_default();
                                    if wanted.contains(&platform) {
                                        platform_of.insert(id.clone(), platform.clone());
                                        let key = fallback_key(
                                            fields.get("Name").map(String::as_str).unwrap_or(""),
                                        );
                                        if !key.is_empty() {
                                            let list = names
                                                .entry(platform)
                                                .or_default()
                                                .entry(key)
                                                .or_default();
                                            if !list.contains(&id) {
                                                list.push(id);
                                            }
                                        }
                                    }
                                }
                                "GameAlternateName" => {
                                    if let Some(platform) = platform_of.get(&id).cloned() {
                                        let key = fallback_key(
                                            fields
                                                .get("AlternateName")
                                                .map(String::as_str)
                                                .unwrap_or(""),
                                        );
                                        if !key.is_empty() {
                                            let list = names
                                                .entry(platform)
                                                .or_default()
                                                .entry(key)
                                                .or_default();
                                            if !list.contains(&id) {
                                                list.push(id);
                                            }
                                        }
                                    }
                                }
                                _ => {
                                    if let Some(platform) = platform_of.get(&id).cloned() {
                                        let rank = launchbox_front_rank(
                                            fields.get("Type").map(String::as_str).unwrap_or(""),
                                            fields.get("Region").map(String::as_str).unwrap_or(""),
                                        );
                                        if let Some(rank) = rank {
                                            let file =
                                                fields.get("FileName").cloned().unwrap_or_default();
                                            if launchbox_file_ok(&file) {
                                                ranked
                                                    .entry(platform)
                                                    .or_default()
                                                    .entry(id)
                                                    .or_default()
                                                    .push((rank, file));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        record = false;
                        field = None;
                        fields.clear();
                    }
                    _ => {
                        if let Some(current) = field.take() {
                            fields.insert(current, text.trim().to_owned());
                            text.clear();
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(_) => {}
            Err(_) => return Err("Could not read the LaunchBox database".to_owned()),
        }
    }
    if platform_of.is_empty() {
        return Err("Could not read any games from the LaunchBox database".to_owned());
    }
    let mut images: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    for (platform, by_id) in ranked {
        let mapped = by_id
            .into_iter()
            .map(|(id, mut files)| {
                files.sort_by_key(|(rank, _)| *rank);
                files.truncate(LAUNCHBOX_KEEP);
                (
                    id,
                    files.into_iter().map(|(_, file)| file).collect::<Vec<_>>(),
                )
            })
            .collect::<HashMap<_, _>>();
        images.insert(platform, mapped);
    }
    Ok((names, images))
}

fn launchbox_index_file(data_dir: &Path) -> PathBuf {
    data_dir.join("media/_index/launchbox-index.json")
}

async fn download_launchbox_zip(
    path: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<(), String> {
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    polite_gap(PoliteSite::LaunchBox).await;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(LAUNCHBOX_METADATA)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("LaunchBox returned HTTP {}", response.status()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            drop(file);
            let _ = fs::remove_file(path);
            return Err("Cancelled".to_owned());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn build_launchbox_index(
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Value, String> {
    let dir = data_dir.join("media/_index");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let zip_path = dir.join(format!("launchbox-metadata-{}.zip", uuid::Uuid::new_v4()));
    download_launchbox_zip(&zip_path, cancelled).await?;
    let (names, images) = {
        let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let entry = archive
            .by_name("Metadata.xml")
            .map_err(|_| "The LaunchBox database is missing Metadata.xml".to_owned())?;
        parse_launchbox_metadata(entry, cancelled)?
    };
    let _ = fs::remove_file(&zip_path);
    let built = json!({
        "version": LAUNCHBOX_INDEX_VERSION,
        "built": chrono::Utc::now().timestamp_millis(),
        "names": names,
        "images": images
    });
    let file = launchbox_index_file(data_dir);
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(&built).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
    Ok(built)
}

async fn load_launchbox_index(
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
    allow_download: bool,
) -> Result<Option<Value>, String> {
    let file = launchbox_index_file(data_dir);
    let age_ms: u64 = file
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX);
    let mut want_refresh = refresh;
    if want_refresh && age_ms < 86400 * 1000 {
        want_refresh = false;
    }
    if let Ok(text) = fs::read_to_string(&file) {
        if let Ok(cached) = serde_json::from_str::<Value>(&text) {
            if cached.get("version").and_then(Value::as_u64) == Some(LAUNCHBOX_INDEX_VERSION) {
                if !want_refresh && age_ms < WEB_CACHE_AGE_SECS * 1000 {
                    return Ok(Some(cached));
                }
                if !allow_download {
                    return Ok(Some(cached));
                }
            }
        }
    }
    if !allow_download {
        return Ok(None);
    }
    Ok(Some(build_launchbox_index(data_dir, cancelled).await?))
}

async fn first_image(
    urls: Vec<String>,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Vec<u8>>, String> {
    let mut failure: Option<String> = None;
    for url in urls {
        if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("Cancelled".to_owned());
        }
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        match request_image(parsed, cancelled).await {
            Ok(Some(bytes)) => return Ok(Some(bytes)),
            Ok(None) => {}
            Err(error) => {
                if error == "Cancelled" || cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
                    return Err(error);
                }
                failure = Some(error);
            }
        }
    }
    match failure {
        Some(error) => Err(error),
        None => Ok(None),
    }
}

async fn fetch_launchbox_image(
    game: &Game,
    sys_id: &str,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
    allow_download: bool,
) -> Result<Option<Vec<u8>>, String> {
    let Some(platform) = launchbox_platform(sys_id) else {
        return Ok(None);
    };
    if !trusted_release(&game.base) {
        return Ok(None);
    }
    let Some(index) = load_launchbox_index(data_dir, cancelled, refresh, allow_download).await?
    else {
        return Ok(None);
    };
    let Some(names) = index.get("names").and_then(|names| names.get(platform)) else {
        return Ok(None);
    };
    let Some(images) = index.get("images").and_then(|images| images.get(platform)) else {
        return Ok(None);
    };
    let mut keys = Vec::new();
    for key in artwork_title_keys(game) {
        keys.push(key.clone());
        keys.push(without_version(&key));
    }
    for key in keys {
        let Some(ids) = names.get(&key).and_then(Value::as_array) else {
            continue;
        };
        for id in ids {
            let Some(files) = id
                .as_str()
                .and_then(|id| images.get(id))
                .and_then(Value::as_array)
            else {
                continue;
            };
            if files.is_empty() {
                continue;
            }
            let urls: Vec<String> = files
                .iter()
                .filter_map(Value::as_str)
                .map(|file| format!("{LAUNCHBOX_IMAGES}/{file}"))
                .collect();
            if !urls.is_empty() {
                return first_image(urls, cancelled).await;
            }
        }
    }
    Ok(None)
}

fn crc32_table() -> &'static [u32; 256] {
    static TABLE: OnceLock<[u32; 256]> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut table = [0u32; 256];
        for (index, slot) in table.iter_mut().enumerate() {
            let mut crc = index as u32;
            for _ in 0..8 {
                crc = if crc & 1 != 0 {
                    0xEDB88320 ^ (crc >> 1)
                } else {
                    crc >> 1
                };
            }
            *slot = crc;
        }
        table
    })
}

fn crc32_update(crc: u32, data: &[u8]) -> u32 {
    let mut crc = !crc;
    for &byte in data {
        crc = crc32_table()[(crc ^ u32::from(byte)) as usize & 0xff] ^ (crc >> 8);
    }
    !crc
}

fn screenscraper_crc(game: &Game, size: u64) -> Option<u32> {
    if size > SCREENSCRAPER_CRC_LIMIT {
        return None;
    }
    let mut file = fs::File::open(&game.rom_path).ok()?;
    let mut crc = 0u32;
    let mut buffer = [0u8; 8192];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => crc = crc32_update(crc, &buffer[..read]),
            Err(_) => return None,
        }
    }
    Some(crc)
}

fn screenscraper_lookup_url(
    game: &Game,
    system: u32,
    credentials: &ScreenScraperCredentials,
    rom_size: Option<u64>,
    crc: Option<u32>,
) -> Url {
    let rom_path = Path::new(&game.rom_path);
    let folder = game.rom_path.to_lowercase().ends_with("exefs/main");
    let mut url = Url::parse(&format!("{SCREENSCRAPER_API}/jeuInfos.php"))
        .expect("ScreenScraper API URL is valid");
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("devid", &credentials.dev_id);
        q.append_pair("devpassword", &credentials.dev_password);
        q.append_pair("softname", SCREENSCRAPER_SOFTNAME);
        q.append_pair("output", "json");
        q.append_pair("ssid", &credentials.user);
        q.append_pair("sspassword", &credentials.password);
        q.append_pair("systemeid", &system.to_string());
        if folder {
            q.append_pair("romtype", "dossier");
            q.append_pair("romnom", &game.base);
        } else {
            q.append_pair("romtype", "rom");
            let romnom = rom_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(&game.base);
            q.append_pair("romnom", romnom);
            if let Some(size) = rom_size {
                q.append_pair("romtaille", &size.to_string());
                if let Some(crc) = crc {
                    q.append_pair("crc", &format!("{crc:08X}"));
                }
            }
        }
    }
    url
}

async fn screenscraper_json(
    url: Url,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Option<Value>, String> {
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    polite_gap(PoliteSite::ScreenScraper).await;
    if cancelled.is_some_and(|c| c.load(Ordering::Relaxed)) {
        return Err("Cancelled".to_owned());
    }
    let response = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    match response.status().as_u16() {
        404 => return Ok(None),
        400 => return Err("ScreenScraper could not read the request".to_owned()),
        401 => return Err("ScreenScraper is busy right now; try again later".to_owned()),
        403 => return Err("ScreenScraper rejected the developer ID or password".to_owned()),
        423 => return Err("ScreenScraper is down for maintenance".to_owned()),
        426 => return Err("ScreenScraper no longer accepts this version of PyroCade".to_owned()),
        429 => return Err("ScreenScraper says too many requests; slow down and retry".to_owned()),
        430 => return Err("Your ScreenScraper daily quota is used up".to_owned()),
        431 => return Err("ScreenScraper saw too many unknown ROMs today".to_owned()),
        status if !response.status().is_success() => {
            return Err(format!("ScreenScraper returned HTTP {status}"));
        }
        _ => {}
    }
    let data = response
        .json::<Value>()
        .await
        .map_err(|_| "ScreenScraper sent an unreadable reply".to_owned())?;
    Ok(Some(data))
}

async fn screenscraper_medias(
    game: &Game,
    system: u32,
    credentials: &ScreenScraperCredentials,
    cancelled: Option<&Arc<AtomicBool>>,
) -> Result<Vec<String>, String> {
    let rom_size = fs::metadata(&game.rom_path).map(|meta| meta.len()).ok();
    let crc = rom_size.and_then(|size| screenscraper_crc(game, size));
    let url = screenscraper_lookup_url(game, system, credentials, rom_size, crc);
    let Some(data) = screenscraper_json(url, cancelled).await? else {
        return Ok(Vec::new());
    };
    let Some(medias) = data
        .get("response")
        .and_then(|response| response.get("jeu"))
        .and_then(|jeu| jeu.get("medias"))
        .and_then(Value::as_array)
    else {
        return Ok(Vec::new());
    };
    let mut candidates: Vec<(u32, String)> = medias
        .iter()
        .filter(|media| media.get("type").and_then(Value::as_str) == Some("box-2D"))
        .filter_map(|media| {
            let url = media.get("url").and_then(Value::as_str)?;
            if !screenscraper_media_url(url) {
                return None;
            }
            let region = media.get("region").and_then(Value::as_str).unwrap_or("");
            Some((screenscraper_region_rank(region), url.to_owned()))
        })
        .collect();
    candidates.sort_by_key(|(rank, _)| *rank);
    candidates.truncate(6);
    Ok(candidates.into_iter().map(|(_, url)| url).collect())
}

async fn fetch_screenscraper_image(
    game: &Game,
    sys_id: &str,
    config: &Value,
    data_dir: &Path,
    cancelled: Option<&Arc<AtomicBool>>,
    refresh: bool,
) -> Result<Option<Vec<u8>>, String> {
    let Some(system) = screenscraper_system(sys_id) else {
        return Ok(None);
    };
    let Some(credentials) = screenscraper_credentials(config) else {
        return Ok(None);
    };
    let file = web_cache_file(data_dir, "screenscraper.json");
    let key = format!("ss/{sys_id}/{}", game.id);
    let mut urls: Option<Vec<String>> = None;
    if !refresh {
        if let Some(cached) = web_cache_get(&file, &key) {
            if let Some(cached) = cached.as_array() {
                urls = Some(
                    cached
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect(),
                );
            }
        }
    }
    if urls.is_none() {
        let found = screenscraper_medias(game, system, &credentials, cancelled).await?;
        web_cache_set(&file, &key, json!(found));
        urls = Some(found);
    }
    first_image(urls.unwrap_or_default(), cancelled).await
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    fs::create_dir_all(path.parent().ok_or("Artwork directory is invalid")?)
        .map_err(|e| e.to_string())?;
    let mut file = match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    file.write_all(bytes).map(|_| true).map_err(|e| {
        let _ = fs::remove_file(path);
        e.to_string()
    })
}

fn refresh_index(
    retry_missing: bool,
    refreshed_indexes: &Mutex<HashSet<String>>,
    key: String,
) -> bool {
    retry_missing
        && refreshed_indexes
            .lock()
            .map(|mut refreshed| refreshed.insert(key))
            .unwrap_or(false)
}

fn artwork_region_rank(name: &str) -> (bool, bool) {
    let us = name.contains("(USA");
    let preferred = us || name.contains("(Europe") || name.contains("(World");
    (!us, !preferred)
}

fn safe_base(base: &str) -> Result<&str, String> {
    if base.is_empty()
        || base == "."
        || base == ".."
        || base
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Invalid game filename".to_owned());
    }
    Ok(base)
}

fn type_folder(kind: &str) -> &'static str {
    TYPES
        .iter()
        .find(|(name, _, _)| *name == kind)
        .map(|(_, folder, _)| *folder)
        .unwrap_or("covers")
}

fn loose_key(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn libretro_matches_prefer_us_then_europe_or_world() {
        let mut names = vec![
            "Game (World).png",
            "Game (Japan).png",
            "Game (USA).png",
            "Game (Europe).png",
        ];
        names.sort_by_key(|name| artwork_region_rank(name));
        assert_eq!(
            names,
            [
                "Game (USA).png",
                "Game (World).png",
                "Game (Europe).png",
                "Game (Japan).png",
            ]
        );
    }

    #[test]
    fn retry_missing_refreshes_each_index_once_per_job() {
        let refreshed = Mutex::new(HashSet::new());
        assert!(refresh_index(true, &refreshed, "snes/front".to_owned()));
        assert!(!refresh_index(true, &refreshed, "snes/front".to_owned()));
        assert!(!refresh_index(
            false,
            &refreshed,
            "snes/screenshot".to_owned()
        ));
    }

    #[test]
    fn imported_artwork_replaces_the_backend_game_media() {
        let game = Game {
            id: "game".to_owned(),
            system: "snes".to_owned(),
            rom_path: "game.sfc".to_owned(),
            base: "game".to_owned(),
            title: "Game".to_owned(),
            info: json!({}),
            media: std::collections::HashMap::from([(
                "front".to_owned(),
                "file:///old.png".to_owned(),
            )]),
            shell: None,
            hidden: false,
            scanned_title: None,
            custom_title: false,
            version: None,
            media_type: None,
            emulator: None,
            added: None,
        };
        let games = Arc::new(RwLock::new(vec![game]));
        update_game_media(
            &games,
            "game",
            &json!({"replace":true,"media":{"front":"file:///new.png"}}),
        );
        assert_eq!(
            games.read().unwrap()[0]
                .media
                .get("front")
                .map(String::as_str),
            Some("file:///new.png")
        );
    }

    #[test]
    fn fallback_skips_untrusted_releases_and_ignores_version() {
        assert!(!trusted_release(
            "Super Mario World Co-op (Super Mario World modification) (1.0)"
        ));
        assert!(!trusted_release("Tetris (Demo) (USA)"));
        assert!(trusted_release("Mario Kart DS (USA)"));
        assert_eq!(without_version("pokemonblackversion"), "pokemonblack");
        assert_eq!(region_of("Game (USA) [TWL-IRBO-USA]"), "us");
        assert_eq!(region_of("Game (Europe)"), "eu");
        assert_eq!(region_of("Game (Japan)"), "jp");
        // A bare title word is not a region tag.
        assert_eq!(region_of("Game E"), "");
    }

    #[test]
    fn mariowiki_pages_and_image_paths() {
        assert_eq!(
            wiki_page_names("Mario & Luigi - Partners in Time (Europe) (En,Fr)")[0],
            "Mario & Luigi - Partners in Time"
        );
        assert!(
            wiki_page_names("Mario & Luigi - Partners in Time (Europe)")
                .iter()
                .any(|n| n == "Mario & Luigi: Partners in Time")
        );
        assert!(
            wiki_image_url("MKDS NA Box Art.png", MARIOWIKI_IMAGES)
                .ends_with("/images/e/e1/MKDS_NA_Box_Art.png")
        );
        let text = "{{game infobox\n|image=[[File:MKDS NA Box Art.png|270px]]\n|platforms=[[Nintendo DS]]\n}}";
        assert_eq!(
            infobox_images(text),
            Some(vec!["MKDS NA Box Art.png".to_owned()])
        );
        assert_eq!(infobox_images("{{disambig}}"), None);
        let cover_page = "{{game-cover}}\n[[Category:Nintendo DS game covers]]";
        assert!(is_front_cover("MKDS NA Box Art.png", cover_page, "nds"));
        assert!(!is_front_cover("MPDS Box Back.png", cover_page, "nds"));
        let n64_cover = "[[Category:Nintendo 64 game covers]]";
        assert!(!is_front_cover("SM64 Box.png", n64_cover, "nds"));
        assert!(is_front_cover("SM64 Box.png", n64_cover, "n64"));
        let back_cover = "{{game-cover}}\n[[Category:Nintendo DS game covers]]\nback cover";
        assert!(!is_front_cover("Box.png", back_cover, "nds"));
    }

    #[test]
    fn internet_archive_titles_systems_and_front_files() {
        assert_eq!(
            item_name("Pokemon - Black Version [TWL-IRBO-USA] (Nintendo DS) - Box Scans (1200DPI)"),
            "Pokemon - Black Version"
        );
        assert_eq!(
            item_name("Sword of Hope, The (Spain) DMG-SE-ESP 1200dpi 48bit"),
            "Sword of Hope, The"
        );
        assert_eq!(
            item_name("Advance Wars Dual Strike Nintendo Ds box art full cover"),
            "Advance Wars Dual Strike"
        );
        let systems = systems_of(
            "Invincible Iron Man, The [AGB-AIOE USA] Box Scan",
            &[
                "Nintendo".to_owned(),
                "GameBoy".to_owned(),
                "GameBoy Advance".to_owned(),
                "GBA".to_owned(),
            ],
        );
        assert_eq!(systems, vec!["gba".to_owned()]);
        let ambiguous = systems_of("Some Game", &["Nintendo DS".to_owned(), "PSP".to_owned()]);
        assert_eq!(ambiguous.len(), 2);
        let files = front_files(&[
            json!({"name":"Mario and Wario - Box Front.jpg","format":"JPEG","size":"6086510"}),
            json!({"name":"Mario and Wario - Cart Front.jpg","format":"JPEG","size":"1131975"}),
            json!({"name":"Mario and Wario - Box Back.jpg","format":"JPEG","size":"5754998"}),
            json!({"name":"Mario and Wario - Box Front_thumb.jpg","format":"JPEG Thumb","size":"20000"}),
            json!({"name":"021_GAME_NDS_survey_front.jpg","format":"JPEG","size":"500000"}),
            json!({"name":"scans/001 SLES-03633-Front.jpg","format":"JPEG","size":"6444678"}),
            json!({"name":"FrontCover.png","format":"PNG","size":"900000"}),
        ]);
        assert_eq!(
            files,
            [
                "Mario and Wario - Box Front.jpg",
                "scans/001 SLES-03633-Front.jpg",
                "FrontCover.png"
            ]
        );
        assert!(
            index_item(&json!({
                "identifier":"x",
                "title":"Tomb Raider: Prophecy, The [5001656] Merchandise Offer",
                "subject":["GameBoy Advance","Insert","Merchandise Offer"]
            }))
            .is_none()
        );
        assert!(index_item(&json!({
            "identifier":"x",
            "title":"Castlevania Portrait Of Ruin [NTR-ACBE-USA] (Nintendo DS) - Box, Manual, Cart Scans (1200DPI)",
            "subject":["Nintendo DS"]
        }))
        .is_some());
        assert!(fits_front("ps1", 2953, 3015));
        assert!(fits_front("snes", 4140, 3000));
        assert!(fits_front("snes", 2160, 3000));
        assert!(!fits_front("snes", 3137, 6735));
        assert!(!fits_front("arcade", 1000, 1000));
    }

    #[test]
    fn launchbox_and_screenscraper_cover_their_systems() {
        assert_eq!(launchbox_platform("ps4"), Some("Sony Playstation 4"));
        assert_eq!(launchbox_platform("arcade"), Some("Arcade"));
        assert!(launchbox_covers("snes"));
        assert!(!launchbox_covers("unknown"));
        assert_eq!(screenscraper_system("snes"), Some(4));
        assert_eq!(screenscraper_system("ps1"), Some(57));
        assert_eq!(screenscraper_system("switch"), Some(225));
        assert_eq!(screenscraper_system("ps4"), None);
        assert_eq!(screenscraper_region_rank("us"), 0);
        assert!(screenscraper_region_rank("us") < screenscraper_region_rank("wor"));
        assert!(screenscraper_region_rank("eu") < screenscraper_region_rank("jp"));
        assert!(screenscraper_region_rank("xx") > screenscraper_region_rank("jp"));
    }

    #[test]
    fn launchbox_front_files_rank_type_then_region() {
        assert_eq!(
            launchbox_front_rank("Box - Front", "United States"),
            Some(0)
        );
        assert_eq!(
            launchbox_front_rank("Box - Front - Reconstructed", "Europe"),
            Some(12)
        );
        assert_eq!(launchbox_front_rank("Box - Front", ""), Some(1));
        assert_eq!(
            launchbox_front_rank("Screenshot - Gameplay", "United States"),
            None
        );
        assert!(launchbox_file_ok("Game-01.jpg"));
        assert!(launchbox_file_ok("a.b_png.PNG"));
        assert!(!launchbox_file_ok("dir/Game.jpg"));
        assert!(!launchbox_file_ok("Game.bmp"));
    }

    #[test]
    fn launchbox_metadata_parses_games_names_and_front_files() {
        let xml = "<Database><Games><Game><DatabaseID>1</DatabaseID><Platform>Sony Playstation</Platform><Name>Test Game</Name></Game><Game><DatabaseID>2</DatabaseID><Platform>Other</Platform><Name>Skipped</Name></Game></Games><GameAlternateName><DatabaseID>1</DatabaseID><AlternateName>Test Game &amp; More</AlternateName></GameAlternateName><GameImage><DatabaseID>1</DatabaseID><Type>Box - Front</Type><FileName>test-reconstructed.jpg</FileName><Region>Europe</Region></GameImage><GameImage><DatabaseID>1</DatabaseID><Type>Box - Front</Type><FileName>test-front.jpg</FileName><Region>United States</Region></GameImage><GameImage><DatabaseID>1</DatabaseID><Type>Screenshot - Gameplay</Type><FileName>ignored.jpg</FileName><Region>United States</Region></GameImage></Database>";
        let (names, images) =
            parse_launchbox_metadata(Cursor::new(xml), None).expect("metadata parses");
        let platform = "Sony Playstation";
        assert_eq!(names[platform]["testgame"], vec!["1".to_owned()]);
        assert!(names[platform].contains_key("testgamemore"));
        assert_eq!(
            images[platform]["1"],
            vec![
                "test-front.jpg".to_owned(),
                "test-reconstructed.jpg".to_owned()
            ]
        );
        assert!(!names.contains_key("Other"));
    }

    #[test]
    fn crc32_matches_the_ieee_check_value() {
        assert_eq!(crc32_update(0, b"123456789"), 0xCBF43926);
        assert_eq!(crc32_update(0, b""), 0);
    }

    #[test]
    fn screenscraper_stays_inert_without_credentials() {
        let config = json!({"screenscraper": {"user": "u", "devId": "d"}});
        assert!(!screenscraper_configured(&config));
        assert!(!screenscraper_covers("snes", &config));
        let configured = json!({"screenscraper": {"user": "u", "devId": "d", "password": "p", "devPassword": "q"}});
        assert!(screenscraper_configured(&configured));
        assert!(screenscraper_covers("snes", &configured));
        assert!(!screenscraper_covers("ps4", &configured));
    }

    #[test]
    fn screenscraper_lookup_names_the_rom() {
        let game = Game {
            id: "snes:game".to_owned(),
            system: "snes".to_owned(),
            rom_path: "roms/Game (USA).sfc".to_owned(),
            base: "Game (USA)".to_owned(),
            title: "Game".to_owned(),
            info: json!({}),
            media: std::collections::HashMap::new(),
            shell: None,
            hidden: false,
            scanned_title: None,
            custom_title: false,
            version: None,
            media_type: None,
            emulator: None,
            added: None,
        };
        let credentials = ScreenScraperCredentials {
            user: "u".to_owned(),
            dev_id: "d".to_owned(),
            password: "p".to_owned(),
            dev_password: "q".to_owned(),
        };
        let url = screenscraper_lookup_url(&game, 4, &credentials, Some(12345), Some(0xCBF43926));
        let query = url.query().unwrap_or("");
        assert!(query.contains("systemeid=4"));
        assert!(query.contains("romnom=Game+%28USA%29.sfc"));
        assert!(query.contains("romtaille=12345"));
        assert!(query.contains("crc=CBF43926"));
        let dossier = Game {
            rom_path: "roms/exefs/main".to_owned(),
            ..game
        };
        let url = screenscraper_lookup_url(&dossier, 4, &credentials, None, None);
        let query = url.query().unwrap_or("");
        assert!(query.contains("romtype=dossier"));
        assert!(query.contains("romnom=Game+%28USA%29"));
        assert!(screenscraper_media_url(
            "https://www.screenscraper.fr/box-2D.png"
        ));
        assert!(!screenscraper_media_url(
            "http://www.screenscraper.fr/box-2D.png"
        ));
        assert!(!screenscraper_media_url("https://example.com/box-2D.png"));
    }

    #[test]
    fn valid_pdf_tracks_the_magic_and_nothing_else() {
        assert!(valid_pdf(b"%PDF-1.4\n%%EOF"));
        assert!(!valid_pdf(b"%PDF"));
        assert!(!valid_pdf(b"not a pdf"));
        assert!(!valid_pdf(b""));
    }

    #[test]
    fn manual_keys_match_titles_without_punctuation_or_brands() {
        assert_eq!(manual_loose_key("Pokemon - Ruby (U) [!]"), "pokemonruby");
        assert_eq!(
            manual_loose_key("The Legend of Zelda & Friends"),
            "legendofzeldafriends"
        );
        assert_eq!(manual_bare_key("Disney Pixar Toy Story"), "toystory");
        assert_eq!(manual_bare_key("Toy Story"), "");
    }
}
