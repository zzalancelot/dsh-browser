/**
 * Browser half of `@yuxianglin/dsh-bridge-browser`.
 *
 * When the host plugin is active, this client registers Plugins-page config
 * (bundle + row) that show the pasteable bridge WebSocket URL and (on the host)
 * the bearer token for remote Chrome / Firefox extension clients.
 */
window.__ModuleLoader__.load({
  id: '@yuxianglin/dsh-bridge-browser',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')

    const BRIDGE_PATH = '/ext/bridge'
    const BRIDGE_CONFIG_PATH = '/ext/bridge-config'
    const BRIDGE_UPDATE_CHECK_PATH = '/ext/bridge-update-check'
    const PACKAGE_NAME = '@yuxianglin/dsh-bridge-browser'
    const ROW_ID = 'bridge-browser'
    const LOCALE_NS = 'bridge-browser'
    const STYLE_ID = '@yuxianglin/dsh-bridge-browser/BridgeAddressRow'
    const inject = ['slots', 'locale']

    const dictionaries = {
      zh: {
        'settings.summary': '桥地址与 Token',
        'bridgeAddress.title': '浏览器桥地址',
        'bridgeAddress.help': '粘贴到 Chrome 扩展「桥地址」设置；本机一般无需 Token。',
        'bridgeAddress.copy': '复制',
        'bridgeAddress.copied': '已复制',
        'bridgeAddress.loading': '正在读取…',
        'bridgeAddress.unavailable': '暂时无法读取桥地址',
        'bridgeToken.title': '浏览器桥 Token',
        'bridgeToken.help': '局域网 / Firefox 扩展需要填写；本机回环一般可留空。复制后粘贴到扩展「Token」设置。',
        'bridgeToken.copy': '复制',
        'bridgeToken.copied': '已复制',
        'bridgeToken.loading': '正在读取…',
        'bridgeToken.unavailable': '仅本机可读取 Token（或暂时不可用）',
        'updateCheck.label': '检查更新',
        'updateCheck.action': '检查更新',
        'updateCheck.checking': '正在检查…',
        'updateCheck.upToDate': '已是最新',
        'updateCheck.available': '发现更新',
        'updateCheck.unavailable': '暂时无法检查',
        'updateCheck.retry': '重新检查',
        'updateCheck.openCompare': '查看变更',
      },
      en: {
        'settings.summary': 'Bridge address and token',
        'bridgeAddress.title': 'Browser bridge address',
        'bridgeAddress.help': 'Paste into the Chrome extension Bridge address setting. Loopback needs no token.',
        'bridgeAddress.copy': 'Copy',
        'bridgeAddress.copied': 'Copied',
        'bridgeAddress.loading': 'Loading…',
        'bridgeAddress.unavailable': 'Bridge address unavailable',
        'bridgeToken.title': 'Browser bridge token',
        'bridgeToken.help': 'Required for LAN / Firefox clients. Loopback usually needs none. Copy into the extension Token setting.',
        'bridgeToken.copy': 'Copy',
        'bridgeToken.copied': 'Copied',
        'bridgeToken.loading': 'Loading…',
        'bridgeToken.unavailable': 'Token is only available on the host (or temporarily unavailable)',
        'updateCheck.label': 'Check for updates',
        'updateCheck.action': 'Check for updates',
        'updateCheck.checking': 'Checking…',
        'updateCheck.upToDate': 'Up to date',
        'updateCheck.available': 'Update available',
        'updateCheck.unavailable': 'Could not check',
        'updateCheck.retry': 'Check again',
        'updateCheck.openCompare': 'View changes',
      },
    }

    function bridgeWsUrlFromLocation(location) {
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const hostname = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname
      const host = location.port === '' ? hostname : `${hostname}:${location.port}`
      return `${wsProtocol}//${host}${BRIDGE_PATH}`
    }

    async function resolveBridgeConfig(location) {
      const fallbackUrl = bridgeWsUrlFromLocation(location)
      try {
        const response = await fetch(`${location.origin}${BRIDGE_CONFIG_PATH}`, {
          signal: AbortSignal.timeout(1_500),
        })
        if (!response.ok) return { wsUrl: fallbackUrl }
        const body = await response.json()
        const wsUrl = typeof body?.wsUrl === 'string'
          && (body.wsUrl.startsWith('ws://') || body.wsUrl.startsWith('wss://'))
          ? body.wsUrl
          : fallbackUrl
        const token = typeof body?.token === 'string' && body.token !== '' ? body.token : undefined
        return { wsUrl, token }
      } catch {
        return { wsUrl: fallbackUrl }
      }
    }

    function installStyle() {
      if (typeof document === 'undefined') return () => {}
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) {
        return () => {}
      }
      const style = document.createElement('style')
      style.dataset.plugin = '@yuxianglin/dsh-bridge-browser'
      style.dataset.pluginCss = STYLE_ID
      style.textContent = [
        '.dshBridgePluginSettings{display:flex;flex-direction:column;gap:0;min-width:0}',
        '.dshBridgeAddressRow{border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:8px;padding:16px 0}',
        '.dshBridgePluginSettings .dshBridgeAddressRow:last-child{border-bottom:none}',
        '.dshBridgeAddressTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
        '.dshBridgeAddressHelp{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
        '.dshBridgeAddressBody{display:flex;align-items:center;gap:8px;min-width:0}',
        '.dshBridgeAddressValue{flex:1;min-width:0;margin:0;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:400 12px/18px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;user-select:all;-webkit-user-select:all;overflow-x:auto;white-space:nowrap}',
        '.dshBridgeAddressCopy{flex:none;height:32px;padding:0 12px;border:none;border-radius:16px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
        '.dshBridgeAddressCopy:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.dshBridgeAddressCopy:disabled{cursor:default;opacity:0.6}',
        '.dshBridgeUpdateCheck{margin-top:0;padding:0}',
        '.dshBridgeUpdateCheckRow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2);min-width:0}',
        '.dshBridgeUpdateCheckLabel{color:var(--dsw-alias-label-secondary);font-size:14px;font-weight:400;line-height:22px;flex:none}',
        '.dshBridgeUpdateCheckValue{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;flex:1}',
        '.dshBridgeUpdateCheckStatus{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;text-align:right}',
        '.dshBridgeUpdateCheckStatus[data-kind="muted"]{color:var(--dsw-alias-label-tertiary)}',
        '.dshBridgeUpdateCheckStatus[data-kind="ok"]{color:var(--dsw-alias-label-primary)}',
        '.dshBridgeUpdateCheckStatus[data-kind="warn"]{color:var(--dsw-alias-label-primary)}',
        '.dshBridgeUpdateCheckAction{flex:none;height:auto;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
        '.dshBridgeUpdateCheckAction:hover{opacity:0.85}',
        '.dshBridgeUpdateCheckAction:disabled{cursor:default;opacity:0.55;text-decoration:none}',
        '.dshBridgeUpdateCheckLink{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;text-decoration:underline;text-underline-offset:2px}',
      ].join('')
      document.head.append(style)
      return () => style.remove()
    }

    function useCopiedFlag() {
      const [copied, setCopied] = React.useState(false)
      React.useEffect(() => {
        if (!copied) return undefined
        const timer = window.setTimeout(() => setCopied(false), 1_500)
        return () => window.clearTimeout(timer)
      }, [copied])
      return [copied, setCopied]
    }

    async function copyText(text, valueSelector) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        const selection = window.getSelection()
        const node = document.querySelector(valueSelector)
        if (selection !== null && node instanceof HTMLElement) {
          const range = document.createRange()
          range.selectNodeContents(node)
          selection.removeAllRanges()
          selection.addRange(range)
        }
        return false
      }
    }

    function BridgeAddressRow({ t }) {
      const [address, setAddress] = React.useState('')
      const [status, setStatus] = React.useState('loading')
      const [copied, setCopied] = useCopiedFlag()

      React.useEffect(() => {
        let cancelled = false
        void resolveBridgeConfig(window.location).then((config) => {
          if (cancelled) return
          setAddress(config.wsUrl)
          setStatus('ready')
        }).catch(() => {
          if (cancelled) return
          setStatus('error')
        })
        return () => { cancelled = true }
      }, [])

      const onCopy = React.useCallback(async () => {
        if (address === '') return
        const ok = await copyText(address, '.dshBridgeAddressValue[data-kind="address"]')
        if (ok) setCopied(true)
      }, [address, setCopied])

      const value = status === 'loading'
        ? t('bridgeAddress.loading')
        : status === 'error'
          ? t('bridgeAddress.unavailable')
          : address

      return React.createElement(
        'div',
        { className: 'dshBridgeAddressRow' },
        React.createElement('div', { className: 'dshBridgeAddressTitle' }, t('bridgeAddress.title')),
        React.createElement('p', { className: 'dshBridgeAddressHelp' }, t('bridgeAddress.help')),
        React.createElement(
          'div',
          { className: 'dshBridgeAddressBody' },
          React.createElement(
            'code',
            {
              className: 'dshBridgeAddressValue',
              'data-kind': 'address',
              title: address || undefined,
            },
            value,
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dshBridgeAddressCopy',
              disabled: status !== 'ready' || address === '',
              onClick: () => { void onCopy() },
            },
            copied ? t('bridgeAddress.copied') : t('bridgeAddress.copy'),
          ),
        ),
      )
    }

    function BridgeTokenRow({ t }) {
      const [token, setToken] = React.useState('')
      const [status, setStatus] = React.useState('loading')
      const [copied, setCopied] = useCopiedFlag()

      React.useEffect(() => {
        let cancelled = false
        void resolveBridgeConfig(window.location).then((config) => {
          if (cancelled) return
          if (typeof config.token === 'string' && config.token !== '') {
            setToken(config.token)
            setStatus('ready')
          } else {
            setStatus('unavailable')
          }
        }).catch(() => {
          if (cancelled) return
          setStatus('unavailable')
        })
        return () => { cancelled = true }
      }, [])

      const onCopy = React.useCallback(async () => {
        if (token === '') return
        const ok = await copyText(token, '.dshBridgeAddressValue[data-kind="token"]')
        if (ok) setCopied(true)
      }, [token, setCopied])

      const value = status === 'loading'
        ? t('bridgeToken.loading')
        : status === 'ready'
          ? token
          : t('bridgeToken.unavailable')

      return React.createElement(
        'div',
        { className: 'dshBridgeAddressRow' },
        React.createElement('div', { className: 'dshBridgeAddressTitle' }, t('bridgeToken.title')),
        React.createElement('p', { className: 'dshBridgeAddressHelp' }, t('bridgeToken.help')),
        React.createElement(
          'div',
          { className: 'dshBridgeAddressBody' },
          React.createElement(
            'code',
            {
              className: 'dshBridgeAddressValue',
              'data-kind': 'token',
              title: status === 'ready' ? token : undefined,
            },
            value,
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dshBridgeAddressCopy',
              disabled: status !== 'ready' || token === '',
              onClick: () => { void onCopy() },
            },
            copied ? t('bridgeToken.copied') : t('bridgeToken.copy'),
          ),
        ),
      )
    }

    function BridgePluginSettings({ t, view }) {
      if (view === 'summary') return t('settings.summary')
      return React.createElement(
        'div',
        { className: 'dshBridgePluginSettings' },
        React.createElement(BridgeAddressRow, { t }),
        React.createElement(BridgeTokenRow, { t }),
      )
    }

    function shortSha(sha) {
      return typeof sha === 'string' && sha.length > 7 ? sha.slice(0, 7) : sha
    }

    function BridgeUpdateCheckSection({ t, subject }) {
      const [phase, setPhase] = React.useState('idle')
      const [result, setResult] = React.useState(null)

      const onCheck = React.useCallback(async () => {
        setPhase('checking')
        setResult(null)
        try {
          const response = await fetch(`${window.location.origin}${BRIDGE_UPDATE_CHECK_PATH}`, {
            signal: AbortSignal.timeout(10_000),
          })
          if (!response.ok) {
            setResult({ status: 'unavailable', reason: 'http' })
            setPhase('done')
            return
          }
          const body = await response.json()
          setResult(body && typeof body === 'object' ? body : { status: 'unavailable' })
          setPhase('done')
        } catch {
          setResult({ status: 'unavailable', reason: 'network' })
          setPhase('done')
        }
      }, [])

      if (subject?.kind !== 'bundle' || subject?.pkg?.name !== PACKAGE_NAME) return null

      let statusKind = 'muted'
      let statusText = ''
      let actionLabel = t('updateCheck.action')
      let compareUrl

      if (phase === 'checking') {
        statusText = t('updateCheck.checking')
        actionLabel = ''
      } else if (phase === 'done' && result) {
        actionLabel = t('updateCheck.retry')
        if (result.status === 'up-to-date') {
          statusKind = 'ok'
          statusText = `${t('updateCheck.upToDate')} (${shortSha(result.localSha)})`
        } else if (result.status === 'update-available') {
          statusKind = 'warn'
          statusText = `${t('updateCheck.available')} (${shortSha(result.remoteSha)})`
          compareUrl = typeof result.compareUrl === 'string' ? result.compareUrl : undefined
        } else {
          statusText = t('updateCheck.unavailable')
        }
      }

      return React.createElement(
        'div',
        { className: 'dshBridgeUpdateCheck', 'data-plugin-update-check': PACKAGE_NAME },
        React.createElement(
          'div',
          { className: 'dshBridgeUpdateCheckRow' },
          React.createElement('div', { className: 'dshBridgeUpdateCheckLabel' }, t('updateCheck.label')),
          React.createElement(
            'div',
            { className: 'dshBridgeUpdateCheckValue' },
            statusText === ''
              ? null
              : React.createElement('span', {
                className: 'dshBridgeUpdateCheckStatus',
                'data-kind': statusKind,
              }, statusText),
            compareUrl === undefined
              ? null
              : React.createElement('a', {
                className: 'dshBridgeUpdateCheckLink',
                href: compareUrl,
                target: '_blank',
                rel: 'noreferrer',
              }, t('updateCheck.openCompare')),
            actionLabel === ''
              ? null
              : React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dshBridgeUpdateCheckAction',
                  disabled: phase === 'checking',
                  onClick: () => { void onCheck() },
                },
                actionLabel,
              ),
          ),
        ),
      )
    }

    function apply(ctx) {
      ctx.effect(() => installStyle(), 'bridge-browser: settings row styles')
      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, dictionaries),
        'bridge-browser: settings dictionaries',
      )
      // Bundle detail page (between description and component rows).
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        locale: LOCALE_NS,
      }, BridgePluginSettings))
      // Row detail / configure control (`cordis.patch.yml` row id).
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: `${PACKAGE_NAME}#${ROW_ID}`,
        locale: LOCALE_NS,
      }, BridgePluginSettings))
      // Below Source info on the bundle detail page.
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
        name: 'plugins.detail.section',
        id: 'bridge-browser-update-check',
        order: 20,
        locale: LOCALE_NS,
      }, BridgeUpdateCheckSection))
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
