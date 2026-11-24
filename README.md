# dsh Browser Control

**English** | [中文](README.zh.md)

<img width="1701" height="897" alt="dsh Browser Control" src="https://github.com/user-attachments/assets/3b1f3a25-f962-4e02-a9ef-d23e0d01fc8e" />

Connect [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) to the Chrome or Firefox tabs you are already using. The model can read page content, operate controls, navigate, and manage tabs while preserving your login state, session, and cookies. A side panel or sidebar provides the conversation UI.

`dsh` is DeepSeek AI's open-source, plugin-based agent harness. This repository provides a companion browser bridge plugin and Chrome/Firefox MV3 extension as one standalone pnpm workspace.

Browser operation is text-first: pages become structured text with a numbered inventory of interactive elements, and the model addresses those elements by number. When that text inventory cannot describe the page (canvas, captcha, graphics, or scrape failure), enabling **Screenshot enhancement** in Settings unlocks `browser_screenshot` as a visual fallback. dsh 0.1.5 multimodal chat remains separate—the side panel also accepts user-attached PNG, JPEG, WebP, and GIF images when the host advertises image support.

> [!IMPORTANT]
> The workspace is pinned to DSH 0.2.2-rc.5.

## Quick install

The installer installs the bridge plugin and Chrome extension.

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Lum1104/dsh-browser/refs/heads/main/scripts/install.sh | bash
```

Windows, in PowerShell:

```powershell
$s="$env:TEMP\dsh-install.ps1"; irm https://raw.githubusercontent.com/Lum1104/dsh-browser/refs/heads/main/scripts/install.ps1 -OutFile $s; powershell -NoProfile -ExecutionPolicy Bypass -File $s
```

When the installer opens `chrome://extensions`, follow its instructions to load or reload **dsh Browser Assistant**. If dsh is already running, restart it after installation. See [Detailed installation and usage](#detailed-installation-and-usage) for prerequisites, startup commands, updates, and developer installation.

