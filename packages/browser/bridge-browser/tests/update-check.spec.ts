import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  checkForUpdate,
  fetchRemoteGitHead,
  resolveUpdateSource,
  sameGitHead,
} from '../src/update-check.ts'

describe('sameGitHead', () => {
  it('matches full and prefix SHAs', () => {
    expect(sameGitHead('abc1234', 'abc1234')).toBe(true)
    expect(sameGitHead('abc1234def', 'abc1234')).toBe(true)
    expect(sameGitHead('abc1234', 'abc1234def')).toBe(true)
    expect(sameGitHead('abc1234', 'zzz9999')).toBe(false)
  })
})

describe('resolveUpdateSource', () => {
  it('falls back to installer defaults', () => {
    expect(resolveUpdateSource(undefined)).toEqual({
      repository: 'Lum1104/dsh-browser',
      ref: 'main',
      localSha: undefined,
    })
  })

  it('keeps recorded repository, ref, and git head', () => {
    expect(resolveUpdateSource({
      repository: 'zzalancelot/dsh-browser',
      ref: 'maintain',
      gitHead: '752375ae',
    })).toEqual({
      repository: 'zzalancelot/dsh-browser',
      ref: 'maintain',
      localSha: '752375ae',
    })
  })
})

describe('fetchRemoteGitHead', () => {
  it('returns the commit sha from GitHub', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: 'deadbeef'.repeat(5) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    await expect(fetchRemoteGitHead('Lum1104/dsh-browser', 'main', fetchImpl as unknown as typeof fetch))
      .resolves.toEqual({ ok: true, sha: 'deadbeef'.repeat(5) })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/repos/Lum1104/dsh-browser/commits/main')
  })

  it('maps HTTP failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(fetchRemoteGitHead('Lum1104/dsh-browser', 'main', fetchImpl as unknown as typeof fetch))
      .resolves.toMatchObject({ ok: false, reason: 'http' })
  })
})

describe('checkForUpdate', () => {
  it('reports up-to-date when local matches remote', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-update-check-'))
    const file = join(dir, 'install-info.json')
    await writeFile(file, JSON.stringify({
      schemaVersion: 1,
      gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      repository: 'Lum1104/dsh-browser',
      ref: 'main',
    }))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }), { status: 200 }))
    await expect(checkForUpdate({ installInfoFile: file, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .resolves.toMatchObject({ status: 'up-to-date' })
  })

  it('reports update-available when remote tip differs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-update-check-'))
    const file = join(dir, 'install-info.json')
    await writeFile(file, JSON.stringify({
      schemaVersion: 1,
      gitHead: '1111111111111111111111111111111111111111',
      repository: 'Lum1104/dsh-browser',
      ref: 'maintain',
    }))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sha: '2222222222222222222222222222222222222222',
    }), { status: 200 }))
    const result = await checkForUpdate({
      installInfoFile: file,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toMatchObject({
      status: 'update-available',
      localSha: '1111111111111111111111111111111111111111',
      remoteSha: '2222222222222222222222222222222222222222',
      ref: 'maintain',
    })
    if (result.status === 'update-available') {
      expect(result.compareUrl).toContain('github.com/Lum1104/dsh-browser/compare/')
    }
  })

  it('reports unavailable when install-info is missing', async () => {
    await expect(checkForUpdate({
      installInfoFile: join(tmpdir(), 'missing-install-info.json'),
    })).resolves.toEqual({ status: 'unavailable', reason: 'no-install-info' })
  })
})
