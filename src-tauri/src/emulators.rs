use crate::backend::AppState;
use crate::config::save_config;
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::fs;
#[cfg(not(target_os = "macos"))]
use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;

const CATALOG: &str = include_str!("../../emulators.json");

#[tauri::command]
pub fn list_emulators(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let config = state.config();
    let catalog: Vec<Value> = serde_json::from_str(CATALOG).map_err(|e| e.to_string())?;
    let mut ids = HashSet::new();
    let mut result = Vec::new();
    for entry in catalog.iter().chain(
        config
            .get("customEmulators")
            .and_then(Value::as_array)
            .into_iter()
            .flatten(),
    ) {
        if let Some(id) = entry.get("id").and_then(Value::as_str) {
            if ids.insert(id.to_owned()) {
                result.push(emu_status(&state, entry, &config));
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn check_emulator_update(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    let config = state.config();
    let latest = latest_release(&id, &config).await?;
    let installed = read_manifest(&state.emu_dir, &id);
    let update_available =
        installed.as_ref().and_then(|m| m.get("assetId")) != latest.get("assetId");
    Ok(json!({"latest":latest,"updateAvailable":update_available}))
}

#[tauri::command]
pub async fn install_emulator(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    {
        let mut guard = installing().lock().map_err(|e| e.to_string())?;
        if !guard.insert(id.clone()) {
            return Err("Already installing".to_owned());
        }
    }
    let result = install_inner(&app, &state, &id).await;
    if let Ok(mut guard) = installing().lock() {
        guard.remove(&id);
    }
    result
}

static INSTALLING: std::sync::OnceLock<std::sync::Mutex<HashSet<String>>> =
    std::sync::OnceLock::new();

fn installing() -> &'static std::sync::Mutex<HashSet<String>> {
    INSTALLING.get_or_init(|| std::sync::Mutex::new(HashSet::new()))
}

async fn install_inner(app: &AppHandle, state: &AppState, id: &str) -> Result<Value, String> {
    let config = state.config();
    let definition = find_definition(id, &config).ok_or_else(|| "Unknown emulator".to_owned())?;
    let definition = selected_definition(&definition, &config, id);
    definition
        .get("source")
        .filter(|v| !v.is_null())
        .ok_or_else(|| {
            "This emulator is not managed by the downloader on this platform and architecture."
                .to_owned()
        })?;
    emit_progress(
        app,
        json!({"id":id,"stage":"Checking latest release…","pct":0}),
    );
    let release = latest_release_from_definition(&definition, &config, id).await?;
    let url = release
        .get("url")
        .and_then(Value::as_str)
        .ok_or("Release asset has no URL")?;
    let asset_name = release
        .get("assetName")
        .and_then(Value::as_str)
        .ok_or("Release asset has no filename")?;
    let temp = std::env::temp_dir().join(format!("pyrocade-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let archive = temp.join(asset_name);
    let result = async {
        let response = reqwest::Client::builder().user_agent("PyroCade-Frontend").build().map_err(|e| e.to_string())?
            .get(url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() { return Err(format!("Download failed: HTTP {}", response.status())); }
        let total = response.content_length().or_else(|| release.get("size").and_then(Value::as_u64)).unwrap_or_default();
        let mut stream = response.bytes_stream();
        let mut file = tokio::fs::File::create(&archive).await.map_err(|e| e.to_string())?;
        let mut got = 0_u64;
        let mut last = std::time::Instant::now();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            got += chunk.len() as u64;
            if last.elapsed() >= std::time::Duration::from_millis(120) {
                emit_progress(app, json!({"id":id,"stage":format!("Downloading {asset_name}"),"pct":if total > 0 { got as f64 / total as f64 } else { 0.0 },"got":got,"total":total}));
                last = std::time::Instant::now();
            }
        }
        file.flush().await.map_err(|e| e.to_string())?;
        let stage = temp.join("unpacked");
        fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
        if is_archive(asset_name) {
            emit_progress(app, json!({"id":id,"stage":"Extracting…","pct":1}));
            extract_archive(&archive, &stage)?;
        } else {
            fs::rename(&archive, stage.join(asset_name)).map_err(|e| e.to_string())?;
        }
        let source_dir = one_wrapping_directory(&stage);
        let bundle_regex = definition
            .get("appBundle")
            .and_then(Value::as_str)
            .map(|pattern| regex::Regex::new(&format!("(?i){pattern}")))
            .transpose()
            .map_err(|e| e.to_string())?;
        let found_bundle = bundle_regex
            .as_ref()
            .and_then(|pattern| find_app_bundle(&source_dir, pattern));
        let found = if let Some(bundle) = found_bundle {
            bundle
        } else {
            let exe_pattern = definition
                .get("exe")
                .and_then(Value::as_str)
                .ok_or("Emulator program pattern is missing")?;
            let exe_regex = regex::Regex::new(&format!("(?i){exe_pattern}"))
                .map_err(|e| e.to_string())?;
            find_program(&source_dir, &exe_regex).ok_or_else(|| {
                format!("Downloaded, but couldn't find the program (/{exe_pattern}/) in it.")
            })?
        };
        let relative = found.strip_prefix(&source_dir).map_err(|e| e.to_string())?;
        let destination = state.emu_dir.join(id);
        copy_tree(&source_dir, &destination)?;
        let executable = destination.join(relative);
        if !executable.is_dir() {
            set_executable(&executable)?;
        }
        let mut manifest = release.clone();
        manifest["exe"] = Value::String(relative.to_string_lossy().replace('\\', "/"));
        manifest["platform"] = Value::String(target_platform().to_owned());
        manifest["architecture"] = Value::String(target_architecture().to_owned());
        manifest["installedAt"] = Value::String(chrono::Utc::now().to_rfc3339());
        if let Some(object) = manifest.as_object_mut() { object.remove("notes"); }
        write_manifest(&state.emu_dir, id, &manifest)?;
        emit_progress(app, json!({"id":id,"stage":"Done","pct":1,"done":true}));
        Ok(emu_status(state, &find_definition(id, &config).ok_or("Unknown emulator")?, &config))
    }.await;
    let _ = fs::remove_dir_all(&temp);
    result
}

#[tauri::command]
pub fn uninstall_emulator(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let config = state.config();
    let definition = find_definition(&id, &config).ok_or_else(|| "Unknown emulator".to_owned())?;
    let path = state.emu_dir.join(&id);
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(emu_status(&state, &definition, &config))
}

#[tauri::command]
pub fn open_emulator_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let config = state.config();
    let definition = find_definition(&id, &config).ok_or_else(|| "Unknown emulator".to_owned())?;
    let exe = resolve_exe(&state.emu_dir, &id, &definition, &config);
    let path = exe
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| state.emu_dir.clone());
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pick_emulator_executable(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Value>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title("Choose emulator program")
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(None);
    };
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let overrides = config["emulators"]
        .as_object_mut()
        .ok_or("Invalid emulator settings")?;
    let current = overrides.entry(id.clone()).or_insert_with(|| json!({}));
    current["exe"] = Value::String(path.to_string_lossy().to_string());
    let next = config.clone();
    save_config(&state.config_path, &next)?;
    let definition = find_definition(&id, &next).ok_or_else(|| "Unknown emulator".to_owned())?;
    Ok(Some(emu_status(&state, &definition, &next)))
}

#[tauri::command]
pub fn add_custom_emulator(
    app: AppHandle,
    state: State<'_, AppState>,
    opts: Value,
) -> Result<Option<Value>, String> {
    let name = opts
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Custom emulator")
        .trim();
    if name.is_empty() {
        return Err("Enter an emulator name.".to_owned());
    }
    let Some(path) = app
        .dialog()
        .file()
        .set_title(format!("Choose {name} program"))
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(None);
    };
    let slug = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let id = format!(
        "custom-{}",
        slug.split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-")
    );
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let custom = config["customEmulators"]
        .as_array_mut()
        .ok_or("Invalid emulator settings")?;
    custom.retain(|entry| entry.get("id").and_then(Value::as_str) != Some(&id));
    custom.push(json!({
        "id": id, "name": name,
        "systems": opts.get("systems").cloned().unwrap_or_else(|| json!([])),
        "args": opts.get("args").and_then(Value::as_str).unwrap_or("{rom}"),
        "exe": path.to_string_lossy()
    }));
    let next = config.clone();
    save_config(&state.config_path, &next)?;
    let definition =
        find_definition(&id, &next).ok_or_else(|| "Could not save custom emulator".to_owned())?;
    Ok(Some(emu_status(&state, &definition, &next)))
}

pub(crate) fn find_definition(id: &str, config: &Value) -> Option<Value> {
    let catalog: Vec<Value> = serde_json::from_str(CATALOG).ok()?;
    catalog
        .into_iter()
        .find(|e| e.get("id").and_then(Value::as_str) == Some(id))
        .or_else(|| {
            config
                .get("customEmulators")
                .and_then(Value::as_array)?
                .iter()
                .find(|e| e.get("id").and_then(Value::as_str) == Some(id))
                .cloned()
        })
}

pub(crate) fn selected_definition(base: &Value, config: &Value, id: &str) -> Value {
    selected_definition_for_target(base, config, id, target_platform(), target_architecture())
}

fn selected_definition_for_target(
    base: &Value,
    config: &Value,
    id: &str,
    platform: &str,
    architecture: &str,
) -> Value {
    let custom = base.get("custom").and_then(Value::as_bool).unwrap_or(false)
        || base
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|s| s.starts_with("custom-"));
    let specific = base
        .get("platforms")
        .and_then(|p| p.get(platform))
        .and_then(|p| p.get(architecture));
    let mut selected = base.clone();
    if !custom {
        if let Some(data) = specific {
            if let Some(object) = selected.as_object_mut() {
                for key in [
                    "asset",
                    "exe",
                    "appBundle",
                    "args",
                    "source",
                    "repo",
                    "systems",
                ] {
                    if let Some(value) = data.get(key) {
                        object.insert(key.to_owned(), value.clone());
                    }
                }
                if data.get("repo").is_some() {
                    let source = object.entry("source").or_insert_with(|| json!({}));
                    source["repo"] = data["repo"].clone();
                }
            }
        } else {
            selected["source"] = Value::Null;
            selected["asset"] = Value::Null;
            selected["exe"] = Value::Null;
            selected["appBundle"] = Value::Null;
        }
    }
    if let Some(override_value) = config.get("emulators").and_then(|v| v.get(id)) {
        if let Some(object) = selected.as_object_mut() {
            for (key, value) in override_value.as_object().into_iter().flatten() {
                if !["exe", "asset", "source", "appBundle"].contains(&key.as_str()) {
                    object.insert(key.clone(), value.clone());
                }
            }
            object.insert(
                "exePath".to_owned(),
                override_value.get("exe").cloned().unwrap_or(Value::Null),
            );
        }
    }
    let available = custom || specific.is_some();
    let managed = !custom
        && available
        && selected
            .pointer("/source/repo")
            .and_then(Value::as_str)
            .is_some()
        && selected.get("asset").and_then(Value::as_str).is_some()
        && (selected.get("exe").and_then(Value::as_str).is_some()
            || selected.get("appBundle").and_then(Value::as_str).is_some());
    selected["custom"] = Value::Bool(custom);
    selected["available"] = Value::Bool(available);
    selected["managed"] = Value::Bool(managed);
    selected["platform"] = Value::String(platform.to_owned());
    selected["architecture"] = Value::String(architecture.to_owned());
    selected
}

fn target_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        std::env::consts::OS
    }
}

