use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const PET_PACKAGES_DIR: &str = "pet-packages";
const IMPORTED_PREFIX: &str = "imported:";
const PET_FRAMES_PER_ACTION: usize = 30;
const REQUIRED_RENDERER: &str = "frame-sequence";
const UNSUPPORTED_LEGACY_PACKAGE_MESSAGE: &str =
    "旧版资源包动作标准过低，请使用新版生成器重新生成。";
const MIN_MANIFEST_DIMENSION: u32 = 64;
const MAX_MANIFEST_DIMENSION: u32 = 2048;
const MAX_ARCHIVE_SIZE_BYTES: u64 = 80 * 1024 * 1024;
const MAX_EXTRACTED_SIZE_BYTES: u64 = 160 * 1024 * 1024;
const MAX_SINGLE_FILE_SIZE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 500;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
const PRESENCE_PORTRAIT_FILES: [&str; 2] = ["portrait.png", "portrait-offline.png"];

const REQUIRED_ACTIONS: [&str; 12] = [
    "idle-breathe",
    "idle-look",
    "idle-stretch",
    "walk",
    "drag",
    "sleep",
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
];

#[derive(Debug, Deserialize)]
struct PetPackageManifest {
    #[serde(rename = "formatVersion")]
    format_version: u8,
    renderer: Option<String>,
    id: String,
    name: String,
    #[serde(rename = "baseSize")]
    base_size: PackageSize,
    #[serde(rename = "frameSize")]
    frame_size: PackageSize,
    #[serde(default)]
    actions: BTreeMap<String, PackageAction>,
    #[serde(default)]
    scenes: BTreeMap<String, PackageScene>,
    #[serde(rename = "defaultMotion")]
    default_motion: Option<String>,
    #[serde(default)]
    motions: BTreeMap<String, PackageMotion>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageSize {
    width: u32,
    height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageAction {
    fps: f64,
    #[serde(rename = "loop")]
    loop_value: bool,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: u32,
    frames: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageMotion {
    fps: f64,
    #[serde(rename = "loop")]
    loop_value: bool,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: u32,
    frames: String,
    #[serde(default = "default_motion_weight")]
    weight: f64,
    #[serde(default = "default_motion_tags")]
    tags: Vec<String>,
}

fn default_motion_weight() -> f64 {
    1.0
}

fn default_motion_tags() -> Vec<String> {
    vec!["idle".to_string()]
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageBubbleCue {
    #[serde(rename = "atMs")]
    at_ms: u32,
    text: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageScene {
    action: String,
    #[serde(rename = "bubbleCues")]
    bubble_cues: Vec<PackageBubbleCue>,
    #[serde(rename = "returnTo")]
    return_to: String,
    #[serde(rename = "waitForAcknowledge")]
    wait_for_acknowledge: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportedPetPackageSummary {
    pub id: String,
    #[serde(rename = "manifestId")]
    pub manifest_id: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u8,
    pub renderer: String,
    pub name: String,
    #[serde(rename = "baseSize")]
    pub base_size: PackageSize,
    #[serde(rename = "frameSize")]
    pub frame_size: PackageSize,
    #[serde(rename = "previewPath")]
    pub preview_path: String,
    #[serde(rename = "portraitPath")]
    pub portrait_path: Option<String>,
    #[serde(rename = "offlinePortraitPath")]
    pub offline_portrait_path: Option<String>,
    pub actions: BTreeMap<String, PackageAction>,
    pub scenes: BTreeMap<String, PackageScene>,
    #[serde(rename = "framePaths")]
    pub frame_paths: BTreeMap<String, Vec<String>>,
    #[serde(rename = "defaultMotion")]
    pub default_motion: Option<String>,
    pub motions: BTreeMap<String, PackageMotion>,
    #[serde(rename = "motionFramePaths")]
    pub motion_frame_paths: BTreeMap<String, Vec<String>>,
}

pub fn import_pet_package_from_path(
    source_path: &Path,
    packages_root: &Path,
) -> Result<ImportedPetPackageSummary, String> {
    let archive_size = fs::metadata(source_path)
        .map_err(|error| format!("无法读取资源包: {error}"))?
        .len();
    if archive_size > MAX_ARCHIVE_SIZE_BYTES {
        return Err("资源包太大，最大支持 80 MB".to_string());
    }

    let bytes = fs::read(source_path).map_err(|error| format!("无法读取资源包: {error}"))?;
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("资源包不是有效的 cdpet/zip 文件: {error}"))?;

    let manifest = read_manifest(&mut archive)?;
    validate_manifest(&manifest)?;
    validate_archive_paths(&mut archive, &manifest)?;
    validate_required_frames(&mut archive, &manifest)?;

    let package_dir = packages_root.join(&manifest.id);
    let staging_dir = packages_root.join(format!(".importing-{}", manifest.id));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir)
            .map_err(|error| format!("无法清理临时导入目录: {error}"))?;
    }
    fs::create_dir_all(&staging_dir).map_err(|error| format!("无法创建导入目录: {error}"))?;

    extract_archive(&mut archive, &staging_dir)?;

    if package_dir.exists() {
        fs::remove_dir_all(&package_dir).map_err(|error| format!("无法替换旧资源包: {error}"))?;
    }
    fs::rename(&staging_dir, &package_dir).map_err(|error| format!("无法保存资源包: {error}"))?;

    read_package_summary(&package_dir)
}

pub fn list_pet_packages_from_root(
    packages_root: &Path,
) -> Result<Vec<ImportedPetPackageSummary>, String> {
    if !packages_root.exists() {
        return Ok(Vec::new());
    }

    let mut packages = Vec::new();
    let entries =
        fs::read_dir(packages_root).map_err(|error| format!("无法读取形象资源包目录: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取形象资源包条目: {error}"))?;
        if !entry
            .file_type()
            .map_err(|error| format!("无法读取形象资源包类型: {error}"))?
            .is_dir()
        {
            continue;
        }

        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(".importing-")
        {
            continue;
        }

        if let Ok(summary) = read_package_summary(&entry.path()) {
            packages.push(summary);
        }
    }

    packages.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(packages)
}

pub fn delete_pet_package_from_root(packages_root: &Path, package_id: &str) -> Result<(), String> {
    let manifest_id = package_id
        .strip_prefix(IMPORTED_PREFIX)
        .ok_or_else(|| "只能删除导入的形象资源包".to_string())?;

    if !is_valid_manifest_id(manifest_id) {
        return Err("资源包 id 非法".to_string());
    }

    let package_dir = packages_root.join(manifest_id);
    if !package_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&package_dir).map_err(|error| format!("无法删除形象资源包: {error}"))
}

#[tauri::command]
pub fn list_pet_packages(app: AppHandle) -> Result<Vec<ImportedPetPackageSummary>, String> {
    let root = packages_root(&app)?;
    list_pet_packages_from_root(&root)
}

#[tauri::command]
pub fn import_pet_package(
    app: AppHandle,
    source_path: String,
) -> Result<ImportedPetPackageSummary, String> {
    let root = packages_root(&app)?;
    import_pet_package_from_path(Path::new(&source_path), &root)
}

#[tauri::command]
pub fn delete_pet_package(app: AppHandle, package_id: String) -> Result<(), String> {
    let root = packages_root(&app)?;
    delete_pet_package_from_root(&root, &package_id)
}

fn packages_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(PET_PACKAGES_DIR))
        .map_err(|error| format!("<app_data_dir>/{PET_PACKAGES_DIR}: {error}"))
}

