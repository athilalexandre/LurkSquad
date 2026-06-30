mod keyring;

use keyring::{save_secure_token, get_secure_token, delete_secure_token};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct KickInfo {
    is_live: bool,
    viewers: u32,
}

#[tauri::command]
fn get_kick_channel_info(slug: String) -> Result<KickInfo, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://kick.com/api/v2/channels/{}", slug);
    let response = client.get(&url).send().map_err(|e| e.to_string())?;

    if response.status() == 404 {
        return Ok(KickInfo { is_live: false, viewers: 0 });
    }

    if !response.status().is_success() {
        return Err(format!("Error status: {}", response.status()));
    }

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    
    let is_live = !json["livestream"].is_null();
    let viewers = json["livestream"]["viewer_count"]
        .as_u64()
        .or_else(|| json["livestream"]["viewers"].as_u64())
        .unwrap_or(0) as u32;

    Ok(KickInfo { is_live, viewers })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_secure_token,
            get_secure_token,
            delete_secure_token,
            get_kick_channel_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

