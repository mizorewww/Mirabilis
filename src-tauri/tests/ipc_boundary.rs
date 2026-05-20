use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

#[test]
fn ipc_boundary_registers_only_reviewed_persistence_commands() -> TestResult {
    let repo_root = repo_root();
    let lib_rs = read_to_string(repo_root.join("src-tauri/src/lib.rs"))?;
    let handler_body = extract_generate_handler_body(&lib_rs)
        .expect("Tauri invoke_handler should register reviewed app commands");

    let mut violations = Vec::new();
    if lib_rs.contains("fn greet") || handler_body.contains("greet") {
        violations.push("remove scaffold greet command and handler registration".to_string());
    }
    for expected_command in ["db_execute", "db_transaction"] {
        if !handler_body.contains(expected_command) {
            violations.push(format!(
                "missing reviewed command registration: {expected_command}"
            ));
        }
    }
    for forbidden_command in [
        "shortcuts_register",
        "shortcuts_unregister",
        "notifications_notify",
        "files_import_markdown",
        "files_export_markdown",
    ] {
        if handler_body.contains(forbidden_command) {
            violations.push(format!(
                "unrelated command registered during TASK-014: {forbidden_command}"
            ));
        }
    }
    assert_eq!(
        lib_rs.matches(".invoke_handler(").count(),
        1,
        "Mirabilis should keep one reviewed Tauri invoke_handler registration"
    );
    assert_eq!(violations, Vec::<String>::new());

    Ok(())
}

#[test]
fn ipc_capabilities_are_narrow_and_review_db_command_exposure() -> TestResult {
    let repo_root = repo_root();
    let tauri_root = repo_root.join("src-tauri");
    let capability_paths = capability_paths(&tauri_root.join("capabilities"))?;

    let mut sql_scan_paths = vec![
        repo_root.join("package.json"),
        repo_root.join("bun.lock"),
        tauri_root.join("Cargo.toml"),
        tauri_root.join("Cargo.lock"),
        tauri_root.join("tauri.conf.json"),
    ];
    sql_scan_paths.extend(capability_paths.iter().cloned());
    assert_no_tauri_sql_plugin_or_permission_markers(&sql_scan_paths)?;

    for capability_path in &capability_paths {
        let capability_json = parse_json_file(capability_path)?;
        assert_no_wildcard_windows(&capability_json, capability_path)?;
        assert_no_unrelated_broad_permissions(&capability_json, capability_path)?;
    }

    assert_reviewed_db_command_exposure(&repo_root, &capability_paths)?;

    Ok(())
}

#[test]
fn ipc_boundary_does_not_add_raw_sql_or_path_dtos() -> TestResult {
    let repo_root = repo_root();
    let mut scan_paths = vec![repo_root.join("src/core/native/native-bridge.ts")];
    scan_paths.extend(production_rust_files(
        &repo_root.join("src-tauri/src/commands"),
    )?);

    let mut violations = Vec::new();
    for path in scan_paths {
        if !path.exists() {
            continue;
        }

        let contents = read_to_string(&path)?;
        for (pattern, label) in [
            ("sql:", "raw sql field"),
            ("sql?:", "optional raw sql field"),
            ("params:", "raw params field"),
            ("params?:", "optional raw params field"),
            ("dbPath", "database path field"),
            ("databasePath", "database path field"),
            ("execute_sql", "generic SQL executor"),
            ("raw_sql", "raw SQL DTO"),
        ] {
            if contents.contains(pattern) {
                violations.push(format!(
                    "{}: {label} marker {pattern:?}",
                    path.strip_prefix(&repo_root).unwrap_or(&path).display()
                ));
            }
        }
    }

    assert_eq!(violations, Vec::<String>::new());

    Ok(())
}

