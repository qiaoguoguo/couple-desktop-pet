#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
pub fn read_settings() -> serde_json::Value {
    serde_json::json!({})
}

#[tauri::command]
pub fn write_settings(settings: serde_json::Value) -> Result<(), String> {
    let _ = settings;
    Ok(())
}

#[tauri::command]
pub fn set_always_on_top(enabled: bool) -> Result<(), String> {
    let _ = enabled;
    Ok(())
}

#[tauri::command]
pub fn set_click_through(enabled: bool) -> Result<(), String> {
    let _ = enabled;
    Ok(())
}

#[tauri::command]
pub fn reset_window_position() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn show_window() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn hide_window() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn quit_app() -> Result<(), String> {
    Ok(())
}
