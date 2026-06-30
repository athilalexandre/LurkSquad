use keyring::Entry;

const SERVICE_NAME: &str = "lurksquad";
const USER_NAME: &str = "session_token";

#[tauri::command]
pub fn save_secure_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, USER_NAME).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_secure_token() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, USER_NAME).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) => Ok("".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_secure_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, USER_NAME).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // If it doesn't exist, we're already deleted
        Err(e) => Err(e.to_string()),
    }
}
