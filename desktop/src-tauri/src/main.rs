// Prevents an extra console window on Windows in release builds. DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// DAVE desktop shell (Tauri v1).
//
// Phase A (current): this shell just hosts the bundled React frontend. The
// frontend talks to a FastAPI backend already running on 127.0.0.1:8765
// (see frontend/src/api/runtime.ts — when window.__TAURI__ is present the API
// base is hard-wired to http://127.0.0.1:8765). Start the backend yourself in
// desktop mode before launching the app:
//
//     cd backend && APP_MODE=desktop ../.venv/bin/python -m app.main
//
// Phase B (planned): bundle the backend as a PyInstaller sidecar binary and
// spawn/kill it from here so the app is self-contained. The hook for that is
// sketched in `spawn_backend_sidecar` below — wire it into `.setup()` and add
// the sidecar to `tauri.conf.json > tauri.bundle.externalBin` when Phase B
// lands.

fn main() {
    tauri::Builder::default()
        // .setup(|app| {
        //     spawn_backend_sidecar(app)?;
        //     Ok(())
        // })
        .run(tauri::generate_context!())
        .expect("error while running DAVE desktop application");
}

// ── Phase B placeholder (sidecar backend) ───────────────────────────────────
// Uncomment and finish once the PyInstaller-bundled backend exists. Requires
// the "shell-sidecar" feature on the `tauri` dependency and an `externalBin`
// entry named e.g. "dave-backend" in tauri.conf.json.
//
// fn spawn_backend_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
//     use tauri::api::process::{Command, CommandEvent};
//     let (mut rx, _child) = Command::new_sidecar("dave-backend")?
//         .args(["--host", "127.0.0.1", "--port", "8765"])
//         .spawn()?;
//     tauri::async_runtime::spawn(async move {
//         while let Some(event) = rx.recv().await {
//             if let CommandEvent::Stdout(line) = event {
//                 println!("[dave-backend] {line}");
//             }
//         }
//     });
//     Ok(())
// }