fn target_architecture() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        std::env::consts::ARCH
    }
}

fn manifest_matches_target(manifest: &Value, definition: &Value) -> bool {
    let platform = definition
        .get("platform")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let architecture = definition
        .get("architecture")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match (
        manifest.get("platform").and_then(Value::as_str),
        manifest.get("architecture").and_then(Value::as_str),
    ) {
        (Some(installed_platform), Some(installed_architecture)) => {
            installed_platform == platform && installed_architecture == architecture
        }
        (None, None) => architecture == "x86_64" && matches!(platform, "windows" | "linux"),
        _ => false,
    }
}

fn emu_status(state: &AppState, base: &Value, config: &Value) -> Value {
    let id = base.get("id").and_then(Value::as_str).unwrap_or_default();
    let definition = selected_definition(base, config, id);
    let manifest = read_manifest(&state.emu_dir, id);
    let exe = resolve_exe(&state.emu_dir, id, &definition, config);
    let installed = manifest.as_ref().filter(|m| {
        manifest_matches_target(m, &definition)
            && m.get("exe")
                .and_then(Value::as_str)
                .is_some_and(|exe| is_program_path(&state.emu_dir.join(id).join(exe)))
    });
    json!({
        "id": id,
        "name": definition.get("name").cloned().unwrap_or(Value::String(id.to_owned())),
        "systems": definition.get("systems").cloned().unwrap_or_else(|| json!([])),
        "repo": definition.pointer("/source/repo"),
        "custom": definition.get("custom").and_then(Value::as_bool).unwrap_or(false),
        "available": definition.get("available").and_then(Value::as_bool).unwrap_or(false),
        "platform": definition.get("platform"),
        "architecture": definition.get("architecture"),
        "prerelease": definition.pointer("/source/prerelease").and_then(Value::as_bool).unwrap_or(false) || config.pointer(&format!("/emulators/{id}/prerelease")).and_then(Value::as_bool).unwrap_or(false),
        "args": definition.get("args"),
        "exe": exe.map(|p| p.to_string_lossy().to_string()),
        "installed": installed.map(|m| json!({"version":m.get("tag"),"name":m.get("releaseName"),"date":m.get("publishedAt")})),
        "managed": definition.get("managed").and_then(Value::as_bool).unwrap_or(false)
    })
}