fn validate_archive_paths<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &PetPackageManifest,
) -> Result<(), String> {
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err("资源包文件数量过多".to_string());
    }

    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("无法读取资源包条目: {error}"))?;
        let name = file.name().to_string();
        validate_relative_archive_path(&name)?;

        if file.is_dir() {
            validate_allowed_archive_dir(&name, manifest)?;
            continue;
        }

        validate_allowed_archive_file(&name, manifest)?;
        if file.size() > MAX_SINGLE_FILE_SIZE_BYTES {
            return Err("资源包单个文件过大".to_string());
        }

        total_size = total_size.saturating_add(file.size());
        if total_size > MAX_EXTRACTED_SIZE_BYTES {
            return Err("资源包解压后太大".to_string());
        }
    }

    Ok(())
}

fn validate_relative_archive_path(name: &str) -> Result<(), String> {
    if name.contains('\\') || name.starts_with('/') {
        return Err(format!("非法路径: {name}"));
    }

    let path = Path::new(name);
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(format!("非法路径: {name}")),
        }
    }

    Ok(())
}

fn validate_allowed_archive_dir(name: &str, manifest: &PetPackageManifest) -> Result<(), String> {
    let normalized = name.trim_end_matches('/');

    match manifest.format_version {
        2 => {
            if normalized == "frames"
                || REQUIRED_ACTIONS.iter().any(|action| {
                    normalized
                        .strip_prefix("frames/")
                        .is_some_and(|directory| directory == *action)
                })
            {
                return Ok(());
            }
        }
        3 => {
            if normalized == "motions"
                || manifest.motions.keys().any(|motion_id| {
                    normalized
                        .strip_prefix("motions/")
                        .is_some_and(|directory| directory == motion_id)
                })
            {
                return Ok(());
            }
        }
        _ => {}
    }

    Err(format!("资源包包含不支持的文件: {name}"))
}

fn validate_allowed_archive_file(name: &str, manifest: &PetPackageManifest) -> Result<(), String> {
    if name == "pet.json" || name == "preview.png" || PRESENCE_PORTRAIT_FILES.contains(&name) {
        return Ok(());
    }

    match manifest.format_version {
        2 if is_expected_frame_file(name) => return Ok(()),
        3 if is_expected_motion_frame_file(name, manifest) => return Ok(()),
        _ => {}
    }

    Err(format!("资源包包含不支持的文件: {name}"))
}

fn is_expected_frame_file(name: &str) -> bool {
    let mut parts = name.split('/');
    let Some("frames") = parts.next() else {
        return false;
    };
    let Some(action) = parts.next() else {
        return false;
    };
    let Some(file_name) = parts.next() else {
        return false;
    };

    if parts.next().is_some() || !REQUIRED_ACTIONS.contains(&action) {
        return false;
    }

    let Some(frame_number) = file_name.strip_suffix(".png") else {
        return false;
    };

    if frame_number.len() != 4 {
        return false;
    }

    frame_number
        .parse::<usize>()
        .is_ok_and(|index| (1..=PET_FRAMES_PER_ACTION).contains(&index))
}

fn is_expected_motion_frame_file(name: &str, manifest: &PetPackageManifest) -> bool {
    let mut parts = name.split('/');
    let Some("motions") = parts.next() else {
        return false;
    };
    let Some(motion_id) = parts.next() else {
        return false;
    };
    let Some(file_name) = parts.next() else {
        return false;
    };

    if parts.next().is_some() {
        return false;
    }

    let Some(motion) = manifest.motions.get(motion_id) else {
        return false;
    };
    let Some(frame_number) = file_name.strip_suffix(".png") else {
        return false;
    };

    if frame_number.len() != 4 {
        return false;
    }

    frame_number
        .parse::<usize>()
        .is_ok_and(|index| (1..=motion.frame_count).contains(&index))
}

