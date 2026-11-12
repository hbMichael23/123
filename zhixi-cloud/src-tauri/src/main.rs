#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[tauri::command]
fn save_backup_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        // single-instance 必须最先注册；它的 deep-link feature 负责 Windows/Linux
        // 将第二次启动携带的 zhixi:// URL 转回已运行的实例。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_backup_file])
        .setup(|app| {
            // macOS 的 scheme 由 bundle 注册；Windows/Linux 开发环境下
            // 运行时注册便于本地调试。失败不阻断主流程，生产安装包由
            // tauri.conf.json 的 deep-link 配置注册。
            if let Err(error) = app.deep_link().register("zhixi") {
                eprintln!("[zhixi] deep link registration failed: {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running zhixi");
}