> [!IMPORTANT]
> The unscoped [`dsh-browser`](https://www.npmjs.com/package/dsh-browser) package on npm belongs to a different project and is not affiliated with this repository. This project is not currently published as an npm package; use the installer above.

## Performance

In a paired 60-run end-to-end benchmark on August 18, 2026, both backends completed all 30 assigned runs successfully, while dsh Browser Control required fewer model/tool round trips and finished faster:

| Backend | Success | Mean end-to-end latency | Mean browser tool calls |
|---|---:|---:|---:|
| **dsh Browser Control** | **30/30** | **5.32 s** | **3.4** |
| Matched Playwright baseline | 30/30 | 6.67 s | 4.7 |

The paired Playwright / extension duration ratio was **1.24** (95% CI **1.16–1.34**): Playwright took about 24% longer, or equivalently, dsh Browser Control reduced latency by about 20% and saved 1.35 seconds per task on average. The suite used six browser tasks, five deterministic seeds, the same DSH profile and model (`deepseek-v4-flash`), and independently validated page state. See the [benchmark methodology and reproduction guide](benchmark/README.md).

## Core capabilities

| Capability | Tool | Notes |
|---|---|---|
| Read page | `browser_snapshot` | Structured text snapshot: title, URL, main text, numbered controls (including heuristic clickables), and masked form fields; `region` scopes text **and** inventory; `delta: true` returns only changes |
| Click element | `browser_click` | Click by snapshot index, CSS selector, or visible text (exactly one). Prefer higher `depth` for nested heuristics. Open picker panels expose `[overlay]` options; prefer `text:"2024"` / `text:"01"` for year/month cells. Dispatches pointerdown→mousedown→focus→mouseup→click |
| Fill forms | `browser_type` | Address by index or selector; React/Vue-compatible input; `replace` clears first; hidden date/select inputs are listed and writable. Writing a hidden input does **not** update controlled design-system pickers — click the panel cells instead |
| Focus element | `browser_focus` | Focus by index or selector before press/type |
| Upload file | `browser_upload` | Host reads an absolute local path (size/extension limits) into `input[type=file]`; requires approval |
| Press keys | `browser_press` | Sends a key to the focused element (Enter, Escape, arrows, Backspace, Delete). Does not move focus via Tab, does not produce IME text, and does not synthesize form submit while a picker/dropdown overlay is open |
| Scroll | `browser_scroll` | Viewport scrolling: up, down, top, and bottom |
| Navigate | `browser_navigate` / `browser_open_tab` / `browser_open_window` / `browser_back` / `browser_forward` / `browser_reload` | Navigation inside the controlled tab, open a URL in a new tab (`active:false` keeps the current tab in front), or open a new browser window (`focused:false` opens without stealing focus) |
| List tabs | `browser_list_tabs` | List accessible tabs with stable IDs, titles, URLs, window/index metadata, and active/controlled state |
| Follow tab | `browser_follow_tab` | Bind later browser tools to a tab returned by `browser_list_tabs`, and by default switch the visible browser to that tab |
| Close tab | `browser_close_tab` | Close a tab returned by `browser_list_tabs` |
| Read region | `browser_get_text` | Lazy-loaded or partial page text |
| Wait for stability | `browser_wait` | Page-load and render-settle detection |
| Automation signals | `browser_automation_signals` | Opt-in heuristic client-visible anti-automation / captcha signals (Settings → Automation signals probe; not a verdict) |
| Send images | `session.prompt` / `session.attachment` | Host-capability-gated image drafts, image-only prompts, and durable history previews |
| Quote a selection | side panel composer | Text you highlight in the page appears in the composer and is sent with your next message as fenced, attributed page content |
| Continue generating | side panel | Continue an interrupted response when the host offers it |

### Known limits

- Closed Shadow DOM is not readable from the content script.
- `browser_press` synthesizes keyboard events on the focused element; it does not move focus via Tab, cannot drive IME composition, and does not synthesize form submit while a floating picker/dropdown is open (persistent in-flow panels do not count). Trusted-event-only flows need CDP / `chrome.debugger` (out of scope).
- Nested heuristic controls expose `depth`; when a shallow click does nothing, retry a higher-depth sibling on the same chain.
- Visually hidden inputs are listed (values always masked) so agents can address them; assigning them with `browser_type` will not open panels or update React/Vue picker state — click overlay cells instead.
- The extension operates pages with synthetic `dispatchEvent` input, so `event.isTrusted` is always `false`. That cannot be forged from a content script; only CDP / `chrome.debugger` trusted input can change it (new permissions + a browser “debugging” banner). Stealth input settings reduce mechanical fingerprints (no durable `data-dsh-el` by default; optional pointer trail / minimal scroll) but do **not** promise evasion of site anti-automation.

## Repository layout

```
packages/browser/bridge-browser/
  cordis.patch.yml
extensions/dsh-browser/
scripts/install.sh
scripts/install.ps1
```

## Why this design

- **Your real browser, not a headless copy**: the model works in the page you already have open, retaining logins, sessions, and cookies.
- **A text-first page interface**: numbered controls, stable IDs across snapshots, delta updates, and masked sensitive values make pages operable without screenshots in the common case; with Screenshot enhancement enabled, `browser_screenshot` is the visual fallback when that text inventory fails, and user-attached chat images use dsh's separate multimodal message path.
- **Pointing instead of describing**: highlight the passage you mean and the side panel quotes it, so "explain this" needs no page tour. The quote is captured only while a panel is open, and nothing is sent until you send the message.
- **A narrow privacy boundary**: passwords, payment-card values, token/OTP-like fields, and CSS-hidden form inventory values are always rendered as `••••` and never leave the page.
- **A guarded bridge**: authenticated handshakes protect remote connections, privileged gateway methods reject non-loopback callers, and the extension binds tools to one user-controlled tab.

## Detailed installation and usage

Requirements: Node.js `>=24.9.0`, Corepack/pnpm, and Chrome 125+ or Firefox 140+. Windows additionally needs Windows PowerShell 5.1, which ships with Windows, or PowerShell 7+.

### Install or update

Run the [quick install command](#quick-install) to install or update. The installer opens `chrome://extensions`; load `~/.dsh/browser-extension` as an unpacked extension the first time, or click **Reload** after an update. Restart dsh if it is already running.

To install the current branch from a source checkout instead:

```sh
git clone https://github.com/Lum1104/dsh-browser.git
cd dsh-browser
./scripts/install.sh
```

On Windows, run `.\scripts\install.ps1` from the checkout instead. After pulling or switching revisions, rerun the installer and reload the extension.

### Uninstall

Open **Settings → Uninstall dsh-browser** in the extension, copy the command, and run it in Terminal.

You can also run it directly. On macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Lum1104/dsh-browser/refs/heads/main/scripts/uninstall.sh | bash
```

On Windows:

```powershell
& { $ErrorActionPreference = 'Stop'; $d=New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ('dsh-browser-uninstall.'+[Guid]::NewGuid().ToString('N'))); try { $s=Join-Path $d.FullName 'uninstall.ps1'; Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/Lum1104/dsh-browser/refs/heads/main/scripts/uninstall.ps1 -OutFile $s; powershell -NoProfile -ExecutionPolicy Bypass -File $s } finally { Remove-Item -LiteralPath $d.FullName -Recurse -Force } }
```

From a checkout, run `bash scripts/uninstall.sh` or `.\scripts\uninstall.ps1`.

### Firefox source build

Firefox uses a separate MV3 manifest, event-page background, and sidebar. Build it from a checkout, then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `extensions/dsh-browser/dist-firefox/manifest.json`:

```sh
pnpm install
pnpm --filter dsh-browser-extension run build:firefox
```

The bridge address is still auto-discovered. Firefox's `moz-extension://` UUID does not authenticate an add-on, so copy the bearer token from `~/.dsh/ext-bridge-token` into the extension settings (the dsh startup log reports that file's path). Signed distribution can package the same `dist-firefox/` output.

### Start and use

Start the managed installation with:

```sh
cd ~/.dsh/dsh-browser && pnpm start
```

From a source checkout, run `pnpm start` in the repository root. The exact supported public runtime is:

```sh
npx @deepseek-ai/dsh@0.2.2-rc.5 web
```

Local Chrome use requires no configuration; Firefox requires the local bridge token described above. Open a page, click the DeepSeek whale icon, and wait for **Connected**. Existing HTTP(S) tabs are instrumented on the first action. On browser-protected pages and extension stores, the model can read tab metadata and use browser-level HTTP(S) navigation, back, forward, and reload, but it cannot inspect or operate the protected page DOM.

## Troubleshooting

**Side panel stays "Not connected"**

- Make sure DSH is running. After installing or updating, restart DSH and reopen the side panel.
- Open **Settings → Detect** and select your DSH instance.
- In Firefox, enter the token from `~/.dsh/ext-bridge-token` in Settings.
- For a remote DSH instance, enter its server address and bridge token in Settings.

**Remote `--host 0.0.0.0` / LAN deployments**

1. On the host, run dsh with a reachable bind (for example `dsh web --host 0.0.0.0`). `/ext/bridge-config` answers with a `wsUrl` derived from the request `Host` (and `X-Forwarded-*` when present), so `http://192.168.2.185:3080/ext/bridge-config` returns `ws://192.168.2.185:3080/ext/bridge` instead of loopback.
2. On the client, open the side-panel settings, set the bridge address to `ws://<host-ip>:3080/ext/bridge`, and paste the bridge token from `~/.dsh/ext-bridge-token` on the host. The extension `connect-src` CSP already allows any `ws`/`http(s)` host, so no rebuild is required.

Do not expose `dsh web --host 0.0.0.0` on untrusted networks. Optional: `EXT_CONNECT_SRC` can still append extra origins at build time if you need a tighter or custom CSP.

## Development

The bridge plugin and Chrome/Firefox extension are both members of this repository's workspace. Run all commands from the repository root. For the first development installation, run `pnpm install`.

Package documentation: [browser bridge](packages/browser/bridge-browser/README.md) and [browser extension](extensions/dsh-browser/README.md).

```sh
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check:runtime
pnpm run test:smoke

pnpm --filter @yuxianglin/dsh-bridge-browser run build
pnpm --filter @yuxianglin/dsh-bridge-browser run typecheck
pnpm --filter @yuxianglin/dsh-bridge-browser run test

pnpm --filter dsh-browser-extension run build
pnpm --filter dsh-browser-extension run build:firefox
pnpm --filter dsh-browser-extension run test
```

Notes:

- The bridge plugin must have a built `lib/` before startup because the loader consumes it; both `scripts/install.sh` and the root `pnpm run build` build the plugin before the extension.
- The dependencies of `@deepseek-ai/dsh` and the bridge plugin are pinned to the same tested public release line. An upgrade must update the manifests and lockfile together and rerun the root checks.

`check:runtime` checks the resolved DSH dependencies and lockfile; `test:smoke` starts the real web host in a temporary DSH home and verifies the bridge and session reads after a restart, without model credentials. CI runs these checks after a clean installation.

After building, run `pnpm test:browser` with a Playwright Chromium installation, or set `CHROMIUM_PATH` to a Chromium executable that supports loading unpacked extensions. This starts real DSH and Chromium instances to verify sharing controls, developer-tools consent, input, iframe uploads and targeting, and CSS edits. Site isolation is enabled and verified for cross-site frames; element clicks, input, and scrolling cover same-origin, cross-origin, and nested frames. It needs no model credentials and saves results under `.artifacts/browser-smoke/`.

After building the extension, run `pnpm test:uninstall`. Run `pnpm test:uninstall:ui` for the settings UI tests; Playwright Chromium is required.

## Security

- The bridge path sits outside the `/api` trust boundary and performs its own bearer-token authentication.
- Local Chrome extension origins retain zero-configuration loopback access; Firefox origins are per-install UUIDs and must present the bearer token.
- Privileged gateway methods such as `settings.*`, `credentials.*`, and `host.open*` reject non-loopback sources.
- The browser-page pipeline is text-first; `browser_screenshot` is an opt-in visual fallback (Settings → Screenshot enhancement, off by default) on the controlled tab when text scrape fails. Explicitly attached chat images use dsh's durable attachment service. Password and payment-card values never leave the page.
- When work begins, the assistant binds to the active tab (at prompt submission, or at the first direct browser-tool call). If you switch tabs manually, later browser actions pause and the side panel asks whether the assistant should continue on the original tab or follow the new one. Choosing the original tab permits background operation; the extension never changes your visible tab. Enabling **Auto-follow current page** in Settings skips that prompt and retargets tools to the page you switched to. Closing the controlled tab also pauses tools until you explicitly select the current page.
- Text you highlight is captured only while a side panel is open and page sharing is not `off`, and never from password or payment-card fields. It stays inside the extension until you send the message, is dropped when you dismiss it or its page navigates or closes, and reaches the model inside the same untrusted-content boundary as page snapshots — including its source title and URL, which the page also controls.
- Page-authored text is wrapped as untrusted input. The default `auto` mode reads only the controlled tab without an extra prompt; privacy-sensitive users can select `ask` for per-read confirmation or `off` to block reads entirely. In `ask` mode, the read dialog can allow one read or persistently switch back to `auto`; this can be reversed in Settings. Read page text is sent to the selected model.
- Click, type, keypress, navigation, history, and reload calls fail closed until the user approves them. An origin may be trusted for the current side-panel session (cleared when the last panel closes or the service worker restarts), while permanent trust is managed explicitly in Settings. Explicit cross-origin `browser_navigate` calls and unknown history destinations always prompt again.
- **Allow unrestricted browser control** is an explicit global opt-in. It becomes active only after the setting is saved successfully; while enabled, page reads, page actions, and tab list/follow/close operations run without approval prompts. Calls capture their access mode when received, so enabling unrestricted control never retroactively elevates an existing restricted call. Disabling it takes effect immediately, cancels calls that have not dispatched an action, waits for already-dispatched browser operations to settle, and only then saves the restrictive setting. A rapid re-enable remains restricted until that revocation finishes, and concurrent saves persist in request order. Browser-protected DOM content remains inaccessible in either mode.