fn read_manifest<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<PetPackageManifest, String> {
    let mut file = archive
        .by_name("pet.json")
        .map_err(|_| "缺少 pet.json".to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|error| format!("无法读取 pet.json: {error}"))?;

    serde_json::from_str(&contents).map_err(|error| format!("pet.json 格式无效: {error}"))
}

fn validate_manifest(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.format_version == 1 {
        return Err(UNSUPPORTED_LEGACY_PACKAGE_MESSAGE.to_string());
    }

    match manifest.format_version {
        2 => validate_v2_manifest(manifest),
        3 => validate_v3_manifest(manifest),
        _ => Err("资源包版本不支持".to_string()),
    }
}

fn validate_v2_manifest(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.renderer.as_deref() != Some(REQUIRED_RENDERER) {
        return Err("资源包 renderer 必须是 frame-sequence".to_string());
    }
    if !is_valid_manifest_id(&manifest.id) {
        return Err("资源包 id 只能包含英文、数字、下划线和短横线".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("资源包名称不能为空".to_string());
    }
    validate_manifest_sizes(manifest)?;

    for action in REQUIRED_ACTIONS {
        let action_config = manifest
            .actions
            .get(action)
            .ok_or_else(|| format!("缺少动作配置: {action}"))?;

        if action_config.fps != 5.0 {
            return Err(format!("动作帧率必须是 5 fps: {action}"));
        }

        if action_config.frame_count != PET_FRAMES_PER_ACTION {
            return Err(format!("动作帧数量必须是 30: {action}"));
        }

        if action_config.duration_ms != 6000 {
            return Err(format!("动作时长必须是 6000ms: {action}"));
        }

        if action_config.frames != format!("frames/{action}/") {
            return Err(format!("动作帧目录无效: {action}"));
        }

        let _ = action_config.loop_value;
    }

    for scene_id in [
        "act-cute",
        "act-typing",
        "act-wave",
        "act-hug",
        "act-pout",
        "act-drowsy",
        "remote-message",
    ] {
        let scene = manifest
            .scenes
            .get(scene_id)
            .ok_or_else(|| format!("缺少场景配置: {scene_id}"))?;

        if !REQUIRED_ACTIONS.contains(&scene.action.as_str()) {
            return Err(format!("场景动作无效: {scene_id}"));
        }

        if !["idle-breathe", "idle-look", "idle-stretch"].contains(&scene.return_to.as_str()) {
            return Err(format!("场景回落动作无效: {scene_id}"));
        }

        if scene.bubble_cues.is_empty() {
            return Err(format!("场景缺少气泡时机: {scene_id}"));
        }

        for cue in &scene.bubble_cues {
            if cue.text.as_deref().unwrap_or("").trim().is_empty()
                && cue.source.as_deref() != Some("remoteMessage")
            {
                return Err(format!("场景气泡无效: {scene_id}"));
            }
        }
    }

    let remote_message_scene = manifest
        .scenes
        .get("remote-message")
        .ok_or_else(|| "缺少场景配置: remote-message".to_string())?;
    if remote_message_scene.wait_for_acknowledge != Some(true) {
        return Err("remote-message 必须等待用户确认".to_string());
    }
    if !remote_message_scene
        .bubble_cues
        .iter()
        .any(|cue| cue.source.as_deref() == Some("remoteMessage"))
    {
        return Err("remote-message 必须包含 remoteMessage 气泡来源".to_string());
    }

    Ok(())
}

fn validate_v3_manifest(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.renderer.as_deref() != Some("motion-pool") {
        return Err("资源包 renderer 必须是 motion-pool".to_string());
    }
    if !is_valid_manifest_id(&manifest.id) {
        return Err("资源包 id 只能包含英文、数字、下划线和短横线".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("资源包名称不能为空".to_string());
    }
    validate_manifest_sizes(manifest)?;
    if manifest.motions.is_empty() {
        return Err("v3 资源包至少需要一个 motion".to_string());
    }
    let default_motion = manifest
        .default_motion
        .as_deref()
        .ok_or_else(|| "缺少 defaultMotion".to_string())?;
    if !manifest.motions.contains_key(default_motion) {
        return Err("defaultMotion 必须指向已存在的 motion".to_string());
    }
    for (motion_id, motion) in &manifest.motions {
        validate_motion_manifest(motion_id, motion)?;
    }

    Ok(())
}

fn validate_manifest_sizes(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.base_size.width < MIN_MANIFEST_DIMENSION
        || manifest.base_size.height < MIN_MANIFEST_DIMENSION
    {
        return Err("baseSize 太小".to_string());
    }
    if manifest.base_size.width > MAX_MANIFEST_DIMENSION
        || manifest.base_size.height > MAX_MANIFEST_DIMENSION
    {
        return Err("baseSize 太大".to_string());
    }
    if manifest.frame_size.width < MIN_MANIFEST_DIMENSION
        || manifest.frame_size.height < MIN_MANIFEST_DIMENSION
    {
        return Err("frameSize 太小".to_string());
    }
    if manifest.frame_size.width > MAX_MANIFEST_DIMENSION
        || manifest.frame_size.height > MAX_MANIFEST_DIMENSION
    {
        return Err("frameSize 太大".to_string());
    }

    Ok(())
}

fn validate_motion_manifest(motion_id: &str, motion: &PackageMotion) -> Result<(), String> {
    if !is_valid_manifest_id(motion_id) {
        return Err(format!("motion id 非法: {motion_id}"));
    }
    if !motion.fps.is_finite() || !(1.0..=12.0).contains(&motion.fps) {
        return Err(format!("motion 帧率必须在 1 到 12 fps: {motion_id}"));
    }
    if motion.frame_count < 1 || motion.frame_count > 60 {
        return Err(format!("motion 帧数量必须在 1 到 60: {motion_id}"));
    }
    if motion.duration_ms < 3000 || motion.duration_ms > 12000 {
        return Err(format!("motion 时长必须在 3000 到 12000ms: {motion_id}"));
    }
    if motion.frames != format!("motions/{motion_id}/") {
        return Err(format!("motion 帧目录无效: {motion_id}"));
    }
    if !motion.weight.is_finite() || motion.weight <= 0.0 {
        return Err(format!("motion 权重必须大于 0: {motion_id}"));
    }
    if motion.tags.iter().all(|tag| tag.trim().is_empty()) {
        return Err(format!("motion 至少需要一个有效标签: {motion_id}"));
    }
    let _ = motion.loop_value;
    Ok(())
}

fn is_valid_manifest_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn validate_required_frames<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &PetPackageManifest,
) -> Result<(), String> {
    {
        let mut preview = archive
            .by_name("preview.png")
            .map_err(|_| "缺少 preview.png".to_string())?;
        validate_png_file(&mut preview, "preview.png")?;
    }
    for portrait_file in PRESENCE_PORTRAIT_FILES {
        if let Ok(mut portrait) = archive.by_name(portrait_file) {
            validate_png_file(&mut portrait, portrait_file)?;
        }
    }

    if manifest.format_version == 3 {
        return validate_v3_motion_frames(archive, manifest);
    }

    validate_v2_action_frames(archive)
}

fn validate_v2_action_frames<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<(), String> {
    for action in REQUIRED_ACTIONS {
        for frame_index in 1..=PET_FRAMES_PER_ACTION {
            let frame_path = expected_frame_path(action, frame_index);
            let mut file = archive
                .by_name(&frame_path)
                .map_err(|_| format!("缺少帧文件: {frame_path}"))?;
            validate_png_file(&mut file, &frame_path)?;
        }
    }

    Ok(())
}

fn validate_v3_motion_frames<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &PetPackageManifest,
) -> Result<(), String> {
    for (motion_id, motion) in &manifest.motions {
        for frame_index in 1..=motion.frame_count {
            let frame_path = format!("motions/{motion_id}/{frame_index:04}.png");
            let mut file = archive
                .by_name(&frame_path)
                .map_err(|_| format!("缺少帧文件: {frame_path}"))?;
            validate_png_file(&mut file, &frame_path)?;
        }
    }

    Ok(())
}

