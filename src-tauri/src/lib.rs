pub mod commands;
pub mod db;

use commands::db::DbCommandState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let state = DbCommandState::open(app_data_dir.join("mirabilis.sqlite3"))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db::db_execute,
            commands::db::db_transaction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
