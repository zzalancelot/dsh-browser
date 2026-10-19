#!/bin/bash
# 一键安装当前 checkout：DSH 桥插件 + Chrome 扩展。
# One-click install from the current checkout: DSH bridge plugin + Chrome extension.
#
# 用法 / Usage（在仓库根目录）:
#   ./scripts/install-dev.sh
#
# 可选环境变量 / Optional env:
#   DSH_HOME          默认 ~/.dsh
#   DSH_INSTALL_BRANCH  若设置，先 git checkout 该分支再安装（例如 maintain）
#   DSH_INSTALL_IN_PLACE=1  不从 checkout 同步到 ~/.dsh/dsh-browser，直接就地安装
#
set -euo pipefail

DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
MANAGED_ROOT="$DSH_HOME_DIR/dsh-browser"
WEB_PROFILE_DIR="$DSH_HOME_DIR/profiles/web"
WEB_PROFILE_MANIFEST="$WEB_PROFILE_DIR/package.json"
DIST_DIR="$DSH_HOME_DIR/browser-extension"
PLUGIN_NAME="@yuxianglin/dsh-bridge-browser"
LEGACY_PLUGIN="@deepseek-ai/dsh-bridge-browser"
REGISTRY="${npm_config_registry:-https://registry.npmjs.org/}"

print_pair() {
  printf '%s\n' "$1"
  printf '   %s\n' "$2"
}

fail_pair() {
  printf '\n错误：%s\n' "$1" >&2
  printf 'Error: %s\n' "$2" >&2
  exit 1
}

print_step() {
  printf '\n[%s/5] %s\n' "$1" "$2"
  printf '      %s\n' "$3"
}

is_macos() {
  [ "$(uname -s)" = "Darwin" ]
}

has_workspace() {
  local candidate="$1"
  [ -f "$candidate/package.json" ] &&
    [ -f "$candidate/pnpm-lock.yaml" ] &&
    [ -f "$candidate/extensions/dsh-browser/package.json" ] &&
    [ -f "$candidate/packages/browser/bridge-browser/package.json" ]
}

workspace_root_from_script() {
  local script_path="${BASH_SOURCE[0]:-}"
  local script_dir candidate
  [ -n "$script_path" ] && [ -f "$script_path" ] || return 1
  script_dir="$(cd "$(dirname "$script_path")" && pwd)"
  candidate="$(cd "$script_dir/.." && pwd)"
  has_workspace "$candidate" || return 1
  printf '%s\n' "$candidate"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail_pair "$2" "$3"
}

# Prefer a real pnpm 11 binary. Avoid npx/corepack resolving 9.x/10.x in some shells.
resolve_pnpm() {
  local candidate version
  for candidate in /usr/local/bin/pnpm /opt/homebrew/bin/pnpm "$(command -v pnpm 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    version="$("$candidate" -v 2>/dev/null || true)"
    case "$version" in
      11.*)
        printf '%s\n' "$candidate"
        return 0
        ;;
    esac
  done
  if command -v corepack >/dev/null 2>&1; then
    corepack prepare pnpm@11.7.0 --activate >/dev/null 2>&1 || true
    version="$(pnpm -v 2>/dev/null || true)"
    case "$version" in
      11.*)
        command -v pnpm
        return 0
        ;;
    esac
  fi
  return 1
}

find_browser_target() {
  local name dir app
  if is_macos; then
    for dir in "/Applications" "$HOME/Applications"; do
      for name in "Google Chrome" "Google Chrome Canary" "Chromium"; do
        app="$dir/$name.app"
        if [ -x "$app/Contents/MacOS/$name" ]; then
          printf '%s\n' "$app"
          return 0
        fi
      done
    done
    for name in "Google Chrome" "Google Chrome Canary" "Chromium"; do
      if open -Ra "$name" >/dev/null 2>&1; then
        printf '%s\n' "$name"
        return 0
      fi
    done
    return 1
  fi
  for name in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$name" >/dev/null 2>&1; then
      printf '%s\n' "$name"
      return 0
    fi
  done
  return 1
}