fn validate_png_file<R: Read>(reader: &mut R, path: &str) -> Result<(), String> {
    let mut signature = [0_u8; 8];
    reader
        .read_exact(&mut signature)
        .map_err(|_| format!("PNG 文件无效: {path}"))?;

    if signature != PNG_SIGNATURE {
        return Err(format!("PNG 文件无效: {path}"));
    }

    Ok(())
}

fn expected_frame_path(action: &str, frame_index: usize) -> String {
    format!("frames/{action}/{frame_index:04}.png")
}

fn extract_archive<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    destination: &Path,
) -> Result<(), String> {
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("无法读取资源包条目: {error}"))?;
        let name = file.name().to_string();

        if file.is_dir() {
            fs::create_dir_all(destination.join(Path::new(&name)))
                .map_err(|error| format!("无法创建资源包目录: {error}"))?;
            continue;
        }

        let out_path = destination.join(Path::new(&name));
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建资源包目录: {error}"))?;
        }

        let mut output =
            fs::File::create(&out_path).map_err(|error| format!("无法写入资源文件: {error}"))?;
        std::io::copy(&mut file, &mut output)
            .map_err(|error| format!("无法写入资源文件: {error}"))?;
    }

    Ok(())
}

fn read_package_summary(package_dir: &Path) -> Result<ImportedPetPackageSummary, String> {
    let manifest_contents = fs::read_to_string(package_dir.join("pet.json"))
        .map_err(|error| format!("无法读取已导入资源包 manifest: {error}"))?;
    let manifest: PetPackageManifest = serde_json::from_str(&manifest_contents)
        .map_err(|error| format!("已导入资源包 manifest 无效: {error}"))?;
    validate_manifest(&manifest)?;

    let frame_paths = if manifest.format_version == 2 {
        read_v2_frame_paths(package_dir)?
    } else {
        BTreeMap::new()
    };
    let motion_frame_paths = if manifest.format_version == 3 {
        read_motion_frame_paths(package_dir, &manifest)?
    } else {
        build_motion_frame_paths_from_v2_actions(package_dir)?
    };
    let motions = if manifest.format_version == 3 {
        manifest.motions.clone()
    } else {
        build_motion_manifests_from_v2_actions(&manifest.actions)
    };
    let default_motion = if manifest.format_version == 3 {
        manifest.default_motion.clone()
    } else {
        Some("idle-breathe".to_string())
    };

    let preview_path = package_dir.join("preview.png");
    if !preview_path.exists() {
        return Err("缺少 preview.png".to_string());
    }
    let portrait_path = optional_asset_path(package_dir, "portrait.png");
    let offline_portrait_path = optional_asset_path(package_dir, "portrait-offline.png");

    Ok(ImportedPetPackageSummary {
        id: format!("{IMPORTED_PREFIX}{}", manifest.id),
        manifest_id: manifest.id,
        format_version: manifest.format_version,
        renderer: manifest.renderer.unwrap_or_default(),
        name: manifest.name.trim().to_string(),
        base_size: manifest.base_size,
        frame_size: manifest.frame_size,
        preview_path: preview_path.to_string_lossy().to_string(),
        portrait_path,
        offline_portrait_path,
        actions: manifest.actions,
        scenes: manifest.scenes,
        frame_paths,
        default_motion,
        motions,
        motion_frame_paths,
    })
}

