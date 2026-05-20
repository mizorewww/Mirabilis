use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

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
    assert_db_query_has_no_raw_sql_fields(db_query);

    Ok(())
}

#[test]
fn sqlite_boundary_capability_scan_tolerates_non_sql_object_permissions() -> TestResult {
    let reviewed_non_sql_capability = json!({
        "permissions": [
            "core:default",
            {
                "identifier": "fs:allow-app-config",
                "scope": {"allow": ["$APPDATA/mirabilis/**"]}
            },
            {
                "id": "notification:allow-send",
                "name": "Reviewed non-SQL object permission",
                "permission": {"nested": "objects are ignored unless reviewed SQL marker fields are strings"}
            },
            42,
            null
        ]
    });

    assert_no_tauri_sql_permission_markers(&reviewed_non_sql_capability, "inline capability")?;

    let sql_capability = json!({
        "permissions": [
            {"identifier": "sql:allow-execute"},
            {"name": "tauri-plugin-sql"}
        ]
    });

    assert!(
        assert_no_tauri_sql_permission_markers(&sql_capability, "inline capability").is_err(),
        "SQL plugin markers in object permission id/name/identifier/permission fields must be rejected"
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
    assert_no_tauri_sql_permission_markers(&capability_json, &capability_path.display().to_string())
}

fn assert_no_tauri_sql_permission_markers(capability_json: &Value, source: &str) -> TestResult {
    let permissions = capability_json.get("permissions").and_then(Value::as_array);

    let Some(permissions) = permissions else {
        return Ok(());
    };

    for permission in permissions {
        if let Some(marker) = sql_permission_marker(permission) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "Mirabilis must not enable Tauri SQL plugin capability permissions in {source}: {marker}"
                ),
            )
            .into());
        }
    }

    Ok(())
}

fn sql_permission_marker(permission: &Value) -> Option<String> {
    match permission {
        Value::String(permission) => {
            contains_sql_permission_marker(permission).then(|| permission.to_string())
        }
        Value::Object(permission) => ["id", "name", "identifier", "permission"]
            .into_iter()
            .filter_map(|field| permission.get(field).and_then(Value::as_str))
            .find(|value| contains_sql_permission_marker(value))
            .map(ToString::to_string),
        _ => None,
    }
}

fn contains_sql_permission_marker(permission: &str) -> bool {
    let normalized = permission.to_ascii_lowercase();
    normalized.starts_with("sql:")
        || normalized.contains("tauri-plugin-sql")
        || normalized.contains("plugin-sql")
}

fn assert_db_query_has_no_raw_sql_fields(db_query: &str) {
    for field in db_query.split(['\n', ';', ',']) {
        let field = field
            .trim()
            .trim_start_matches('{')
            .trim_start()
            .trim_start_matches("readonly ");
        let field_name = field
            .split(':')
            .next()
            .unwrap_or(field)
            .trim()
            .trim_end_matches('?');
        assert!(
            field_name != "sql" && field_name != "params",
            "DbQuery must not add raw sql/params fields to the TypeScript contract: {field}",
        );
    }
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
