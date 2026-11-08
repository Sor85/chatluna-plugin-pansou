import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

interface Command { command: string; args: string[]; cwd: string }
const roots: string[] = []
const archives: string[] = []
afterEach(() => {
  for (const root of [...roots, ...archives]) rmSync(root, { recursive: true, force: true })
  roots.length = 0
  archives.length = 0
})

const fakeCli = `#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
const command = path.basename(process.argv[1])
const args = process.argv.slice(2)
const root = process.env.PUBLISH_FIXTURE
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'))
const target = path.join(root, 'host/external/pansou')
const built = path.join(root, 'built')
const published = path.join(root, 'published.json')
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify({ command, args, cwd: process.cwd() }) + '\\n')
const output = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value))
if (command === 'git') {
  if (args[0] === 'status') output(config.dirty || (config.changeDuringBuild && fs.existsSync(built)) ? ' M src/index.ts' : '')
  else if (args[0] === 'branch') output(config.detached ? '' : 'main')
  else if (args[0] === 'rev-parse') output(args[1] === 'HEAD' ? (config.headDuringBuild && fs.existsSync(built) ? 'changed' : 'head') : (config.behind ? 'remote-head' : 'head'))
  else if (args[0] === 'tag' && args[1] === '--list') output(config.localTag ? 'v' + config.version : '')
  else if (args[0] === 'ls-remote') output(config.remoteTag ? 'head refs/tags/v' + config.version : '')
} else if (command === 'yarn') {
  if (args[0] === 'yakumo') {
    if (['lib', 'dist', 'tsconfig.tsbuildinfo'].some(name => fs.existsSync(path.join(target, name)))) process.exit(9)
    if (config.failBuild) process.exit(1)
    fs.mkdirSync(path.join(target, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(target, 'lib/index.js'), 'export {}')
    fs.writeFileSync(path.join(target, 'lib/index.d.ts'), 'export {}')
    fs.writeFileSync(built, 'yes')
  } else if (args[0] === 'typecheck' && config.failTypecheck) process.exit(1)
  else if (args[0] === 'test' && config.failTests) process.exit(1)
  else if (args[0] === 'pack') fs.writeFileSync(args[args.indexOf('--out') + 1], 'fixture archive')
} else if (command === 'tar') {
  const packed = path.join(args[args.indexOf('-C') + 1], 'package')
  fs.mkdirSync(path.join(packed, 'lib'), { recursive: true })
  const pkg = { name: 'chatluna-plugin-pansou', version: config.version, devDependencies: { '@chatluna/schema': config.badWorkspace ? 'workspace:*' : '=2.0.0-alpha.0' } }
  fs.writeFileSync(path.join(packed, 'package.json'), JSON.stringify(pkg))
  for (const file of ['lib/index.js', 'lib/index.d.ts', 'README.md', 'LICENSE']) {
    if (config.missingFile !== file) fs.writeFileSync(path.join(packed, file), 'fixture')
  }
} else if (command === 'npm') {
  if (args[0] === 'whoami') { if (config.noAuth) process.exit(1); output('fixture-user') }
  else if (args[0] === 'view') {
    if (!config.alreadyPublished && !fs.existsSync(published)) { output({ error: { code: config.registryError ? 'EAI_AGAIN' : 'E404' } }); process.exit(1) }
    if (args[2] === 'version') output(JSON.stringify(config.version))
    else output(JSON.parse(fs.readFileSync(published, 'utf8')))
  } else if (args[0] === 'publish') {
    if (config.failPublish) process.exit(1)
    if (!args.includes('--dry-run')) fs.writeFileSync(published, JSON.stringify({ [args[args.indexOf('--tag') + 1]]: config.version }))
  }
}
`

function fixture(options: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pansou-publish-test-'))
  roots.push(root)
  const source = path.join(root, 'source')
  const host = path.join(root, 'host')
  const target = path.join(host, 'external/pansou')
  const bin = path.join(root, 'bin')
  for (const directory of [path.join(source, 'scripts'), path.join(host, 'node_modules'), path.join(target, 'lib'), path.join(target, 'dist'), bin]) mkdirSync(directory, { recursive: true })
  const config = { version: '0.0.1', ...options }
  writeFileSync(path.join(root, 'config.json'), JSON.stringify(config))
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'chatluna-plugin-pansou', version: config.version }))
  writeFileSync(path.join(host, 'package.json'), '{}')
  writeFileSync(path.join(target, 'lib/stale.d.ts'), 'stale')
  writeFileSync(path.join(target, 'dist/stale.js'), 'stale')
  writeFileSync(path.join(target, 'tsconfig.tsbuildinfo'), 'stale')
  copyFileSync(new URL('../scripts/publish.mjs', import.meta.url), path.join(source, 'scripts/publish.mjs'))
  writeFileSync(path.join(source, 'scripts/sync-to-v2.mjs'), "import fs from 'node:fs'; fs.writeFileSync(process.env.PUBLISH_FIXTURE + '/synced', 'yes')")
  for (const command of ['yarn', 'git', 'npm', 'tar']) writeFileSync(path.join(bin, command), fakeCli, { mode: 0o755 })
  return {
    root,
    target,
    run(args: string[] = []) {
      const result = spawnSync(process.execPath, [path.join(source, 'scripts/publish.mjs'), ...args], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PUBLISH_FIXTURE: root, CHATLUNA_V2_ROOT: host },
      })
      const logfile = path.join(root, 'commands.jsonl')
      const calls: Command[] = existsSync(logfile) ? readFileSync(logfile, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
      archives.push(...calls.filter(call => call.command === 'tar').map(call => call.args[call.args.indexOf('-C') + 1]))
      return { result, calls, output: result.stdout + result.stderr }
    },
  }
}