fn optional_asset_path(package_dir: &Path, file_name: &str) -> Option<String> {
    let path = package_dir.join(file_name);

    path.exists().then(|| path.to_string_lossy().to_string())
}

fn read_v2_frame_paths(package_dir: &Path) -> Result<BTreeMap<String, Vec<String>>, String> {
    let mut frame_paths = BTreeMap::new();
    for action in REQUIRED_ACTIONS {
        let mut action_frames = Vec::with_capacity(PET_FRAMES_PER_ACTION);

        for frame_index in 1..=PET_FRAMES_PER_ACTION {
            let frame_path = package_dir.join(expected_frame_path(action, frame_index));
            if !frame_path.exists() {
                return Err(format!(
                    "缺少帧文件: {}",
                    expected_frame_path(action, frame_index)
                ));
            }

            action_frames.push(frame_path.to_string_lossy().to_string());
        }

        frame_paths.insert(action.to_string(), action_frames);
    }

    Ok(frame_paths)
}

fn read_motion_frame_paths(
    package_dir: &Path,
    manifest: &PetPackageManifest,
) -> Result<BTreeMap<String, Vec<String>>, String> {
    let mut paths = BTreeMap::new();
    for (motion_id, motion) in &manifest.motions {
        let mut frames = Vec::with_capacity(motion.frame_count);
        for index in 1..=motion.frame_count {
            let relative_path = format!("motions/{motion_id}/{index:04}.png");
            let frame_path = package_dir.join(&relative_path);
            if !frame_path.exists() {
                return Err(format!("缺少帧文件: {relative_path}"));
            }

            frames.push(frame_path.to_string_lossy().to_string());
        }
        paths.insert(motion_id.clone(), frames);
    }

    Ok(paths)
}

fn build_motion_frame_paths_from_v2_actions(
    package_dir: &Path,
) -> Result<BTreeMap<String, Vec<String>>, String> {
    read_v2_frame_paths(package_dir)
}

