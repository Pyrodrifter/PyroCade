use serde_json::{Value, json};
use std::fs;
use std::path::Path;

const SYSTEMS: &str = r###"[
  {"id":"ps1","name":"PlayStation","caseType":"jewel","media":"disc","color":"#9aa3ad","extensions":[".m3u",".cue",".chd",".pbp"],"emulator":"duckstation","libretro":"Sony - PlayStation"},
  {"id":"ps2","name":"PlayStation 2","caseType":"dvd","media":"disc","color":"#1d3f8f","extensions":[".iso",".chd",".cso",".gz"],"emulator":"pcsx2","libretro":"Sony - PlayStation 2"},
  {"id":"ps3","name":"PlayStation 3","caseType":"bluray","media":"disc","color":"#2b2b2b","extensions":[".iso"],"emulator":"rpcs3","libretro":"Sony - PlayStation 3"},
  {"id":"ps4","name":"PlayStation 4","caseType":"bluray","media":"disc","color":"#1a4fb5","extensions":[".pkg"],"emulator":"shadps4"},
  {"id":"psp","name":"PSP","caseType":"umd","media":"disc","color":"#111111","extensions":[".iso",".cso",".chd"],"emulator":"ppsspp","libretro":"Sony - PlayStation Portable"},
  {"id":"switch","name":"Nintendo Switch","caseType":"switch","media":"cart","color":"#e60012","extensions":[".nsp",".xci",".nsz"],"emulator":"","artworkProvider":"gametdb-switch"},
  {"id":"switch2","name":"Nintendo Switch 2","caseType":"switch","media":"cart","color":"#d0021b","extensions":[".nsp",".xci",".nsz",".xcz",".nup"],"emulator":"","artworkProvider":"gametdb-switch"},
  {"id":"wiiu","name":"Wii U","caseType":"dvd","media":"disc","color":"#1a9ad6","extensions":[".wua",".wud",".wux",".rpx"],"emulator":"cemu","libretro":"Nintendo - Wii U"},
  {"id":"wii","name":"Wii","caseType":"dvd","media":"disc","color":"#e9eef2","extensions":[".rvz",".wbfs",".iso"],"emulator":"","libretro":"Nintendo - Wii"},
  {"id":"gc","name":"GameCube","caseType":"gc","media":"disc","color":"#5a4a9c","extensions":[".rvz",".iso",".gcm",".ciso"],"emulator":"","libretro":"Nintendo - GameCube"},
  {"id":"n64","name":"Nintendo 64","caseType":"bigbox","media":"cart","color":"#2a7d3a","extensions":[".z64",".n64",".v64"],"emulator":"","libretro":"Nintendo - Nintendo 64"},
  {"id":"snes","name":"Super Nintendo","caseType":"bigbox","media":"cart","color":"#7b6fb5","extensions":[".sfc",".smc"],"emulator":"","libretro":"Nintendo - Super Nintendo Entertainment System"},
  {"id":"nes","name":"NES","caseType":"nesbox","media":"cart","color":"#c4262e","extensions":[".nes",".zip"],"emulator":"","libretro":"Nintendo - Nintendo Entertainment System"},
  {"id":"3ds","name":"Nintendo 3DS","caseType":"ds","media":"cart","color":"#d41e2a","extensions":[".3ds",".cci",".cxi",".cia"],"emulator":"azahar","libretro":"Nintendo - Nintendo 3DS"},
  {"id":"nds","name":"Nintendo DS","caseType":"ds","media":"cart","color":"#c9c9c9","extensions":[".nds",".zip"],"emulator":"melonds","libretro":"Nintendo - Nintendo DS"},
  {"id":"gba","name":"Game Boy Advance","caseType":"cartbox","media":"cart","color":"#4b3a9b","extensions":[".gba",".zip"],"emulator":"mgba","libretro":"Nintendo - Game Boy Advance"},
  {"id":"gbc","name":"Game Boy Color","caseType":"cartbox","media":"cart","color":"#7a3fb0","extensions":[".gbc",".zip"],"emulator":"mgba","libretro":"Nintendo - Game Boy Color"},
  {"id":"gb","name":"Game Boy","caseType":"cartbox","media":"cart","color":"#8b8f6a","extensions":[".gb",".zip"],"emulator":"mgba","libretro":"Nintendo - Game Boy"},
  {"id":"dreamcast","name":"Dreamcast","caseType":"jewel","media":"disc","color":"#e8e8e8","extensions":[".chd",".gdi",".cdi"],"emulator":"flycast","libretro":"Sega - Dreamcast"},
  {"id":"genesis","name":"Sega Genesis","caseType":"dvd","media":"cart","color":"#1b1b1b","extensions":[".md",".gen",".smd",".zip"],"emulator":"","libretro":"Sega - Mega Drive - Genesis"},
  {"id":"xbox","name":"Xbox","caseType":"dvd","media":"disc","color":"#1c8a2e","extensions":[".iso",".xiso"],"emulator":"xemu","libretro":"Microsoft - Xbox"},
  {"id":"x360","name":"Xbox 360","caseType":"dvd","media":"disc","color":"#7cbb00","extensions":[".iso",".xex",".zar"],"emulator":"","libretro":"Microsoft - Xbox 360"},
  {"id":"pc","name":"PC Games","caseType":"dvd","media":"disc","color":"#3b82f6","extensions":[".lnk",".url",".exe"],"emulator":"","direct":true},
  {"id":"a2600","name":"Atari 2600","caseType":"nesbox","media":"cart","color":"#a0522d","extensions":[".a26",".zip"],"emulator":"","libretro":"Atari - 2600"},
  {"id":"arcade","name":"Arcade","caseType":"bigbox","media":"cart","color":"#d4a017","extensions":[".zip"],"emulator":"","libretro":"MAME"}
]"###;