open_chrome_extensions() {
  local url="chrome://extensions"
  local target
  target="$(find_browser_target)" || target=""
  if is_macos; then
    if [ -n "$target" ]; then
      open -a "$target" "$url" >/dev/null 2>&1 && return 0
    fi
    open -b com.google.Chrome "$url" >/dev/null 2>&1 && return 0
    return 1
  fi
  if [ -n "$target" ]; then
    "$target" "$url" >/dev/null 2>&1 </dev/null &
    sleep 1
    return 0
  fi
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" >/dev/null 2>&1 && return 0
  return 1
}

copy_to_clipboard() {
  local text="$1"
  if is_macos && command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$text" | pbcopy && return 0
  fi
  return 1
}

link_bridge_into_web_profile() {
  local manifest="$1"
  local plugin_path="$2"
  mkdir -p "$(dirname "$manifest")"
  if [ ! -f "$manifest" ]; then
    printf '%s\n' '{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
}' >"$manifest"
  fi
  node -e '
    const fs = require("node:fs");
    const [manifestPath, pluginName, pluginPath, legacyName] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    pkg.dependencies = pkg.dependencies ?? {};
    delete pkg.dependencies[legacyName];
    pkg.dependencies[pluginName] = `link:${pluginPath}`;
    pkg.dsh = pkg.dsh ?? {};
    pkg.dsh.profile = pkg.dsh.profile ?? {};
    const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
    pkg.dsh.profile.bundles = [
      ...bundles.filter((name) => name !== legacyName && name !== pluginName),
      pluginName,
    ];
    fs.writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`linked ${pluginName} -> ${pluginPath}`);
  ' "$manifest" "$PLUGIN_NAME" "$plugin_path" "$LEGACY_PLUGIN"
}

# --- main ---

require_command node "未找到 Node.js；请先安装受支持的 Node.js 版本。" "Node.js was not found; install a supported Node.js version first."
require_command rsync "未找到 rsync；请先安装 rsync。" "rsync was not found; install rsync first."
require_command git "未找到 git。" "git was not found."

SOURCE_ROOT="$(workspace_root_from_script)" || fail_pair \
  "请在 dsh-browser 仓库中运行本脚本（scripts/install-dev.sh）。" \
  "Run this script from a dsh-browser checkout (scripts/install-dev.sh)."

PNPM_BIN="$(resolve_pnpm)" || fail_pair \
  "需要 pnpm 11.x（当前环境未找到）。可用 Corepack：corepack prepare pnpm@11.7.0 --activate" \
  "pnpm 11.x is required but was not found. Try: corepack prepare pnpm@11.7.0 --activate"

cd "$SOURCE_ROOT"

if [ -n "${DSH_INSTALL_BRANCH:-}" ]; then
  print_pair "切换到分支 ${DSH_INSTALL_BRANCH}……" "Checking out branch ${DSH_INSTALL_BRANCH}…"
  git checkout "$DSH_INSTALL_BRANCH"
fi

GIT_HEAD="$(git rev-parse HEAD)"
GIT_DESC="$(git rev-parse --short HEAD) $(git log -1 --format=%s)"

print_pair "当前提交：${GIT_DESC}" "Installing from: ${GIT_DESC}"
print_pair "使用 pnpm：$($PNPM_BIN -v) @ ${PNPM_BIN}" "Using pnpm: $($PNPM_BIN -v) @ ${PNPM_BIN}"

if [ "${DSH_INSTALL_IN_PLACE:-0}" = "1" ]; then
  ROOT="$SOURCE_ROOT"
  INSTALL_MODE="checkout"
  print_pair "就地安装模式（不复制到 ~/.dsh/dsh-browser）。" "In-place install (not copying into ~/.dsh/dsh-browser)."