fn build_motion_manifests_from_v2_actions(
    actions: &BTreeMap<String, PackageAction>,
) -> BTreeMap<String, PackageMotion> {
    actions
        .iter()
        .map(|(action, config)| {
            (
                action.clone(),
                PackageMotion {
                    fps: config.fps,
                    loop_value: config.loop_value,
                    frame_count: config.frame_count,
                    duration_ms: config.duration_ms,
                    frames: config.frames.clone(),
                    weight: default_motion_weight(),
                    tags: default_motion_tags(),
                },
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::Write,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{
        delete_pet_package_from_root, import_pet_package_from_path, list_pet_packages_from_root,
        MAX_SINGLE_FILE_SIZE_BYTES,
    };

    const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    const REQUIRED_ACTIONS: [&str; 12] = [
        "idle-breathe",
        "idle-look",
        "idle-stretch",
        "walk",
        "drag",
        "sleep",
        "act-cute",
        "act-typing",
        "act-wave",
        "act-hug",
        "act-pout",
        "act-drowsy",
    ];

    #[test]
    fn imports_valid_package_and_lists_it() {
        let temp = unique_temp_dir("valid-package");
        let source = temp.join("moon.cdpet");
        write_test_package(&source, "moon-buddy", true, false);
        let root = temp.join("packages");

        let imported = import_pet_package_from_path(&source, &root).unwrap();
        assert_eq!(imported.id, "imported:moon-buddy");
        assert_eq!(imported.manifest_id, "moon-buddy");
        assert_eq!(imported.format_version, 2);
        assert_eq!(imported.renderer, "frame-sequence");
        assert_eq!(imported.default_motion.as_deref(), Some("idle-breathe"));
        assert!(imported.preview_path.ends_with("preview.png"));
        assert_eq!(imported.frame_paths["idle-breathe"].len(), 30);
        assert_eq!(imported.motion_frame_paths["idle-breathe"].len(), 30);
        assert_eq!(imported.actions["idle-breathe"].fps, 5.0);
        assert_eq!(imported.actions["idle-breathe"].frame_count, 30);
        assert_eq!(imported.actions["idle-breathe"].duration_ms, 6000);
        assert_eq!(imported.motions["idle-breathe"].frame_count, 30);
        assert_eq!(imported.scenes["act-cute"].action, "act-cute");
        assert_eq!(
            imported.scenes["remote-message"].wait_for_acknowledge,
            Some(true)
        );

        let packages = list_pet_packages_from_root(&root).unwrap();
        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].id, "imported:moon-buddy");

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn imports_optional_presence_portraits_and_reports_paths() {
        let temp = unique_temp_dir("presence-portraits");
        let source = temp.join("moon.cdpet");
        let root = temp.join("packages");

        write_test_package_with_portraits(&source, "moon-buddy");

        let imported = import_pet_package_from_path(&source, &root).unwrap();

        assert!(imported
            .portrait_path
            .as_deref()
            .is_some_and(|path| path.ends_with("portrait.png")));
        assert!(imported
            .offline_portrait_path
            .as_deref()
            .is_some_and(|path| path.ends_with("portrait-offline.png")));

        let packages = list_pet_packages_from_root(&root).unwrap();
        assert!(packages[0]
            .portrait_path
            .as_deref()
            .is_some_and(|path| path.ends_with("portrait.png")));
        assert!(packages[0]
            .offline_portrait_path
            .as_deref()
            .is_some_and(|path| path.ends_with("portrait-offline.png")));

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn imports_valid_v3_package_with_one_motion() {
        let temp = unique_temp_dir("valid-v3-motion-pool");
        let source = temp.join("moon.cdpet");
        let root = temp.join("packages");

        write_v3_test_package(&source, "moon-buddy", &[("motion-001", 30)]);

        let imported = import_pet_package_from_path(&source, &root).unwrap();

        assert_eq!(imported.manifest_id, "moon-buddy");
        assert_eq!(imported.format_version, 3);
        assert_eq!(imported.renderer, "motion-pool");
        assert_eq!(imported.default_motion.as_deref(), Some("motion-001"));
        assert_eq!(imported.motions["motion-001"].frame_count, 30);
        assert_eq!(
            imported
                .motion_frame_paths
                .get("motion-001")
                .map(|frames| frames.len()),
            Some(30)
        );

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn imports_valid_v3_package_with_multiple_motions() {
        let temp = unique_temp_dir("valid-v3-multiple-motions");
        let source = temp.join("moon.cdpet");
        let root = temp.join("packages");
        let manifest = v3_test_manifest(
            "moon-buddy",
            "motion-001",
            &[("motion-001", 30), ("motion-002", 2)],
        );

        write_test_package_with_manifest_and_motion_frames(
            &source,
            &manifest,
            &[("motion-001", 30), ("motion-002", 2)],
        );

        let imported = import_pet_package_from_path(&source, &root).unwrap();

        assert_eq!(imported.default_motion.as_deref(), Some("motion-001"));
        assert_eq!(imported.motions["motion-001"].frame_count, 30);
        assert_eq!(imported.motions["motion-002"].frame_count, 2);
        assert_eq!(imported.motion_frame_paths["motion-001"].len(), 30);
        assert_eq!(imported.motion_frame_paths["motion-002"].len(), 2);

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_v3_package_when_default_motion_is_missing() {
        let temp = unique_temp_dir("v3-missing-default-motion");
        let source = temp.join("moon.cdpet");
        let root = temp.join("packages");
        let manifest = v3_test_manifest("moon-buddy", "missing-motion", &[("motion-001", 30)]);

        write_test_package_with_manifest_and_motion_frames(
            &source,
            &manifest,
            &[("motion-001", 30)],
        );

        let error = import_pet_package_from_path(&source, &root).unwrap_err();

        assert!(
            error.contains("defaultMotion 必须指向已存在的 motion"),
            "{error}"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_v3_package_when_motion_frame_is_missing() {
        let temp = unique_temp_dir("v3-missing-frame");
        let source = temp.join("moon.cdpet");
        let root = temp.join("packages");
        let manifest = v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 2)]);

        write_test_package_with_manifest_and_motion_frames(
            &source,
            &manifest,
            &[("motion-001", 1)],
        );

        let error = import_pet_package_from_path(&source, &root).unwrap_err();

        assert!(
            error.contains("缺少帧文件: motions/motion-001/0002.png"),
            "{error}"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_v3_package_when_motion_contract_is_invalid() {
        for (case_name, manifest, expected_error) in [
            (
                "v3-invalid-fps",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 30)])
                    .replace(r#""fps": 5"#, r#""fps": 13"#),
                "motion 帧率必须在 1 到 12 fps",
            ),
            (
                "v3-invalid-frame-count",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 61)]),
                "motion 帧数量必须在 1 到 60",
            ),
            (
                "v3-invalid-duration",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 30)])
                    .replace(r#""durationMs": 6000"#, r#""durationMs": 12001"#),
                "motion 时长必须在 3000 到 12000ms",
            ),
            (
                "v3-invalid-frames-dir",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 30)]).replace(
                    r#""frames": "motions/motion-001/""#,
                    r#""frames": "motions/other-motion/""#,
                ),
                "motion 帧目录无效",
            ),
            (
                "v3-invalid-weight",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 30)])
                    .replace(r#""weight": 1"#, r#""weight": 0"#),
                "motion 权重必须大于 0",
            ),
            (
                "v3-empty-tags",
                v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 30)])
                    .replace(r#""tags": ["idle"]"#, r#""tags": [" "]"#),
                "motion 至少需要一个有效标签",
            ),
        ] {
            let temp = unique_temp_dir(case_name);
            let source = temp.join("bad.cdpet");
            let root = temp.join("packages");

            write_test_package_with_manifest_and_motion_frames(
                &source,
                &manifest,
                &[("motion-001", 30), ("motion-002", 30)],
            );

            let error = import_pet_package_from_path(&source, &root).unwrap_err();

            assert!(
                error.contains(expected_error),
                "{case_name} produced {error}"
            );
            let _ = fs::remove_dir_all(temp);
        }
    }

    #[test]
    fn rejects_missing_required_frame() {
        let temp = unique_temp_dir("missing-frame");
        let source = temp.join("broken.cdpet");
        write_test_package(&source, "broken", false, false);
        let root = temp.join("packages");

        let error = import_pet_package_from_path(&source, &root).unwrap_err();
        assert!(error.contains("缺少帧文件"));

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_path_traversal_entries() {
        let temp = unique_temp_dir("path-traversal");
        let source = temp.join("bad.cdpet");
        write_test_package(&source, "bad", true, true);
        let root = temp.join("packages");

        let error = import_pet_package_from_path(&source, &root).unwrap_err();
        assert!(error.contains("非法路径"));

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_extra_png_files_outside_standard_frame_set() {
        for (case_name, extra_path) in [
            ("extra-frame", "frames/extra.png"),
            ("unknown-action", "frames/unknown/0001.png"),
            ("overflow-index", "frames/act-cute/0031.png"),
            ("nested-portrait", "assets/portrait.png"),
            ("jpg-portrait", "portrait.jpg"),
        ] {
            let temp = unique_temp_dir(case_name);
            let source = temp.join("bad.cdpet");
            write_test_package_with_extra_file(&source, "bad-extra", extra_path, &PNG_SIGNATURE);
            let root = temp.join("packages");

            let error = import_pet_package_from_path(&source, &root).unwrap_err();
            assert!(
                error.contains("资源包包含不支持的文件"),
                "{extra_path} produced {error}"
            );

            let _ = fs::remove_dir_all(temp);
        }
    }

    #[test]
    fn rejects_package_entries_over_the_single_file_limit() {
        let temp = unique_temp_dir("single-file-too-large");
        let source = temp.join("large.cdpet");
        write_test_package_with_large_preview(&source, "large-preview");
        let root = temp.join("packages");

        let error = import_pet_package_from_path(&source, &root).unwrap_err();
        assert!(error.contains("资源包单个文件过大"), "{error}");

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_remote_message_scene_without_acknowledgement_contract() {
        let missing_ack =
            test_manifest("missing-ack").replace(",\n      \"waitForAcknowledge\": true", "");
        let false_ack = test_manifest("false-ack").replace(
            "\"waitForAcknowledge\": true",
            "\"waitForAcknowledge\": false",
        );

        for (case_name, manifest) in [
            ("remote-message-missing-ack", missing_ack),
            ("remote-message-false-ack", false_ack),
        ] {
            let temp = unique_temp_dir(case_name);
            let source = temp.join("bad.cdpet");
            write_test_package_with_manifest(&source, &manifest);
            let root = temp.join("packages");

            let error = import_pet_package_from_path(&source, &root).unwrap_err();
            assert!(
                error.contains("remote-message"),
                "{case_name} produced {error}"
            );

            let _ = fs::remove_dir_all(temp);
        }
    }

    #[test]
    fn rejects_remote_message_scene_without_remote_message_cue() {
        let manifest = test_manifest("missing-remote-cue").replace(
            r#"{ "atMs": 1000, "source": "remoteMessage" }"#,
            r#"{ "atMs": 1000, "text": "普通气泡" }"#,
        );
        let temp = unique_temp_dir("remote-message-missing-source");
        let source = temp.join("bad.cdpet");
        write_test_package_with_manifest(&source, &manifest);
        let root = temp.join("packages");

        let error = import_pet_package_from_path(&source, &root).unwrap_err();
        assert!(error.contains("remote-message"), "{error}");

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_manifest_sizes_above_the_frontend_contract_limit() {
        let base_too_large = test_manifest("base-too-large").replace(
            r#""baseSize": { "width": 256, "height": 320 }"#,
            r#""baseSize": { "width": 256, "height": 4096 }"#,
        );
        let frame_too_large = test_manifest("frame-too-large").replace(
            r#""frameSize": { "width": 768, "height": 960 }"#,
            r#""frameSize": { "width": 4096, "height": 960 }"#,
        );

        for (case_name, manifest) in [
            ("base-size-too-large", base_too_large),
            ("frame-size-too-large", frame_too_large),
        ] {
            let temp = unique_temp_dir(case_name);
            let source = temp.join("bad.cdpet");
            write_test_package_with_manifest(&source, &manifest);
            let root = temp.join("packages");

            let error = import_pet_package_from_path(&source, &root).unwrap_err();
            assert!(
                error.contains("Size") || error.contains("size"),
                "{case_name} produced {error}"
            );

            let _ = fs::remove_dir_all(temp);
        }
    }

    #[test]
    fn rejects_legacy_v1_package_with_upgrade_message() {
        let temp = unique_temp_dir("legacy-v1");
        let source = temp.join("legacy.cdpet");
        write_legacy_v1_package(&source, "old-star");
        let root = temp.join("packages");

        let error = import_pet_package_from_path(&source, &root).unwrap_err();
        assert_eq!(error, "旧版资源包动作标准过低，请使用新版生成器重新生成。");

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn deletes_imported_package() {
        let temp = unique_temp_dir("delete-package");
        let source = temp.join("moon.cdpet");
        write_test_package(&source, "moon-buddy", true, false);
        let root = temp.join("packages");

        import_pet_package_from_path(&source, &root).unwrap();
        delete_pet_package_from_root(&root, "imported:moon-buddy").unwrap();

        assert!(list_pet_packages_from_root(&root).unwrap().is_empty());
        let _ = fs::remove_dir_all(temp);
    }

    fn unique_temp_dir(name: &str) -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("couple-pet-{name}-{id}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_test_package(
        source: &Path,
        manifest_id: &str,
        include_all_frames: bool,
        include_path_traversal: bool,
    ) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        write_standard_entries(&mut zip, options, manifest_id, include_all_frames);

        if include_path_traversal {
            zip.start_file("../escape.png", options).unwrap();
            zip.write_all(&PNG_SIGNATURE).unwrap();
        }

        zip.finish().unwrap();
    }

    fn write_test_package_with_portraits(source: &Path, manifest_id: &str) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        write_standard_entries(&mut zip, options, manifest_id, true);

        zip.start_file("portrait.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();
        zip.start_file("portrait-offline.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();

        zip.finish().unwrap();
    }

    fn write_standard_entries(
        zip: &mut ZipWriter<fs::File>,
        options: SimpleFileOptions,
        manifest_id: &str,
        include_all_frames: bool,
    ) {
        zip.start_file("pet.json", options).unwrap();
        zip.write_all(test_manifest(manifest_id).as_bytes())
            .unwrap();

        zip.start_file("preview.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();

        for action in REQUIRED_ACTIONS {
            for index in 1..=30 {
                if !include_all_frames && action == "act-drowsy" && index == 30 {
                    continue;
                }

                zip.start_file(format!("frames/{action}/{index:04}.png"), options)
                    .unwrap();
                zip.write_all(&PNG_SIGNATURE).unwrap();
            }
        }
    }

    fn write_test_package_with_extra_file(
        source: &Path,
        manifest_id: &str,
        extra_path: &str,
        extra_contents: &[u8],
    ) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        write_standard_entries(&mut zip, options, manifest_id, true);

        zip.start_file(extra_path, options).unwrap();
        zip.write_all(extra_contents).unwrap();
        zip.finish().unwrap();
    }

    fn write_test_package_with_large_preview(source: &Path, manifest_id: &str) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("pet.json", options).unwrap();
        zip.write_all(test_manifest(manifest_id).as_bytes())
            .unwrap();

        zip.start_file("preview.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();
        let padding_len = (MAX_SINGLE_FILE_SIZE_BYTES + 1) as usize - PNG_SIGNATURE.len();
        zip.write_all(&vec![0_u8; padding_len]).unwrap();

        for action in REQUIRED_ACTIONS {
            for index in 1..=30 {
                zip.start_file(format!("frames/{action}/{index:04}.png"), options)
                    .unwrap();
                zip.write_all(&PNG_SIGNATURE).unwrap();
            }
        }

        zip.finish().unwrap();
    }

    fn write_test_package_with_manifest(source: &Path, manifest_contents: &str) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("pet.json", options).unwrap();
        zip.write_all(manifest_contents.as_bytes()).unwrap();

        zip.start_file("preview.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();

        for action in REQUIRED_ACTIONS {
            for index in 1..=30 {
                zip.start_file(format!("frames/{action}/{index:04}.png"), options)
                    .unwrap();
                zip.write_all(&PNG_SIGNATURE).unwrap();
            }
        }

        zip.finish().unwrap();
    }

    fn write_v3_test_package(source: &Path, manifest_id: &str, motions: &[(&str, usize)]) {
        let manifest = v3_test_manifest(manifest_id, motions[0].0, motions);
        write_test_package_with_manifest_and_motion_frames(source, &manifest, motions);
    }

    fn write_test_package_with_manifest_and_motion_frames(
        source: &Path,
        manifest_contents: &str,
        motions: &[(&str, usize)],
    ) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("pet.json", options).unwrap();
        zip.write_all(manifest_contents.as_bytes()).unwrap();

        zip.start_file("preview.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();

        for (motion_id, frame_count) in motions {
            for index in 1..=*frame_count {
                zip.start_file(format!("motions/{motion_id}/{index:04}.png"), options)
                    .unwrap();
                zip.write_all(&PNG_SIGNATURE).unwrap();
            }
        }

        zip.finish().unwrap();
    }

    fn v3_test_manifest(
        manifest_id: &str,
        default_motion: &str,
        motions: &[(&str, usize)],
    ) -> String {
        let motion_entries = motions
            .iter()
            .map(|(motion_id, frame_count)| {
                format!(
                    r#""{motion_id}": {{ "fps": 5, "loop": true, "frameCount": {frame_count}, "durationMs": 6000, "frames": "motions/{motion_id}/", "weight": 1, "tags": ["idle"] }}"#
                )
            })
            .collect::<Vec<_>>()
            .join(",");

        format!(
            r#"{{
  "formatVersion": 3,
  "renderer": "motion-pool",
  "id": "{manifest_id}",
  "name": "测试形象",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 768, "height": 960 }},
  "defaultMotion": "{default_motion}",
  "motions": {{ {motion_entries} }}
}}"#
        )
    }

    fn test_manifest(manifest_id: &str) -> String {
        let actions = REQUIRED_ACTIONS
            .iter()
            .map(|action| {
                let loop_value = action.starts_with("idle")
                    || matches!(*action, "walk" | "drag" | "sleep");
                format!(
                    r#""{action}": {{ "fps": 5, "loop": {loop_value}, "frameCount": 30, "durationMs": 6000, "frames": "frames/{action}/" }}"#
                )
            })
            .collect::<Vec<_>>()
            .join(",");

        format!(
            r#"{{
  "formatVersion": 2,
  "renderer": "frame-sequence",
  "id": "{manifest_id}",
  "name": "测试形象",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 768, "height": 960 }},
  "actions": {{ {actions} }},
  "scenes": {{
    "act-cute": {{
      "action": "act-cute",
      "bubbleCues": [{{ "atMs": 1800, "text": "陪我一会儿嘛。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-typing": {{
      "action": "act-typing",
      "bubbleCues": [{{ "atMs": 1800, "text": "我也在努力敲代码。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-wave": {{
      "action": "act-wave",
      "bubbleCues": [{{ "atMs": 1200, "text": "嗨，我在这里！" }}],
      "returnTo": "idle-breathe"
    }},
    "act-hug": {{
      "action": "act-hug",
      "bubbleCues": [{{ "atMs": 2000, "text": "可以抱一下吗？" }}],
      "returnTo": "idle-breathe"
    }},
    "act-pout": {{
      "action": "act-pout",
      "bubbleCues": [{{ "atMs": 1800, "text": "哼，快哄我。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-drowsy": {{
      "action": "act-drowsy",
      "bubbleCues": [{{ "atMs": 2200, "text": "有点困啦。" }}],
      "returnTo": "idle-breathe"
    }},
    "remote-message": {{
      "action": "act-wave",
      "bubbleCues": [{{ "atMs": 1000, "source": "remoteMessage" }}],
      "waitForAcknowledge": true,
      "returnTo": "idle-breathe"
    }}
  }}
}}"#
        )
    }

    fn write_legacy_v1_package(source: &Path, manifest_id: &str) {
        let file = fs::File::create(source).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("pet.json", options).unwrap();
        zip.write_all(
            format!(
                r#"{{
  "formatVersion": 1,
  "id": "{manifest_id}",
  "name": "旧版",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 512, "height": 512 }},
  "actions": {{}}
}}"#
            )
            .as_bytes(),
        )
        .unwrap();

        zip.start_file("preview.png", options).unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();
        zip.finish().unwrap();
    }
}
