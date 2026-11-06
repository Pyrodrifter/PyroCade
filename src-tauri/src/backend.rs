use crate::config::{config_for_save, load_config, save_config};
use crate::storage::{is_content_uri, split_storage_refs};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub system: String,
    pub rom_path: String,
    pub base: String,
    pub title: String,
    pub info: Value,
    pub media: HashMap<String, String>,
}

#[derive(Clone)]
struct RomFile {
    name: String,
    path: PathBuf,
    root: PathBuf,
    root_index: usize,
    size: u64,
}

struct MediaIndex {
    game_dirs: HashMap<String, PathBuf>,
    kinds: HashMap<String, HashMap<String, PathBuf>>,
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
pub fn scan_library(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    let games = scan(&app, &state.config(), &state.data_dir)?;
    *state.games.write().map_err(|e| e.to_string())? = games.clone();
    Ok(games)
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

#[tauri::command]
pub fn launch_game(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    let _ = app;
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
    let template = system
        .get("args")
        .and_then(Value::as_str)
        .or_else(|| definition.get("args").and_then(Value::as_str))
        .unwrap_or("{rom}");
    let args: Vec<String> = split_args(template)
        .into_iter()
        .map(|part| part.replace("{rom}", &game.rom_path))
        .collect();
    let app_bundle = cfg!(target_os = "macos")
        .then(|| {
            executable
                .ancestors()
                .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
        })
        .flatten();
    let cwd = app_bundle
        .and_then(Path::parent)
        .or_else(|| executable.parent())
        .unwrap_or_else(|| Path::new("."));
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
    command
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = command.spawn().map_err(|e| format!("Launch failed: {e}"))?;
    #[cfg(not(target_os = "android"))]
    let window = config
        .get("hideWhilePlaying")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        .then(|| app.get_webview_window("main"))
        .flatten();
    #[cfg(target_os = "android")]
    let window = None;
    #[cfg(not(target_os = "android"))]
    if let Some(window) = window.as_ref() {
        let _ = window.minimize();
    }
    wait_for_child(child, window);
    Ok(true)
}

fn scan(app: &AppHandle, config: &Value, data_dir: &Path) -> Result<Vec<Game>, String> {
    let mut games = Vec::new();
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
        // romDir may hold filesystem paths (desktop) or SAF tree URIs (Android).
        // Only filesystem roots can be walked with std::fs; URIs are stored
        // but never converted into paths.
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
            walk_roms(root, root, root_index, 0, &extensions, &mut files);
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
        let best = select_best_roms(files);
        let roots = media_roots(config, system, &dirs, data_dir);
        for root in &roots {
            allow_tree(app, root);
        }
        let indexes: Vec<MediaIndex> = roots.iter().map(|root| index_media_root(root)).collect();
        let lists: Vec<HashMap<String, Value>> =
            dirs.iter().map(|root| read_gamelist(root)).collect();
        for file in best.values() {
            let base = Path::new(&file.name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file.name)
                .to_owned();
            let (media_paths, info) = find_media(&indexes, &base);
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
            games.push(Game {
                id: format!("{id}:{suffix}"),
                system: id.to_owned(),
                rom_path: file.path.to_string_lossy().to_string(),
                base,
                title,
                info: Value::Object(metadata),
                media,
            });
        }
    }
    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(games)
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
    root: &Path,
    dir: &Path,
    root_index: usize,
    depth: usize,
    extensions: &HashSet<String>,
    out: &mut Vec<RomFile>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let entries: Vec<_> = entries.filter_map(Result::ok).collect();
    if extensions.contains(".nsp")
        && entries.iter().any(|e| {
            e.file_type().is_ok_and(|t| t.is_dir())
                && matches!(
                    e.file_name().to_string_lossy().to_lowercase().as_str(),
                    "base" | "exefs"
                )
        })
    {
        for main in [dir.join("base/exefs/main"), dir.join("exefs/main")] {
            if main.is_file() {
                let label = dir.file_name().and_then(|s| s.to_str()).unwrap_or("Game");
                out.push(RomFile {
                    name: format!("{label}.dump"),
                    path: main,
                    root: root.to_path_buf(),
                    root_index,
                    size: 9_000_000_000,
                });
                return;
            }
        }
    }
    for entry in entries {
        let path = entry.path();
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            if depth < 4 && !skip_dir(&entry.file_name().to_string_lossy()) {
                walk_roms(root, &path, root_index, depth + 1, extensions, out);
            }
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .is_some_and(|e| extensions.contains(&e))
        {
            out.push(RomFile {
                name: entry.file_name().to_string_lossy().to_string(),
                size: entry.metadata().map(|m| m.len()).unwrap_or_default(),
                path,
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

fn copy_score(file: &RomFile) -> f64 {
    let name = file.name.to_lowercase();
    let mut score: f64 = 0.0;
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
        score += 4.0;
    }
    if name.contains("(j)") || name.contains("(jp)") || name.contains("(japan)") {
        score -= 2.0;
    }
    if name.contains("[!]") {
        score += 2.0;
    }
    if ["update", "upd", "dlc", "(beta", "(proto", "(demo", "(hack"]
        .iter()
        .any(|s| name.contains(s))
        || has_dump_marker(&name)
    {
        score -= 6.0;
    }
    if !name.ends_with(".zip") {
        score += 1.0;
    }
    score + (file.size as f64 / 10_000_000_000.0).min(0.9)
}

fn has_dump_marker(name: &str) -> bool {
    static DUMP_MARKER: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    DUMP_MARKER
        .get_or_init(|| regex::Regex::new(r"\[(?:b|h|t|o)\d*\]|\[v[1-9]\d*\]").unwrap())
        .is_match(name)
}

fn select_best_roms(files: Vec<RomFile>) -> HashMap<String, RomFile> {
    let mut best = HashMap::new();
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
        let replace = best
            .get(&key)
            .is_none_or(|old| copy_score(&file) > copy_score(old));
        if replace {
            best.insert(key, file);
        }
    }
    best
}

fn index_media_root(root: &Path) -> MediaIndex {
    let mut index = MediaIndex {
        game_dirs: HashMap::new(),
        kinds: HashMap::new(),
    };
    let Ok(entries) = fs::read_dir(root) else {
        return index;
    };
    for entry in entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
    {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if let Some((kind, _)) = media_kind_folder(&name) {
            let Ok(files) = fs::read_dir(entry.path()) else {
                continue;
            };
            let map = index.kinds.entry(kind.to_owned()).or_default();
            for file in files
                .filter_map(Result::ok)
                .filter(|f| f.file_type().is_ok_and(|t| t.is_file()))
            {
                let path = file.path();
                if valid_media_extension(kind, &path) {
                    map.insert(stem(&file.file_name().to_string_lossy()), path);
                }
            }
        } else {
            index.game_dirs.insert(name, entry.path());
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

fn media_value(kind: &str, path: &Path) -> Option<String> {
    if kind == "manual" {
        Some(path.to_string_lossy().into_owned())
    } else {
        Url::from_file_path(path).ok().map(|url| url.to_string())
    }
}

fn find_media(indexes: &[MediaIndex], base: &str) -> (HashMap<String, PathBuf>, Option<Value>) {
    let key = base.to_lowercase();
    let mut media = HashMap::new();
    let mut info = None;
    for index in indexes {
        let dir = index
            .game_dirs
            .get(&key)
            .or_else(|| index.game_dirs.get(&clean_title(base).to_lowercase()));
        if let Some(dir) = dir {
            if let Ok(files) = fs::read_dir(dir) {
                let files: Vec<_> = files
                    .filter_map(Result::ok)
                    .filter(|f| f.file_type().is_ok_and(|t| t.is_file()))
                    .collect();
                for (kind, names) in media_names() {
                    if media.contains_key(kind) {
                        continue;
                    }
                    let hit = names.iter().find_map(|name| {
                        files
                            .iter()
                            .filter(|f| {
                                stem(&f.file_name().to_string_lossy()) == *name
                                    && valid_media_extension(kind, &f.path())
                            })
                            .min_by_key(|f| {
                                if f.path()
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
                        media.insert(kind.to_owned(), hit.path());
                    }
                }
                if info.is_none() {
                    if let Some(file) = files.iter().find(|f| {
                        f.file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case("info.json")
                    }) {
                        info = fs::read_to_string(file.path())
                            .ok()
                            .and_then(|s| serde_json::from_str(&s).ok());
                    }
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
    (media, info)
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
pub fn pick_folder(app: AppHandle, title: String) -> Option<String> {
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
            size: 0,
        }
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
        };

        let payload = serde_json::to_value(game).unwrap();

        assert_eq!(payload["id"], "snes:game");
        assert_eq!(payload["romPath"], "/roms/game.sfc");
        assert_eq!(payload["info"]["year"], "1998");
        assert_eq!(payload["media"]["front"], "file:///media/front.png");
        assert_eq!(payload["media"]["manual"], "/media/manual.pdf");
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
        let selected = select_best_roms(vec![
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
}