describe('npm 发布脚本', () => {
  it('帮助不启动构建或调用外部命令', () => {
    const { result, calls, output } = fixture().run(['--help'])
    expect(result.status).toBe(0)
    expect(calls).toEqual([])
    expect(output).toContain('--dry-run')
  })
  it('未知参数不会意外变成正式发布', () => {
    const { result, calls } = fixture().run(['--dryrun'])
    expect(result.status).toBe(1)
    expect(calls).toEqual([])
  })
  it('演练允许脏工作区，清理旧产物并验证，不发布或推送', () => {
    const f = fixture({ dirty: true })
    const { result, calls, output } = f.run(['--dry-run', '--otp=123456'])
    expect(result.status, output).toBe(0)
    expect(calls.some(call => call.command === 'git')).toBe(false)
    expect(calls.some(call => call.command === 'npm' && call.args[0] === 'whoami')).toBe(false)
    expect(calls.filter(call => call.command === 'yarn').map(call => call.args[0])).toEqual(['yakumo', 'typecheck', 'test', 'pack'])
    const publish = calls.find(call => call.command === 'npm' && call.args[0] === 'publish')
    expect(publish?.args).toContain('--dry-run')
    expect(publish?.args[1]).toMatch(/[/\\]package$/)
    expect(output).not.toContain('123456')
    expect(existsSync(path.join(f.root, 'published.json'))).toBe(false)
    expect(existsSync(path.join(f.target, 'lib/stale.d.ts'))).toBe(false)
  })
  it.each([
    { dirty: true }, { detached: true }, { localTag: true }, { remoteTag: true },
    { behind: true }, { noAuth: true }, { alreadyPublished: true }, { registryError: true },
  ])('正式发布前置检查失败即中止 %j', options => {
    const f = fixture(options)
    const { result, calls } = f.run()
    expect(result.status).toBe(1)
    expect(existsSync(path.join(f.root, 'synced'))).toBe(false)
    expect(calls.some(call => call.command === 'npm' && call.args[0] === 'publish')).toBe(false)
  })
  it.each([
    { failBuild: true }, { failTypecheck: true }, { failTests: true },
    { changeDuringBuild: true }, { headDuringBuild: true }, { badWorkspace: true }, { missingFile: 'README.md' },
  ])('构建或包检查失败时不发布、不创建标签 %j', options => {
    const { result, calls } = fixture(options).run()
    expect(result.status).toBe(1)
    expect(calls.some(call => call.command === 'npm' && call.args[0] === 'publish')).toBe(false)
    expect(calls.some(call => call.command === 'git' && call.args[0] === 'push')).toBe(false)
  })
  it('npm 发布失败不打标签', () => {
    const { result, calls } = fixture({ failPublish: true }).run()
    expect(result.status).toBe(1)
    expect(calls.some(call => call.command === 'git' && call.args[0] === 'push')).toBe(false)
  })
  it.each([['0.0.1', 'latest'], ['0.0.1-beta.1', 'beta'], ['0.0.1-preview.1', 'next'], ['0.0.1+build-test', 'latest']])('发布 %s 确认 npm %s 后才推送原 HEAD 标签', (version, distTag) => {
    const { result, calls, output } = fixture({ version }).run()
    expect(result.status, output).toBe(0)
    const publishIndex = calls.findIndex(call => call.command === 'npm' && call.args[0] === 'publish')
    expect(calls[publishIndex].args).toContain(distTag)
    expect(calls[publishIndex].args).not.toContain('--dry-run')
    const confirmIndex = calls.findIndex((call, index) => index > publishIndex && call.command === 'npm' && call.args[2] === 'dist-tags')
    const tagIndex = calls.findIndex(call => call.command === 'git' && call.args[0] === 'tag' && call.args[1] !== '--list')
    expect(confirmIndex).toBeGreaterThan(publishIndex)
    expect(tagIndex).toBeGreaterThan(confirmIndex)
    expect(calls[tagIndex].args).toEqual(['tag', `v${version}`, 'head'])
    expect(calls.at(-1)?.args).toEqual(['push', 'origin', `v${version}`])
  })
})
