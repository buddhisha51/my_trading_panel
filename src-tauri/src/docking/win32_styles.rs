use super::Rect;

#[cfg(target_os = "windows")]
mod imp {
    use super::Rect;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{HWND, POINT};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
        HWND_NOTOPMOST, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOZORDER, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    /// Applies `WS_EX_TOOLWINDOW` and conditionally toggles `WS_EX_NOACTIVATE`
    /// so the collapsed/hover-peeking panel never steals focus from MT5 or TradingView,
    /// while allowing normal activation when clicking into inputs/canvas.
    pub fn apply_docked_styles(hwnd_raw: isize, no_activate: bool, tool_window: bool) {
        let hwnd = hwnd_raw as HWND;
        unsafe {
            let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if tool_window {
                ex_style |= WS_EX_TOOLWINDOW as isize;
            } else {
                ex_style &= !(WS_EX_TOOLWINDOW as isize);
            }
            if no_activate {
                ex_style |= WS_EX_NOACTIVATE as isize;
            } else {
                ex_style &= !(WS_EX_NOACTIVATE as isize);
            }
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);
            SetWindowPos(
                hwnd,
                null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }

    /// Sets window position and size atomically in a single Win32 call, preserving
    /// topmost Z-order without flickering between move and resize steps.
    pub fn set_bounds_atomic(hwnd_raw: isize, rect: Rect, topmost: bool, no_activate: bool) {
        let hwnd = hwnd_raw as HWND;
        let insert_after = if topmost { HWND_TOPMOST } else { HWND_NOTOPMOST };
        let flags = if no_activate { SWP_NOACTIVATE } else { 0 };
        unsafe {
            SetWindowPos(
                hwnd,
                insert_after,
                rect.x,
                rect.y,
                rect.width as i32,
                rect.height as i32,
                flags,
            );
        }
    }

    /// Re-asserts `HWND_TOPMOST` without moving, resizing, or activating the window.
    pub fn enforce_topmost(hwnd_raw: isize) {
        let hwnd = hwnd_raw as HWND;
        unsafe {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }

    /// Reads the current physical cursor position across all monitors.
    pub fn get_cursor_pos() -> Option<(i32, i32)> {
        let mut pt = POINT { x: 0, y: 0 };
        let ok = unsafe { GetCursorPos(&mut pt) };
        if ok != 0 {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }

    /// Returns true while the physical primary mouse button (`VK_LBUTTON`) is pressed.
    pub fn is_left_mouse_down() -> bool {
        let state = unsafe { GetAsyncKeyState(VK_LBUTTON as i32) };
        (state as u16 & 0x8000) != 0
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::Rect;

    pub fn apply_docked_styles(_hwnd_raw: isize, _no_activate: bool, _tool_window: bool) {}
    pub fn set_bounds_atomic(_hwnd_raw: isize, _rect: Rect, _topmost: bool, _no_activate: bool) {}
    pub fn enforce_topmost(_hwnd_raw: isize) {}
    pub fn get_cursor_pos() -> Option<(i32, i32)> {
        None
    }
    pub fn is_left_mouse_down() -> bool {
        false
    }
}

pub use imp::{
    apply_docked_styles, enforce_topmost, get_cursor_pos, is_left_mouse_down, set_bounds_atomic,
};