pub fn default_config() -> Value {
    json!({
        "mediaRoot": "",
        "hideWhilePlaying": true,
        "checkUpdates": true,
        "promptFamily": "auto",
        "motion": "auto",
        "eShopStyle": "enhanced",
        "libraryTheme": "ember",
        "libraryLayout": "carousel",
        "uiSound": {"enabled": true, "volume": 0.25},
        "systems": serde_json::from_str::<Value>(SYSTEMS).expect("default systems JSON is valid").as_array().unwrap().iter().map(|s| {
            let mut system = s.clone();
            system["romDir"] = Value::String(String::new());
            system
        }).collect::<Vec<_>>(),
        "emulators": {},
        "customEmulators": [],
        "extraGames": [],
        "favorites": [],
        "hiddenGames": [],
        "gameDetails": {},
        "gameEmulators": {},
        "gameOrders": {},
        "recentlyPlayed": [],
        "sortKey": "title",
        "sortAsc": true,
        "showFavoritesOnly": false,
        "showRecentlyPlayed": false,
        "recentlyPlayedLimit": 20,
        "migrations": []
    })
}

pub fn merge_config(saved: Value) -> Result<Value, String> {
    let saved_systems = saved
        .get("systems")
        .and_then(Value::as_array)
        .ok_or_else(|| "missing systems".to_owned())?;
    let mut merged = default_config();
    let defaults = merged["systems"].as_array().cloned().unwrap_or_default();
    let mut systems = Vec::with_capacity(saved_systems.len().max(defaults.len()));
    for existing in saved_systems {
        let id = existing.get("id").and_then(Value::as_str);
        let mut system = defaults
            .iter()
            .find(|d| d.get("id").and_then(Value::as_str) == id)
            .cloned()
            .unwrap_or_else(|| json!({}));
        merge_object(&mut system, existing);
        systems.push(system);
    }
    for default in defaults {
        if !systems.iter().any(|s| s.get("id") == default.get("id")) {
            systems.push(default);
        }
    }
    let mut saved_other = saved.clone();
    if let Some(object) = saved_other.as_object_mut() {
        object.remove("systems");
    }
    merge_object(&mut merged, &saved_other);
    merged["systems"] = Value::Array(systems);
    if let Some(map) = merged.get_mut("emulators") {
        if !map.is_object() {
            *map = json!({});
        }
    }
    if !merged.get("customEmulators").is_some_and(Value::is_array) {
        merged["customEmulators"] = json!([]);
    }
    // Preserve library state fields from saved config.
    if !merged.get("favorites").is_some_and(Value::is_array) {
        merged["favorites"] = saved.get("favorites").cloned().unwrap_or_else(|| json!([]));
    }
    if !merged.get("hiddenGames").is_some_and(Value::is_array) {
        merged["hiddenGames"] = saved
            .get("hiddenGames")
            .cloned()
            .unwrap_or_else(|| json!([]));
    }
    if !merged.get("gameDetails").is_some_and(Value::is_object) {
        merged["gameDetails"] = saved
            .get("gameDetails")
            .cloned()
            .unwrap_or_else(|| json!({}));
    }
    if !merged.get("gameEmulators").is_some_and(Value::is_object) {
        merged["gameEmulators"] = saved
            .get("gameEmulators")
            .cloned()
            .unwrap_or_else(|| json!({}));
    }
    if !merged.get("gameOrders").is_some_and(Value::is_object) {
        merged["gameOrders"] = saved
            .get("gameOrders")
            .cloned()
            .unwrap_or_else(|| json!({}));
    }
    if !merged.get("recentlyPlayed").is_some_and(Value::is_array) {
        merged["recentlyPlayed"] = saved
            .get("recentlyPlayed")
            .cloned()
            .unwrap_or_else(|| json!([]));
    }
    if merged.get("sortKey").is_none_or(|v| !v.is_string()) {
        merged["sortKey"] = saved
            .get("sortKey")
            .cloned()
            .unwrap_or_else(|| json!("title"));
    }
    if merged.get("sortAsc").is_none_or(|v| !v.is_boolean()) {
        merged["sortAsc"] = saved.get("sortAsc").cloned().unwrap_or_else(|| json!(true));
    }
    if merged
        .get("showFavoritesOnly")
        .is_none_or(|v| !v.is_boolean())
    {
        merged["showFavoritesOnly"] = saved
            .get("showFavoritesOnly")
            .cloned()
            .unwrap_or_else(|| json!(false));
    }
    if merged
        .get("showRecentlyPlayed")
        .is_none_or(|v| !v.is_boolean())
    {
        merged["showRecentlyPlayed"] = saved
            .get("showRecentlyPlayed")
            .cloned()
            .unwrap_or_else(|| json!(false));
    }
    if merged
        .get("recentlyPlayedLimit")
        .is_none_or(|v| !v.is_number())
    {
        merged["recentlyPlayedLimit"] = saved
            .get("recentlyPlayedLimit")
            .cloned()
            .unwrap_or_else(|| json!(20));
    }
    if !merged.get("migrations").is_some_and(Value::is_array) {
        merged["migrations"] = saved
            .get("migrations")
            .cloned()
            .unwrap_or_else(|| json!([]));
    }
    // One-time file-type migration; a type the user removes afterwards stays removed.
    let mut done: Vec<String> = merged["migrations"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if !done.contains(&"ext-switch2-nup".to_owned()) {
        if let Some(switch2) = merged["systems"].as_array_mut().and_then(|s| {
            s.iter_mut()
                .find(|s| s.get("id").and_then(Value::as_str) == Some("switch2"))
        }) {
            let extensions = switch2
                .as_object_mut()
                .map(|o| o.entry("extensions").or_insert_with(|| json!([])).clone())
                .unwrap_or_else(|| json!([]));
            let needs_nup = !extensions
                .as_array()
                .is_some_and(|e| e.iter().any(|v| v == ".nup"));
            if needs_nup {
                if let Some(object) = switch2.as_object_mut() {
                    if let Some(e) = object.get_mut("extensions").and_then(Value::as_array_mut) {
                        e.push(json!(".nup"));
                    } else {
                        object.insert("extensions".to_owned(), json!([".nup"]));
                    }
                }
            }
        }
        done.push("ext-switch2-nup".to_owned());
        merged["migrations"] = json!(done);
    }
    Ok(merged)
}

pub fn config_for_save(incoming: Value, current: &Value) -> Result<Value, String> {
    if !incoming.get("systems").is_some_and(Value::is_array) {
        return Err("Invalid settings".to_owned());
    }
    let mut next = incoming;
    next["emulators"] = current
        .get("emulators")
        .cloned()
        .unwrap_or_else(|| json!({}));
    next["customEmulators"] = current
        .get("customEmulators")
        .cloned()
        .unwrap_or_else(|| json!([]));
    next["extraGames"] = current
        .get("extraGames")
        .cloned()
        .unwrap_or_else(|| json!([]));
    // Preserve library state fields from current config.
    next["favorites"] = current
        .get("favorites")
        .cloned()
        .unwrap_or_else(|| json!([]));
    next["hiddenGames"] = current
        .get("hiddenGames")
        .cloned()
        .unwrap_or_else(|| json!([]));
    next["gameDetails"] = current
        .get("gameDetails")
        .cloned()
        .unwrap_or_else(|| json!({}));
    next["gameEmulators"] = current
        .get("gameEmulators")
        .cloned()
        .unwrap_or_else(|| json!({}));
    next["gameOrders"] = current
        .get("gameOrders")
        .cloned()
        .unwrap_or_else(|| json!({}));
    next["recentlyPlayed"] = current
        .get("recentlyPlayed")
        .cloned()
        .unwrap_or_else(|| json!([]));
    next["sortKey"] = current
        .get("sortKey")
        .cloned()
        .unwrap_or_else(|| json!("title"));
    next["sortAsc"] = current
        .get("sortAsc")
        .cloned()
        .unwrap_or_else(|| json!(true));
    next["showFavoritesOnly"] = current
        .get("showFavoritesOnly")
        .cloned()
        .unwrap_or_else(|| json!(false));
    next["showRecentlyPlayed"] = current
        .get("showRecentlyPlayed")
        .cloned()
        .unwrap_or_else(|| json!(false));
    next["recentlyPlayedLimit"] = current
        .get("recentlyPlayedLimit")
        .cloned()
        .unwrap_or_else(|| json!(20));
    next["migrations"] = current
        .get("migrations")
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(next)
}

fn merge_object(target: &mut Value, source: &Value) {
    let (Some(target), Some(source)) = (target.as_object_mut(), source.as_object()) else {
        return;
    };
    for (key, value) in source {
        if value.is_object() && target.get(key).is_some_and(Value::is_object) {
            merge_object(target.get_mut(key).unwrap(), value);
        } else {
            target.insert(key.clone(), value.clone());
        }
    }
}

pub fn load_config(path: &Path) -> (Value, Option<String>) {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) => return (default_config(), None),
    };
    let parsed = serde_json::from_str::<Value>(&text)
        .map_err(|e| e.to_string())
        .and_then(merge_config);
    match parsed {
        Ok(config) => (config, None),
        Err(error) => {
            let backup = path.with_file_name(format!(
                "config.json.broken-{}",
                chrono::Utc::now().timestamp_millis()
            ));
            let _ = fs::copy(path, &backup);
            let warning = format!(
                "Your settings file was damaged, so defaults were loaded. The old file was kept as {} in the data folder.",
                backup
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("config.json.broken")
            );
            let _ = error;
            (default_config(), Some(warning))
        }
    }
}