else
  ROOT="$MANAGED_ROOT"
  INSTALL_MODE="managed"
  print_step 1 "同步源码到托管目录" "Sync checkout into the managed directory"
  rm -rf "$MANAGED_ROOT"
  mkdir -p "$MANAGED_ROOT"
  git archive HEAD | tar -x -C "$MANAGED_ROOT"
  touch "$MANAGED_ROOT/.managed-by-install-sh"
  print_pair "已同步到 ${MANAGED_ROOT}" "Synced to ${MANAGED_ROOT}"
fi

EXT="$ROOT/extensions/dsh-browser"
PLUGIN="$ROOT/packages/browser/bridge-browser"

print_step 2 "安装依赖并构建桥插件" "Install deps and build the bridge plugin"
(
  cd "$ROOT"
  CI=true "$PNPM_BIN" install --frozen-lockfile --registry "$REGISTRY"
  "$PNPM_BIN" --filter @yuxianglin/dsh-bridge-browser run build
)

print_step 3 "注册桥插件到 web profile" "Register the bridge into the web profile"
mkdir -p "$WEB_PROFILE_DIR"
link_bridge_into_web_profile "$WEB_PROFILE_MANIFEST" "$PLUGIN"
# Avoid CI frozen-lockfile after rewriting the link path; force the pnpm 11 binary.
(
  cd "$WEB_PROFILE_DIR"
  rm -rf node_modules
  env -u CI "$PNPM_BIN" --dir "$WEB_PROFILE_DIR" install --no-frozen-lockfile --registry "$REGISTRY"
)
if [ -f "$WEB_PROFILE_DIR/node_modules/.modules.yaml" ]; then
  grep -E 'packageManager:|storeDir:' "$WEB_PROFILE_DIR/node_modules/.modules.yaml" || true
fi

print_step 4 "构建 Chrome 扩展" "Build the Chrome extension"
(
  cd "$ROOT"
  CI=true "$PNPM_BIN" --filter dsh-browser-extension run build
)

print_step 5 "同步扩展并打开 Chrome" "Sync the extension and open Chrome"
if [ -f "$DIST_DIR/manifest.json" ]; then
  IS_UPDATE=1
else
  IS_UPDATE=0
fi
mkdir -p "$DIST_DIR"
rsync -a --delete-after "$EXT/dist/" "$DIST_DIR/"
node -e '
  const { writeFileSync } = require("node:fs");
  const [filename, mode, sourceRoot, gitHead] = process.argv.slice(1);
  writeFileSync(filename, `${JSON.stringify({
    schemaVersion: 1,
    mode,
    sourceRoot,
    gitHead,
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`);
' "$DIST_DIR/install-info.json" "$INSTALL_MODE" "$ROOT" "$GIT_HEAD"

if copy_to_clipboard "$DIST_DIR"; then
  CLIPBOARD_READY=1
else
  CLIPBOARD_READY=0
fi

if open_chrome_extensions; then
  CHROME_OPENED=1
else
  CHROME_OPENED=0
fi

printf '\n'
print_pair "安装完成。" "Install finished."
print_pair "扩展目录：${DIST_DIR}" "Extension directory: ${DIST_DIR}"
if [ "$CLIPBOARD_READY" -eq 1 ]; then
  print_pair "路径已复制到剪贴板。" "Path copied to the clipboard."
fi
if [ "$CHROME_OPENED" -ne 1 ]; then
  print_pair "请手动打开 chrome://extensions。" "Open chrome://extensions manually."
fi
if [ "$IS_UPDATE" -eq 1 ]; then
  print_pair "若扩展已加载：在卡片上点「重新加载」。" "If the extension is already loaded: click Reload on its card."
else
  print_pair "首次安装：开启开发者模式 → 加载已解压的扩展程序 → 选择上面的扩展目录。" \
    "First install: enable Developer mode → Load unpacked → select the extension directory above."
fi
printf '\n'
print_pair "启动 DSH：" "Start DSH:"
printf '   cd %q && pnpm start\n' "$ROOT"
printf '\n'
print_pair "INSTALL_OK" "INSTALL_OK"
