fn main() {
    // The renderer is embedded at compile time, so a renderer-only edit needs a crate rebuild
    // to reach the binary; without this cargo reuses the previous embed and ships stale UI.
    println!("cargo:rerun-if-changed=../renderer");
    tauri_build::build()
}
