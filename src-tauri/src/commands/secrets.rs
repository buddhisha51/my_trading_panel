const SERVICE_NAME: &str = "com.icttrading.panel";

/// Stores an API secret in Windows Credential Manager (DPAPI-backed).
#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    if value.trim().is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&value).map_err(|e| e.to_string())
    }
}

/// Checks if a secret exists without exposing the raw value unless requested.
#[tauri::command]
pub fn has_secret(key: String) -> Result<bool, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(val) => Ok(!val.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Deletes a stored credential from Windows Credential Manager.
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
