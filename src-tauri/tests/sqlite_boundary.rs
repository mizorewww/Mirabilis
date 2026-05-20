use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

#[test]
fn sqlite_task_013_does_not_expose_frontend_raw_sql_ipc_or_capabilities() -> TestResult {
    let repo_root = repo_root();
    let tauri_root = repo_root.join("src-tauri");

    assert_no_tauri_sql_plugin_dependency(&[
        repo_root.join("package.json"),
        repo_root.join("bun.lock"),
        tauri_root.join("Cargo.toml"),
        tauri_root.join("Cargo.lock"),
        tauri_root.join("tauri.conf.json"),
        tauri_root.join("capabilities/default.json"),
    ])?;

    let lib_rs = read_to_string(tauri_root.join("src/lib.rs"))?;
    assert!(
        !lib_rs.contains("db_execute") && !lib_rs.contains("db_transaction"),
        "TASK-013 must not register db_execute/db_transaction IPC commands in src-tauri/src/lib.rs",
    );
    assert!(
        !lib_rs.contains("tauri::generate_handler![db_")
            && !lib_rs.contains("tauri::generate_handler![ db_"),
        "TASK-013 must not add database invoke handlers",
    );

    let capability_path = tauri_root.join("capabilities/default.json");
    let capability_text = read_to_string(&capability_path)?;
    let capability_json: Value = serde_json::from_str(&capability_text)?;
    let permissions = capability_json
        .get("permissions")
        .and_then(Value::as_array)
        .expect("default capability should declare permissions")
        .iter()
        .map(|permission| {
            permission
                .as_str()
                .expect("capability permission should be a string")
                .to_string()
        })
        .collect::<Vec<_>>();
    assert_eq!(
        permissions,
        vec!["core:default".to_string(), "opener:default".to_string()],
        "TASK-013 must not add SQL or database permissions to the default capability",
    );
    assert!(
        !capability_text.to_lowercase().contains("sql"),
        "TASK-013 must not add SQL capability permissions",
    );

    let native_bridge = read_to_string(repo_root.join("src/core/native/native-bridge.ts"))?;
    let db_query = native_bridge
        .split("export type DbQuery =")
        .nth(1)
        .and_then(|tail| tail.split("};").next())
        .expect("NativeBridge should export DbQuery");
    assert!(
        db_query.contains("operation: string"),
        "DbQuery must remain an operation DTO",
    );
    assert!(
        db_query.contains("payload?: DbValue"),
        "DbQuery should carry JSON-compatible operation payloads",
    );
    assert!(
        !db_query.contains("sql") && !db_query.contains("params"),
        "TASK-013 must not add raw sql/params fields to the TypeScript DbQuery contract",
    );

    Ok(())
}

fn assert_no_tauri_sql_plugin_dependency(paths: &[PathBuf]) -> TestResult {
    for path in paths {
        if !path.exists() {
            continue;
        }

        let contents = read_to_string(path)?;
        assert!(
            !contents.contains("@tauri-apps/plugin-sql")
                && !contents.contains("tauri-plugin-sql")
                && !contents.contains("tauri_plugin_sql"),
            "TASK-013 must not add Tauri SQL plugin dependency or config in {}",
            path.display(),
        );
    }

    Ok(())
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should have a repository parent")
        .to_path_buf()
}

fn read_to_string(path: impl AsRef<Path>) -> TestResult<String> {
    Ok(fs::read_to_string(path)?)
}
