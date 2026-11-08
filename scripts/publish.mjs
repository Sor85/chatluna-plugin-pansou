#!/usr/bin/env node
// @chatluna/* 尚未公开发布，沿用 onebot-sandbox 的本机构建、打包与 npm 发布流程。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = path.resolve(process.env.CHATLUNA_V2_ROOT ?? path.join(source, '../../chatluna-v2-mirror'))
const target = path.join(host, 'external/pansou')
const registry = 'https://registry.npmjs.org/'

function run(command, args, cwd = source, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.error || result.status !== 0) throw new Error(`${command} 执行失败${result.status === null ? '' : `（退出码 ${result.status}）`}`)
  return result.stdout?.trim() ?? ''
}

function read(command, args, cwd = source) {
  return run(command, args, cwd, true)
}

function npmView(spec, field) {
  const result = spawnSync('npm', ['view', spec, field, '--json', '--registry', registry], { cwd: source, encoding: 'utf8' })
  if (!result.error && result.status === 0) return JSON.parse(result.stdout)
  let error
  try { error = JSON.parse(result.stdout)?.error } catch {}
  if (error?.code === 'E404') return undefined
  throw new Error('读取 npm 元数据失败，未继续发布；检查网络或 registry 访问状态')
}

function assertClean(head) {
  if (read('git', ['status', '--porcelain'])) throw new Error('工作区有未提交的改动，先提交并推送')
  if (head && read('git', ['rev-parse', 'HEAD']) !== head) throw new Error('构建期间 HEAD 已变化，停止发布')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(`用法：
  node scripts/publish.mjs              发布 package.json 中的版本
  node scripts/publish.mjs --dry-run    同步、清理、构建、检查、测试、打包并演练；不发布、不打标签
  node scripts/publish.mjs --otp=数字   使用 npm 两步验证的一次性验证码

源码目录不安装依赖，直接使用 node；宿主默认 ../../chatluna-v2-mirror，可用 CHATLUNA_V2_ROOT 指定。
演练允许未提交改动，无需 npm 登录；正式发布要求工作区干净、HEAD 已推送且版本/标签未发布。
发布确认成功后才推送 v<版本> 标签，不自动修改版本、提交或推送分支。`)
    return
  }
  if (args.some((arg) => arg !== '--dry-run' && !/^--otp=\d+$/.test(arg))) throw new Error('不支持的参数，使用 --help 查看用法')
  if (args.filter((arg) => arg.startsWith('--otp=')).length > 1) throw new Error('只能指定一个 --otp 参数')
  const dryRun = args.includes('--dry-run')
  const otp = args.find((arg) => arg.startsWith('--otp='))
  const { name, version } = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
  if (name !== 'chatluna-plugin-pansou' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    throw new Error('插件名称或版本号无效')
  }
  if (!fs.existsSync(path.join(host, 'package.json')) || !fs.existsSync(path.join(host, 'node_modules'))) {
    throw new Error('未找到已安装依赖的 ChatLuna v2 workspace；先在宿主执行 yarn install')
  }
  if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) === fs.realpathSync(source))) {
    throw new Error('构建副本不能是源码目录或符号链接')
  }
  const tag = `v${version}`
  const prerelease = version.split('+')[0].split('-')[1]?.split('.')[0]
  const distTag = prerelease ? (['alpha', 'beta', 'rc', 'next'].includes(prerelease) ? prerelease : 'next') : 'latest'
  let head
  if (!dryRun) {
    assertClean()
    head = read('git', ['rev-parse', 'HEAD'])
    const branch = read('git', ['branch', '--show-current'])
    if (!branch) throw new Error('当前处于 detached HEAD，先切换到发布分支')
    if (read('git', ['tag', '--list', tag])) throw new Error(`本地 ${tag} 已存在，不能重复发布`)
    run('git', ['fetch', 'origin', '--quiet'])
    if (read('git', ['rev-parse', `refs/remotes/origin/${branch}`]) !== head) throw new Error('HEAD 与 origin 同名分支不一致，先同步并推送')
    if (read('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) throw new Error(`远端 ${tag} 已存在，不能重复发布`)
    read('npm', ['whoami', '--registry', registry])
    if (npmView(`${name}@${version}`, 'version') !== undefined) throw new Error(`${name}@${version} 已发布，不能覆盖`)
  }

  console.log(`[publish] ${name}@${version} → ${distTag}${dryRun ? '（仅演练）' : ''}`)
  run(process.execPath, [path.join(source, 'scripts/sync-to-v2.mjs'), '--once'])
  // 同步不会删除旧产物；增量状态与声明目录必须一起清理。
  for (const entry of ['lib', 'dist', 'tsconfig.tsbuildinfo']) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true })
  }
  run('yarn', ['yakumo', 'build', 'pansou'], host)
  run('yarn', ['typecheck'], target)
  run('yarn', ['test'], target)

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pansou-publish-'))
  const tarball = path.join(workdir, 'package.tgz')
  console.log(`[publish] 打包目录：${workdir}`)
  // yarn pack 改写 workspace:*；从解压目录发布才能让 npm 生成 README 元数据。
  run('yarn', ['pack', '--out', tarball], target)
  run('tar', ['-xzf', tarball, '-C', workdir])
  const packageDir = path.join(workdir, 'package')
  const packed = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  if (packed.name !== name || packed.version !== version || JSON.stringify(packed).includes('workspace:')) {
    throw new Error('发布包名称、版本或 workspace 依赖转换不正确')
  }
  for (const entry of ['lib/index.js', 'lib/index.d.ts', 'README.md', 'LICENSE']) {
    if (!fs.existsSync(path.join(packageDir, entry))) throw new Error(`发布包缺少 ${entry}`)
  }
  if (!dryRun) assertClean(head)
  const publishArgs = ['publish', packageDir, '--access', 'public', '--tag', distTag, '--registry', registry]
  if (dryRun) publishArgs.push('--dry-run')
  if (otp) publishArgs.push(otp)
  // 不打印命令参数，防止一次性验证码进入脚本日志。
  run('npm', publishArgs)
  if (dryRun) {
    console.log(`[publish] 演练通过，未发布或推送标签。包文件：${tarball}`)
    return
  }

  let verified = false
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const published = npmView(`${name}@${version}`, 'version')
      const tags = npmView(name, 'dist-tags')
      if (published === version && tags?.[distTag] === version) { verified = true; break }
    } catch {
      // 发布后的索引可能暂时不可读，仅重试查询，绝不重复 publish。
    }
    if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  if (!verified) throw new Error('npm 发布命令已完成，但版本/标签尚未确认；未创建 Git 标签，勿直接重复发布')
  assertClean(head)
  run('git', ['tag', tag, head])
  run('git', ['push', 'origin', tag])
  console.log(`[publish] 已确认 ${name}@${version}（${distTag}），${tag} 已推送`)
}

main().catch((error) => {
  console.error(`[publish] ${error instanceof Error ? error.message : '发布流程失败'}`)
  process.exitCode = 1
})
