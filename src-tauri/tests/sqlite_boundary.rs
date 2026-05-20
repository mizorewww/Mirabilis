use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

#[test]
fn sqlite_boundary_keeps_frontend_sql_access_private() -> TestResult {
    let repo_root = repo_root();
    let tauri_root = repo_root.join("src-tauri");
    let capability_paths = capability_paths(&tauri_root.join("capabilities"))?;

    let mut tauri_sql_scan_paths = vec![
        repo_root.join("package.json"),
        repo_root.join("bun.lock"),
        tauri_root.join("Cargo.toml"),
        tauri_root.join("Cargo.lock"),
        tauri_root.join("tauri.conf.json"),
    ];
    tauri_sql_scan_paths.extend(capability_paths.iter().cloned());
    assert_no_tauri_sql_plugin_dependency(&tauri_sql_scan_paths)?;

    for capability_path in &capability_paths {
        assert_no_tauri_sql_capability_permissions(capability_path)?;
    }

    let native_bridge = read_to_string(repo_root.join("src/core/native/native-bridge.ts"))?;
    let db_query = native_bridge
        .split("export type DbQuery =")
        .nth(1)
        .and_then(|tail| tail.split("};").next())
        .expect("NativeBridge should export DbQuery");
    assert!(
        db_query.contains("operation: string"),
        "DbQuery should expose operation names, not SQL statements",
    );
    assert!(
        db_query.contains("payload?: DbValue"),
        "DbQuery should carry JSON-compatible operation payloads",
    );
    assert!(
        !db_query.contains("sql") && !db_query.contains("params"),
        "DbQuery must not add raw sql/params fields to the TypeScript contract",
    );

    Ok(())
}

fn capability_paths(capabilities_dir: &Path) -> TestResult<Vec<PathBuf>> {
    if !capabilities_dir.exists() {
        return Ok(Vec::new());
    }

    let mut paths = fs::read_dir(capabilities_dir)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
    paths.retain(|path| path.extension().and_then(|extension| extension.to_str()) == Some("json"));
    paths.sort();
    Ok(paths)
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
            "Mirabilis must not add Tauri SQL plugin dependency or config in {}",
            path.display(),
        );
    }

    Ok(())
}

fn assert_no_tauri_sql_capability_permissions(capability_path: &Path) -> TestResult {
    let capability_text = read_to_string(capability_path)?;
    let capability_json: Value = serde_json::from_str(&capability_text)?;
    let permissions = capability_json.get("permissions").and_then(Value::as_array);

    let Some(permissions) = permissions else {
        return Ok(());
    };

    for permission in permissions {
        let permission = permission
            .as_str()
            .expect("capability permission should be a string");
        let normalized = permission.to_ascii_lowercase();
        assert!(
            !normalized.starts_with("sql:")
                && !normalized.contains("tauri-plugin-sql")
                && !normalized.contains("plugin-sql"),
            "Mirabilis must not enable Tauri SQL plugin capability permissions in {}: {permission}",
            capability_path.display(),
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