pub(crate) fn resolve_exe(
    emu_dir: &Path,
    id: &str,
    definition: &Value,
    config: &Value,
) -> Option<PathBuf> {
    let definition = selected_definition(definition, config, id);
    if let Some(path) = definition
        .get("exePath")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        let path = PathBuf::from(path);
        if path.is_absolute() && is_program_path(&path) {
            return Some(path);
        }
    }
    if let Some(exe) = read_manifest(emu_dir, id).and_then(|manifest| {
        manifest_matches_target(&manifest, &definition)
            .then(|| {
                manifest
                    .get("exe")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .flatten()
    }) {
        let path = emu_dir.join(id).join(exe);
        if is_program_path(&path) {
            return Some(path);
        }
    }
    config
        .get("customEmulators")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|e| e.get("id").and_then(Value::as_str) == Some(id))
        .and_then(|e| e.get("exe").and_then(Value::as_str))
        .map(PathBuf::from)
        .filter(|p| is_program_path(p))
}

fn is_program_path(path: &Path) -> bool {
    path.is_file()
        || (path.is_dir() && path.extension().and_then(|ext| ext.to_str()) == Some("app"))
}

fn manifest_path(emu_dir: &Path, id: &str) -> PathBuf {
    emu_dir.join(id).join("manifest.json")
}
fn read_manifest(emu_dir: &Path, id: &str) -> Option<Value> {
    fs::read_to_string(manifest_path(emu_dir, id))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}
