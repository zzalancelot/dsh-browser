/**
 * Compare the managed install's recorded git head against the install source
 * on GitHub (repository + ref from install-info.json).
 *
 * @module @yuxianglin/dsh-bridge-browser/src/update-check
 */

import { readFile } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** Default upstream used by scripts/install.sh when install-info omits fields. */
export const DEFAULT_UPDATE_REPOSITORY = 'Lum1104/dsh-browser'

/** Default branch used by scripts/install.sh when install-info omits fields. */
export const DEFAULT_UPDATE_REF = 'main'

/** Written by install-dev.sh / install.sh next to the unpacked Chrome extension. */
export const INSTALL_INFO_FILE = 'browser-extension/install-info.json'

export type InstallInfo = {
  schemaVersion?: number
  mode?: string
  sourceRoot?: string
  gitHead?: string
  repository?: string
  ref?: string
  installedAt?: string
}

export type UpdateCheckResult =
  | {
    status: 'up-to-date'
    localSha: string
    remoteSha: string
    repository: string
    ref: string
  }
  | {
    status: 'update-available'
    localSha: string
    remoteSha: string
    repository: string
    ref: string
    compareUrl: string
  }
  | {
    status: 'unavailable'
    reason: 'no-install-info' | 'no-git-head' | 'network' | 'http' | 'invalid-response'
    message?: string
    repository?: string
    ref?: string
  }

/** Absolute path of install-info.json under the dsh home. */
export function installInfoPath(): string {
  return dshHomePath(INSTALL_INFO_FILE)
}

/**
 * Read and lightly validate install-info.json.
 * @param file - absolute path; defaults to the managed extension install-info.
 */
export async function readInstallInfo(file: string = installInfoPath()): Promise<InstallInfo | undefined> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    return raw as InstallInfo
  } catch {
    return undefined
  }
}

/** True when local and remote refer to the same commit (prefix-tolerant). */
export function sameGitHead(local: string, remote: string): boolean {
  const a = local.trim().toLowerCase()
  const b = remote.trim().toLowerCase()
  if (a === '' || b === '') return false
  return a === b || a.startsWith(b) || b.startsWith(a)
}

/**
 * Resolve repository / ref / local sha from install-info with installer defaults.
 * @param info - parsed install-info, or undefined when missing.
 */
export function resolveUpdateSource(info: InstallInfo | undefined): {
  repository: string
  ref: string
  localSha: string | undefined
} {
  const repository = typeof info?.repository === 'string' && info.repository.includes('/')
    ? info.repository.trim()
    : DEFAULT_UPDATE_REPOSITORY
  const ref = typeof info?.ref === 'string' && info.ref.trim() !== ''
    ? info.ref.trim()
    : DEFAULT_UPDATE_REF
  const localSha = typeof info?.gitHead === 'string' && info.gitHead.trim() !== ''
    ? info.gitHead.trim()
    : undefined
  return { repository, ref, localSha }
}

type FetchLike = typeof fetch

/**
 * Ask GitHub for the tip commit of `repository` at `ref`.
 * @param repository - `owner/name`.
 * @param ref - branch, tag, or commit-ish.
 * @param fetchImpl - injectable fetch for tests.
 */
export async function fetchRemoteGitHead(
  repository: string,
  ref: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; sha: string } | { ok: false; reason: 'network' | 'http' | 'invalid-response'; message: string }> {
  const url = `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'dsh-bridge-browser-update-check',
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'http',
      message: `GitHub HTTP ${String(response.status)}`,
    }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-response',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const sha = body !== null
    && typeof body === 'object'
    && 'sha' in body
    && typeof (body as { sha: unknown }).sha === 'string'
    ? (body as { sha: string }).sha
    : undefined
  if (sha === undefined || sha === '') {
    return { ok: false, reason: 'invalid-response', message: 'missing commit sha' }
  }
  return { ok: true, sha }
}

/**
 * Compare the local install-info git head against the install source tip.
 * @param options - optional path / fetch overrides for tests.
 */
export async function checkForUpdate(options: {
  installInfoFile?: string
  fetchImpl?: FetchLike
} = {}): Promise<UpdateCheckResult> {
  const info = await readInstallInfo(options.installInfoFile)
  if (info === undefined) {
    return { status: 'unavailable', reason: 'no-install-info' }
  }
  const { repository, ref, localSha } = resolveUpdateSource(info)
  if (localSha === undefined) {
    return { status: 'unavailable', reason: 'no-git-head', repository, ref }
  }
  const remote = await fetchRemoteGitHead(repository, ref, options.fetchImpl)
  if (!remote.ok) {
    return {
      status: 'unavailable',
      reason: remote.reason,
      message: remote.message,
      repository,
      ref,
    }
  }
  if (sameGitHead(localSha, remote.sha)) {
    return {
      status: 'up-to-date',
      localSha,
      remoteSha: remote.sha,
      repository,
      ref,
    }
  }
  return {
    status: 'update-available',
    localSha,
    remoteSha: remote.sha,
    repository,
    ref,
    compareUrl: `https://github.com/${repository}/compare/${encodeURIComponent(localSha)}...${encodeURIComponent(ref)}`,
  }
}
