use crate::backend::{AppState, Game};
use image::GenericImageView;
use serde_json::{Value, json};
use std::collections::{HashSet, VecDeque};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const LIBRETRO: &str = "https://thumbnails.libretro.com";
const SWITCH_DATABASE: &str = "https://www.gametdb.com/switchtdb.txt?LANG=EN";
const SWITCH_IMAGES: &str = "https://art.gametdb.com/switch";
// MAX_ARTWORK_PIXELS caps one image at 40 million pixels, because compressed bytes do not bound decoded memory.
const MAX_ARTWORK_PIXELS: u64 = 40_000_000;
// MAX_SWITCH_CODES bounds title collisions, because each match multiplies remote requests.
const MAX_SWITCH_CODES: usize = 4;
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
    let result = download_game(
        &state.app,
        &game,
        &types,
        &config,
        &state.data_dir,
        None,
        retry_missing,
        &refreshed_indexes,
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
    if !switch && system.get("libretro").and_then(Value::as_str).is_none() {
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
        let result = if switch {
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
        .user_agent("PyroCade-Frontend")
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
}