fn write_manifest(emu_dir: &Path, id: &str, manifest: &Value) -> Result<(), String> {
    let dir = emu_dir.join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

async fn latest_release(id: &str, config: &Value) -> Result<Value, String> {
    let definition = find_definition(id, config).ok_or_else(|| "Unknown emulator".to_owned())?;
    latest_release_from_definition(&selected_definition(&definition, config, id), config, id).await
}

async fn latest_release_from_definition(
    definition: &Value,
    config: &Value,
    id: &str,
) -> Result<Value, String> {
    let source = definition
        .get("source")
        .filter(|v| !v.is_null())
        .ok_or_else(|| {
            "This emulator is not managed by the downloader on this platform and architecture."
                .to_owned()
        })?;
    let repo = source
        .get("repo")
        .and_then(Value::as_str)
        .ok_or("Emulator release repository is missing")?;
    let pattern = definition
        .get("asset")
        .and_then(Value::as_str)
        .ok_or("Emulator release asset pattern is missing")?;
    let regex = regex::Regex::new(&format!("(?i){pattern}")).map_err(|e| e.to_string())?;
    let prerelease = source
        .get("prerelease")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || config
            .pointer(&format!("/emulators/{id}/prerelease"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
    let client = reqwest::Client::builder()
        .user_agent("PyroCade-Frontend")
        .build()
        .map_err(|e| e.to_string())?;
    let urls = if prerelease {
        vec![format!(
            "https://api.github.com/repos/{repo}/releases?per_page=15"
        )]
    } else {
        vec![format!(
            "https://api.github.com/repos/{repo}/releases/latest"
        )]
    };
    let mut releases = Vec::new();
    for url in urls {
        let response = client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "GitHub {}: {}",
                response.status(),
                response
                    .status()
                    .canonical_reason()
                    .unwrap_or("request failed")
            ));
        }
        let value: Value = response.json().await.map_err(|e| e.to_string())?;
        if prerelease {
            releases.extend(value.as_array().cloned().unwrap_or_default());
        } else {
            releases.push(value);
        }
    }
    for release in releases {
        if release
            .get("draft")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let Some(asset) = release
            .get("assets")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|asset| {
                asset
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|n| regex.is_match(n))
            })
        else {
            continue;
        };
        let tag = release
            .get("tag_name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        return Ok(json!({
            "tag": tag,
            "releaseName": release.get("name").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(tag),
            "publishedAt": asset.get("updated_at").or_else(|| release.get("published_at")),
            "assetId": asset.get("id"), "assetName": asset.get("name"),
            "size": asset.get("size"), "url": asset.get("browser_download_url"),
            "notes": release.get("body").and_then(Value::as_str).unwrap_or("")
        }));
    }
    Err(format!(
        "No {} download matching /{pattern}/ found in recent releases.",
        if cfg!(target_os = "windows") {
            "Windows"
        } else {
            "platform"
        }
    ))
}

