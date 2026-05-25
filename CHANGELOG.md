# Changelog

Mirabilis keeps package, Tauri, and Cargo versions synchronized. Each release entry should describe user-visible changes, release packaging scope, and any bundle formats that still require separate validation.

## 0.1.0 - Unreleased

- Establishes the local release gate: `bun run check:full` runs quick checks before an unattended Tauri build in `--ci` mode for explicit local Linux `deb` and `rpm` bundles.
- Documents that AppImage is not validated by the default local Arch gate and remains deferred to a controlled Linux builder such as Ubuntu 22.04 or Debian 12.
- Clarifies that TASK-033 leaves the pre-existing Tauri `app.security.csp: null` unchanged; public release, updater, or remote/web-content claims require future CSP hardening review.
