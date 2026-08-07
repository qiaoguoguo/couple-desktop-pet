#[cfg(not(target_os = "macos"))]
mod default;
#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
use self::default as imp;
#[cfg(target_os = "macos")]
use self::macos as imp;

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DesktopPlatform {
    Macos,
    Other,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ActivationPolicyKind {
    Accessory,
    Default,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PlatformShellPolicy {
    pub activation_policy: ActivationPolicyKind,
    pub hide_dock_icon: bool,
    pub uses_menu_bar_tray: bool,
}

#[cfg(test)]
pub(crate) fn platform_shell_policy(kind: DesktopPlatform) -> PlatformShellPolicy {
    match kind {
        DesktopPlatform::Macos => PlatformShellPolicy {
            activation_policy: ActivationPolicyKind::Accessory,
            hide_dock_icon: true,
            uses_menu_bar_tray: true,
        },
        DesktopPlatform::Other => PlatformShellPolicy {
            activation_policy: ActivationPolicyKind::Default,
            hide_dock_icon: false,
            uses_menu_bar_tray: true,
        },
    }
}

pub(crate) fn configure_platform_shell(app: &mut tauri::App) -> tauri::Result<()> {
    imp::configure_platform_shell(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_shell_policy_uses_accessory_and_hides_dock_on_macos() {
        assert_eq!(
            platform_shell_policy(DesktopPlatform::Macos),
            PlatformShellPolicy {
                activation_policy: ActivationPolicyKind::Accessory,
                hide_dock_icon: true,
                uses_menu_bar_tray: true,
            },
        );
    }

    #[test]
    fn platform_shell_policy_keeps_default_activation_on_other_platforms() {
        assert_eq!(
            platform_shell_policy(DesktopPlatform::Other),
            PlatformShellPolicy {
                activation_policy: ActivationPolicyKind::Default,
                hide_dock_icon: false,
                uses_menu_bar_tray: true,
            },
        );
    }
}