fn emit_progress(app: &AppHandle, value: Value) {
    let _ = app.emit("emu:progress", value);
}

fn is_archive(name: &str) -> bool {
    regex::Regex::new(r"(?i)\.(zip|7z|tar|tgz|tar\.(gz|xz|zst|bz2))$")
        .unwrap()
        .is_match(name)
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    let extension = archive
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if extension.ends_with(".zip") {
        return extract_zip(archive, destination);
    }
    let candidates: Vec<(&str, Vec<String>)> = if extension.ends_with(".7z") {
        vec![
            (
                "7z",
                vec![
                    "x".into(),
                    "-y".into(),
                    format!("-o{}", destination.display()),
                    archive.display().to_string(),
                ],
            ),
            (
                "7za",
                vec![
                    "x".into(),
                    "-y".into(),
                    format!("-o{}", destination.display()),
                    archive.display().to_string(),
                ],
            ),
        ]
    } else {
        vec![
            (
                "bsdtar",
                vec![
                    "-xf".into(),
                    archive.display().to_string(),
                    "-C".into(),
                    destination.display().to_string(),
                ],
            ),
            (
                "tar",
                vec![
                    "-xf".into(),
                    archive.display().to_string(),
                    "-C".into(),
                    destination.display().to_string(),
                ],
            ),
        ]
    };
    for (command, args) in candidates {
        match Command::new(command).args(args).status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => {
                return Err(format!(
                    "{command} could not extract the archive (exit {}).",
                    status.code().unwrap_or(-1)
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err(format!(
        "Can't unpack {}: install bsdtar or 7-Zip.",
        archive
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("archive")
    ))
}

fn validate_zip(archive: &Path) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for index in 0..zip.len() {
        let entry = zip.by_index(index).map_err(|e| e.to_string())?;
        if entry.enclosed_name().is_none() {
            return Err(format!("Unsafe path in archive: {}", entry.name()));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!(
                "Symbolic links are not allowed in archives: {}",
                entry.name()
            ));
        }
    }
    Ok(())
}

fn extract_zip(archive: &Path, destination: &Path) -> Result<(), String> {
    validate_zip(archive)?;
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/ditto")
            .args(["-x", "-k"])
            .arg(archive)
            .arg(destination)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!(
                "ditto could not extract the archive (exit {}).",
                status.code().unwrap_or(-1)
            ));
        }
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let file = File::open(archive).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| format!("Unsafe path in archive: {}", entry.name()))?;
            let target = destination.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut output = File::create(target).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{CATALOG, manifest_matches_target, selected_definition_for_target};
    use serde_json::{Value, json};

    #[test]
    fn unsupported_arm64_target_does_not_inherit_x86_downloads() {
        let base = json!({
            "id": "emu",
            "source": {"repo":"windows-x64"},
            "asset": "windows-x64.zip",
            "exe": "program.exe",
            "platforms": {
                "linux": {"x86_64": {
                    "source": {"repo":"linux-x64"},
                    "asset": "linux-x86_64.AppImage",
                    "exe": "program.AppImage"
                }}
            }
        });
        for platform in ["macos", "linux"] {
            let selected =
                selected_definition_for_target(&base, &json!({}), "emu", platform, "arm64");

            assert_eq!(selected["available"], false);
            assert_eq!(selected["managed"], false);
            assert_eq!(selected["source"], Value::Null);
            assert_eq!(selected["asset"], Value::Null);
            assert_eq!(selected["exe"], Value::Null);
        }
    }

    #[test]
    fn arm64_catalog_download_and_manual_link_remain_distinct() {
        let base = json!({
            "id": "emu",
            "platforms": {"linux": {"arm64": {
                "source": {"repo":"linux-arm64"},
                "asset": "linux-aarch64.AppImage",
                "exe": "program.AppImage"
            }}}
        });
        let config = json!({"emulators":{"emu":{"exe":"/custom/program"}}});
        let selected = selected_definition_for_target(&base, &config, "emu", "linux", "arm64");

        assert_eq!(selected["available"], true);
        assert_eq!(selected["managed"], true);
        assert_eq!(selected["asset"], "linux-aarch64.AppImage");
        assert_eq!(selected["exe"], "program.AppImage");
        assert_eq!(selected["exePath"], "/custom/program");
    }

    #[test]
    fn legacy_manifests_are_trusted_only_on_x86_64_desktop_targets() {
        let legacy = json!({"exe":"program.AppImage"});
        assert!(manifest_matches_target(
            &legacy,
            &json!({"platform":"linux","architecture":"x86_64"})
        ));
        assert!(!manifest_matches_target(
            &legacy,
            &json!({"platform":"linux","architecture":"arm64"})
        ));
    }

    #[test]
    fn catalog_has_managed_macos_and_linux_arm64_builds() {
        let catalog: Vec<Value> = serde_json::from_str(CATALOG).unwrap();
        for id in [
            "duckstation",
            "pcsx2",
            "ppsspp",
            "azahar",
            "melonds",
            "xemu",
            "flycast",
            "shadps4",
        ] {
            let base = catalog
                .iter()
                .find(|entry| entry.get("id").and_then(Value::as_str) == Some(id))
                .unwrap();
            let selected = selected_definition_for_target(base, &json!({}), id, "macos", "arm64");
            assert_eq!(selected["managed"], true, "macOS ARM64 {id}");
            assert!(selected["appBundle"].is_string(), "macOS app bundle {id}");
        }
        for id in ["duckstation", "ppsspp", "melonds", "mgba", "xemu"] {
            let base = catalog
                .iter()
                .find(|entry| entry.get("id").and_then(Value::as_str) == Some(id))
                .unwrap();
            let selected = selected_definition_for_target(base, &json!({}), id, "linux", "arm64");
            assert_eq!(selected["managed"], true, "Linux ARM64 {id}");
        }
    }

    #[test]
    fn catalog_patterns_compile_with_the_runtime_regex_engine() {
        let catalog: Vec<Value> = serde_json::from_str(CATALOG).unwrap();
        for entry in catalog {
            let platforms = entry["platforms"].as_object().unwrap();
            for architectures in platforms.values() {
                for target in architectures.as_object().unwrap().values() {
                    for key in ["asset", "exe", "appBundle"] {
                        if let Some(pattern) = target.get(key).and_then(Value::as_str) {
                            regex::Regex::new(&format!("(?i){pattern}")).unwrap();
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn zip_archives_with_parent_paths_are_rejected() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../localTmp")
            .join(format!("pyrocade-archive-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("escape.zip");
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&archive_path).unwrap());
        archive
            .start_file("../outside", zip::write::SimpleFileOptions::default())
            .unwrap();
        std::io::Write::write_all(&mut archive, b"outside").unwrap();
        archive.finish().unwrap();

        let result = super::extract_archive(&archive_path, &root.join("unpacked"));

        let _ = std::fs::remove_dir_all(&root);
        assert!(result.is_err(), "parent paths must not be extracted");
    }
}

fn one_wrapping_directory(path: &Path) -> PathBuf {
    let Ok(entries) = fs::read_dir(path) else {
        return path.to_path_buf();
    };
    let entries: Vec<_> = entries.filter_map(Result::ok).collect();
    if entries.len() == 1 && entries[0].file_type().is_ok_and(|t| t.is_dir()) {
        let wrapper = entries[0].path();
        if wrapper.extension().and_then(|ext| ext.to_str()) == Some("app") {
            path.to_path_buf()
        } else {
            wrapper
        }
    } else {
        path.to_path_buf()
    }
}

fn find_program(root: &Path, regex: &regex::Regex) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(dir).ok()?.filter_map(Result::ok) {
            let path = entry.path();
            if entry.file_type().ok()?.is_dir() {
                stack.push(path);
            } else if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| regex.is_match(n))
            {
                return Some(path);
            }
        }
    }
    None
}

fn find_app_bundle(root: &Path, regex: &regex::Regex) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(dir).ok()?.filter_map(Result::ok) {
            let path = entry.path();
            if entry.file_type().ok()?.is_dir() {
                if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| regex.is_match(n))
                    && path.join("Contents/MacOS").is_dir()
                {
                    return Some(path);
                }
                stack.push(path);
            }
        }
    }
    None
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in walkdir::WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|e| e.to_string())?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_symlink() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let link = fs::read_link(entry.path()).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(link, target).map_err(|e| e.to_string())?;
            #[cfg(windows)]
            if entry.path().is_dir() {
                std::os::windows::fs::symlink_dir(link, target).map_err(|e| e.to_string())?;
            } else {
                std::os::windows::fs::symlink_file(link, target).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn set_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).map_err(|e| e.to_string())?;
    }
    Ok(())
}