pub fn save_config(path: &Path, config: &Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().unwrap_or_else(|| Path::new(".")))
        .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_include_the_current_system_catalog() {
        let config = default_config();
        assert_eq!(config["systems"].as_array().unwrap().len(), 25);
        assert_eq!(config["systems"][0]["romDir"], "");
        assert_eq!(config["uiSound"]["volume"], 0.25);
        assert_eq!(config["extraGames"], json!([]));
        assert_eq!(config["hiddenGames"], json!([]));
        assert_eq!(config["gameDetails"], json!({}));
        assert_eq!(config["gameEmulators"], json!({}));
        assert_eq!(config["gameOrders"], json!({}));
        let pc = config["systems"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == "pc")
            .expect("pc system");
        assert_eq!(pc["direct"], true);
        assert_eq!(pc["extensions"], json!([".lnk", ".url", ".exe"]));
        let switch2 = config["systems"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == "switch2")
            .expect("switch2 system");
        assert!(
            switch2["extensions"]
                .as_array()
                .unwrap()
                .contains(&json!(".nup"))
        );
        assert_eq!(config["migrations"], json!([]));
    }

    #[test]
    fn merge_preserves_collection_state() {
        let saved = json!({
            "systems": [],
            "hiddenGames": ["ps1:zelda"],
            "gameDetails": {"ps1:zelda": {"title": "Custom", "version": "1.01", "mediaType": "disc"}},
            "gameEmulators": {"ps1:zelda": "duckstation"},
            "gameOrders": {"ps1": ["ps1:zelda", "ps1:crc"]}
        });
        let merged = merge_config(saved).unwrap();
        assert_eq!(merged["hiddenGames"], json!(["ps1:zelda"]));
        assert_eq!(merged["gameDetails"]["ps1:zelda"]["title"], "Custom");
        assert_eq!(merged["gameEmulators"]["ps1:zelda"], "duckstation");
        assert_eq!(merged["gameOrders"]["ps1"], json!(["ps1:zelda", "ps1:crc"]));
    }

    #[test]
    fn merge_preserves_user_values_and_adds_new_default_systems() {
        let saved = json!({
            "mediaRoot": "/media/art",
            "systems": [{"id":"ps1","romDir":"/roms/ps1","name":"My PlayStation"}],
            "emulators": {"duckstation":{"exe":"/opt/duckstation"}},
            "customEmulators": [{"id":"custom-one"}]
        });
        let merged = merge_config(saved).unwrap();
        assert_eq!(merged["mediaRoot"], "/media/art");
        assert_eq!(merged["systems"][0]["romDir"], "/roms/ps1");
        assert_eq!(merged["systems"][0]["name"], "My PlayStation");
        assert_eq!(merged["systems"].as_array().unwrap().len(), 25);
        assert_eq!(merged["customEmulators"][0]["id"], "custom-one");
        assert!(
            merged["systems"]
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s["id"] == "pc")
        );
    }

    #[test]
    fn merge_preserves_saf_document_tree_uris() {
        let saved = json!({
            "systems": [{"id":"ps1","romDir":"content://com.android.externalstorage.documents/tree/abc"}]
        });
        let merged = merge_config(saved).unwrap();
        assert_eq!(
            merged["systems"][0]["romDir"],
            "content://com.android.externalstorage.documents/tree/abc"
        );
    }

    #[test]
    fn merge_migrates_switch2_nup_once() {
        let saved = json!({
            "systems": [
                {"id":"switch2","romDir":"/roms","extensions":[".nsp",".xci",".nsz",".xcz"]}
            ]
        });
        let merged = merge_config(saved).unwrap();
        let switch2 = merged["systems"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == "switch2")
            .unwrap();
        assert!(
            switch2["extensions"]
                .as_array()
                .unwrap()
                .contains(&json!(".nup"))
        );
        assert!(
            merged["migrations"]
                .as_array()
                .unwrap()
                .contains(&json!("ext-switch2-nup"))
        );
        // A user-removed type stays removed once the migration has run.
        let saved2 = json!({
            "systems": [
                {"id":"switch2","romDir":"/roms","extensions":[".nsp"]}
            ],
            "migrations": ["ext-switch2-nup"]
        });
        let merged2 = merge_config(saved2).unwrap();
        let switch2b = merged2["systems"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == "switch2")
            .unwrap();
        assert_eq!(switch2b["extensions"], json!([".nsp"]));
    }

    #[test]
    fn renderer_settings_cannot_overwrite_backend_owned_emulator_state() {
        let current = json!({"emulators":{"one":{"exe":"/safe/path"}},"customEmulators":[{"id":"local"}],"migrations":["ext-switch2-nup"]});
        let next = config_for_save(
            json!({"systems":[],"emulators":{},"customEmulators":[],"migrations":[]}),
            &current,
        )
        .unwrap();
        assert_eq!(next["emulators"]["one"]["exe"], "/safe/path");
        assert_eq!(next["customEmulators"][0]["id"], "local");
        assert_eq!(next["migrations"], json!(["ext-switch2-nup"]));
    }

    #[test]
    fn renderer_settings_cannot_overwrite_collection_state() {
        let current = json!({
            "hiddenGames": ["ps1:zelda"],
            "gameDetails": {"ps1:zelda": {"title": "Custom"}},
            "gameEmulators": {"ps1:zelda": "duckstation"},
            "gameOrders": {"ps1": ["ps1:zelda"]}
        });
        let next = config_for_save(
            json!({"systems":[], "hiddenGames": [], "gameDetails": {}, "gameEmulators": {}, "gameOrders": {}}),
            &current,
        )
        .unwrap();
        assert_eq!(next["hiddenGames"], json!(["ps1:zelda"]));
        assert_eq!(next["gameDetails"]["ps1:zelda"]["title"], "Custom");
        assert_eq!(next["gameEmulators"]["ps1:zelda"], "duckstation");
        assert_eq!(next["gameOrders"]["ps1"], json!(["ps1:zelda"]));
    }
}
