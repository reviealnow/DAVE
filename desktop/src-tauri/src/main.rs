// Prevents an extra console window on Windows in release builds. DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// DAVE desktop shell (Tauri v1).
//
// On startup this spawns the bundled FastAPI backend as a sidecar binary
// (`dave-backend`, built from backend/dave-backend.spec via PyInstaller) and
// kills it when the app exits, so the desktop app is self-contained — no manual
// backend start required. The backend listens on 127.0.0.1:8765; the frontend
// detects window.__TAURI__ and points its API calls there
// (frontend/src/api/runtime.ts).
//
// Writable data (SQLite DB, uploads, logs, .env) lives in the OS app-data dir,
// passed to the backend via DAVE_DATA_DIR. Read-only resources (VERSION,
// release.json, tools/) are bundled inside the binary (app.config.RESOURCE_ROOT).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::api::process::{Command, CommandChild, CommandEvent};
use tauri::{Manager, RunEvent};

/// Holds the backend child process so we can kill it on exit.
struct BackendProcess(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path_resolver()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir).ok();

            let mut env = HashMap::new();
            env.insert("APP_MODE".into(), "desktop".into());
            env.insert("APP_HOST".into(), "127.0.0.1".into());
            env.insert("APP_PORT".into(), "8765".into());
            env.insert(
                "DAVE_DATA_DIR".into(),
                data_dir.to_string_lossy().into_owned(),
            );

            // Spawn the bundled backend. Non-fatal: in `tauri dev` you may not have
            // built the sidecar yet and instead run the backend manually
            // (APP_MODE=desktop ../.venv/bin/python -m app.main) — in that case we
            // log a warning and let the frontend connect to that backend.
            let spawned = Command::new_sidecar("dave-backend")
                .map_err(|e| e.to_string())
                .and_then(|cmd| cmd.envs(env).spawn().map_err(|e| e.to_string()));
            match spawned {
                Ok((mut rx, child)) => {
                    app.manage(BackendProcess(Mutex::new(Some(child))));
                    // Forward backend stdout/stderr to the shell console for debugging.
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => println!("[dave-backend] {line}"),
                                CommandEvent::Stderr(line) => eprintln!("[dave-backend] {line}"),
                                _ => {}
                            }
                        }
                    });
                }
                Err(err) => {
                    eprintln!(
                        "[dave] could not start dave-backend sidecar ({err}); \
                         expecting a backend already running on 127.0.0.1:8765"
                    );
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DAVE desktop application")
        .run(|app_handle, event| {
            // Make sure the backend sidecar dies with the app.
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<BackendProcess>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
