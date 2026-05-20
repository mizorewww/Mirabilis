fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["db_execute", "db_transaction"]),
        ),
    )
    .expect("failed to build Tauri application manifest")
}