fn extract_generate_handler_body(lib_rs: &str) -> Option<String> {
    let start = lib_rs.find("tauri::generate_handler![")?;
    let tail = &lib_rs[start + "tauri::generate_handler![".len()..];
    let end = tail.find(']')?;
    Some(tail[..end].to_string())
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

fn assert_no_tauri_sql_plugin_or_permission_markers(paths: &[PathBuf]) -> TestResult {
    for path in paths {
        if !path.exists() {
            continue;
        }

        let contents = read_to_string(path)?;
        let lower = contents.to_ascii_lowercase();
        assert!(
            !lower.contains("@tauri-apps/plugin-sql")
                && !lower.contains("tauri-plugin-sql")
                && !lower.contains("tauri_plugin_sql")
                && !lower.contains("sql:"),
            "Mirabilis must not expose persistence through Tauri SQL plugin or SQL permissions in {}",
            path.display(),
        );
    }

    Ok(())
}

fn assert_no_wildcard_windows(capability_json: &Value, path: &Path) -> TestResult {
    if let Some(windows) = capability_json.get("windows").and_then(Value::as_array) {
        assert!(
            !windows.iter().any(|window| window.as_str() == Some("*")),
            "DB persistence capabilities must not use wildcard windows in {}",
            path.display(),
        );
    }

    Ok(())
}

fn assert_no_unrelated_broad_permissions(capability_json: &Value, path: &Path) -> TestResult {
    let permission_strings = collect_permission_strings(capability_json);
    let mut violations = Vec::new();

    for permission in permission_strings {
        let lower = permission.to_ascii_lowercase();
        if lower.starts_with("fs:")
            || lower.contains("filesystem")
            || lower.contains("filepath")
            || lower.contains("dbpath")
            || lower.contains("databasepath")
            || lower.starts_with("path:")
            || lower.starts_with("shell:")
            || lower.contains("remote")
        {
            violations.push(permission);
        }
    }

    assert!(
        violations.is_empty(),
        "DB persistence must not add filesystem/path/shell/remote permissions in {}: {:?}",
        path.display(),
        violations,
    );

    Ok(())
}

fn assert_reviewed_db_command_exposure(
    repo_root: &Path,
    capability_paths: &[PathBuf],
) -> TestResult {
    let capability_text = capability_paths
        .iter()
        .map(read_to_string)
        .collect::<Result<Vec<_>, _>>()?
        .join("\n");
    let has_explicit_acl =
        capability_text.contains("db_execute") && capability_text.contains("db_transaction");

    let documented_default_decision =
        read_to_string(repo_root.join("docs/architecture/06-filter-native-database.md"))?;
    let has_documented_default_decision = documented_default_decision
        .contains("TASK-014 command exposure decision:")
        && documented_default_decision.contains("db_execute")
        && documented_default_decision.contains("db_transaction")
        && documented_default_decision.contains("default custom-command exposure");

    assert!(
        has_explicit_acl || has_documented_default_decision,
        "TASK-014 must either add explicit reviewed app-command ACL/capability entries for db_execute/db_transaction or document the narrow default custom-command exposure decision",
    );

    Ok(())
}

fn collect_permission_strings(capability_json: &Value) -> Vec<String> {
    let mut strings = Vec::new();
    collect_permission_strings_from_value(capability_json.get("permissions"), &mut strings);
    strings
}

fn collect_permission_strings_from_value(value: Option<&Value>, strings: &mut Vec<String>) {
    match value {
        Some(Value::String(value)) => strings.push(value.to_string()),
        Some(Value::Array(values)) => {
            for value in values {
                collect_permission_strings_from_value(Some(value), strings);
            }
        }
        Some(Value::Object(object)) => {
            for field in ["id", "name", "identifier", "permission", "scope"] {
                collect_permission_strings_from_value(object.get(field), strings);
            }
        }
        _ => {}
    }
}

fn production_rust_files(directory: &Path) -> TestResult<Vec<PathBuf>> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry_path = entry?.path();
        if entry_path.is_dir() {
            files.extend(production_rust_files(&entry_path)?);
        } else if entry_path
            .extension()
            .and_then(|extension| extension.to_str())
            == Some("rs")
        {
            files.push(entry_path);
        }
    }
    files.sort();
    Ok(files)
}

fn parse_json_file(path: &Path) -> TestResult<Value> {
    Ok(serde_json::from_str(&read_to_string(path)?)?)
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
