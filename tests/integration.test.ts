import { afterEach, describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import Permissions from '@chatluna/permission'
import Tools, { toolSpec } from '@chatluna/tool'
import { Config } from '../src/config'
import { searchPansou } from '../src/client'
import * as plugin from '../src/index'
import { startBackend } from './backend'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

async function backend(handler: Parameters<typeof startBackend>[0] = (_req, response) => {
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({
    code: 0, message: 'success',
    data: { merged_by_type: { quark: [{ url: 'https://example.com/a', note: '测试结果' }, { url: 'https://example.com/b' }] } },
  }))
}) {
  const server = await startBackend(handler)
  cleanups.push(server.close)
  return server
}

async function runtime(overrides: Partial<Config> = {}, serverHandler?: Parameters<typeof startBackend>[0]) {
  const server = await backend(serverHandler)
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(Permissions, {})
  await ctx.plugin(Tools, {})
  const config = { ...Config.parse({ baseUrl: server.url }), ...overrides }
  const fiber = await ctx.plugin(plugin, config)
  const execute = (args: Parameters<Tools['execute']>[0]['args'], signal?: AbortSignal) => ctx.tools.execute({ name: 'pansou_search', args, signal })
  return { ctx, server, fiber, execute }
}

describe('真实 HTTP 协议', () => {
  it('请求路径、认证、所有可选参数和 false 正确透传', async () => {
    const server = await backend()
    await searchPansou(Config.parse({ baseUrl: `${server.url}/proxy/// `, token: ' fixture-token ' }), {
      keyword: ' 测试 ', channels: [' channel ', ' ', 'channel'], conc: 3, res: 'all', src: 'plugin',
      plugins: [' a ', ''], cloudTypes: [' quark ', ' '], ext: { x: [1, true] },
      filter: { include: [' 原样 '], exclude: [] }, refresh: false, maxResults: 1,
    }, new AbortController().signal)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      path: '/proxy/api/search', headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' },
      body: { kw: '测试', res: 'all', channels: ['channel', 'channel'], conc: 3, src: 'plugin', plugins: ['a'], cloud_types: ['quark'], ext: { x: [1, true] }, filter: { include: [' 原样 '], exclude: [] }, refresh: false },
    })
    expect(server.requests[0].body).not.toHaveProperty('maxResults')
  })
  it('空对象、空白列表与未配置认证不发送', async () => {
    const server = await backend()
    await searchPansou(Config.parse({ baseUrl: server.url, token: ' ' }), { keyword: 'x', channels: [' '], plugins: [], cloudTypes: [], ext: {}, filter: {} }, new AbortController().signal)
    expect(server.requests[0].body).toEqual({ kw: 'x', res: 'merge' })
    expect(server.requests[0].headers).not.toHaveProperty('authorization')
  })
  it('默认类型继承，显式空数组解除默认限制，不缓存或去重请求', async () => {
    const server = await backend()
    const config = Config.parse({ baseUrl: server.url, defaultCloudTypes: ['baidu'] })
    for (const input of [{ keyword: 'x' }, { keyword: 'x', cloudTypes: [] }, { keyword: 'x' }]) {
      await searchPansou(config, input, new AbortController().signal)
    }
    expect(server.requests).toHaveLength(3)
    expect(server.requests[0].body.cloud_types).toEqual(['baidu'])
    expect(server.requests[1].body).not.toHaveProperty('cloud_types')
  })
  it('HTTP 错误不会重试', async () => {
    const server = await backend((_req, res) => { res.writeHead(503); res.end('temporarily unavailable') })
    await expect(searchPansou(Config.parse({ baseUrl: server.url }), { keyword: 'x' }, new AbortController().signal)).rejects.toThrow('HTTP 503 temporarily unavailable')
    expect(server.requests).toHaveLength(1)
  })
  it('请求超时关闭连接', async () => {
    const server = await backend(() => {})
    await expect(searchPansou({ ...Config.parse({ baseUrl: server.url }), timeout: 40 }, { keyword: 'x' }, new AbortController().signal)).rejects.toThrow('超时')
  })
  it('超时覆盖读取响应体，调用方取消仍生效', async () => {
    const server = await backend((_req, res) => { res.writeHead(200); res.write('{') })
    await expect(searchPansou({ ...Config.parse({ baseUrl: server.url }), timeout: 40 }, { keyword: 'x' }, new AbortController().signal)).rejects.toThrow()
    const controller = new AbortController()
    const pending = searchPansou(Config.parse({ baseUrl: server.url }), { keyword: 'x' }, controller.signal)
    controller.abort(new Error('测试取消'))
    await expect(pending).rejects.toThrow('测试取消')
  })
  it('禁止携令牌跟随重定向', async () => {
    const server = await backend((_req, res) => { res.writeHead(307, { location: '/redirected' }); res.end() })
    await expect(searchPansou(Config.parse({ baseUrl: server.url, token: 'fixture-token' }), { keyword: 'x' }, new AbortController().signal)).rejects.toThrow()
    expect(server.requests).toHaveLength(1)
  })
})

describe('Cordis + 原生 Tools 集成', () => {
  it('注册只读工具、生成模型 JSON Schema、通过真实工具管线搜索', async () => {
    const { ctx, execute } = await runtime()
    const definition = ctx.tools.list().find((tool) => tool.name === 'pansou_search')
    expect(definition?.traits).toMatchObject({ effect: 'read', parallel: true, background: false })
    if (!definition) throw new Error('工具未注册')
    expect(toolSpec(definition)).toBeDefined()
    const result = await execute({ keyword: '测试' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value).toContain('找到 2 条')
    expect(result.ends).toBeUndefined()
  })
  it('原生参数解析保留配置默认类型与调用结果上限', async () => {
    const { server, execute } = await runtime({ defaultCloudTypes: ['baidu'], maxResults: 1 })
    const first = await execute({ keyword: '测试' })
    expect(server.requests[0].body.cloud_types).toEqual(['baidu'])
    if (!first.ok) throw new Error(first.error.message)
    expect(first.value).toContain('展示前 1 条')
    const second = await execute({ keyword: '测试', maxResults: 2, cloudTypes: [] })
    expect(server.requests[1].body).not.toHaveProperty('cloud_types')
    if (!second.ok) throw new Error(second.error.message)
    expect(second.value).not.toContain('展示前')
  })
  it('工具使用 PanSou 类型键执行分类限量', async () => {
    const { execute } = await runtime({ maxResultsByCloudType: { '115': 1, '123': 1 } }, (_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ code: 0, data: { merged_by_type: {
        '115': [{ url: '115-a' }, { url: '115-b' }],
        '123': [{ url: '123-a' }, { url: '123-b' }],
      } } }))
    })
    const result = await execute({ keyword: '测试' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value).toContain('找到 2 条')
    expect(result.value).toContain('115-a')
    expect(result.value).toContain('123-a')
    expect(result.value).not.toContain('115-b')
    expect(result.value).not.toContain('123-b')
  })
  it('无包装响应不再兼容或伪装为空结果', async () => {
    const { execute } = await runtime({}, (_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ total: 0, merged_by_type: {} }))
    })
    const result = await execute({ keyword: '测试' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('PanSou 搜索失败：PanSou API 响应格式无效')
  })
  it('空白关键词不请求，非法参数由原生管线拒绝', async () => {
    const { server, execute } = await runtime()
    const blank = await execute({ keyword: '   ' })
    expect(blank.ok).toBe(true)
    if (blank.ok) expect(blank.value).toBe('搜索关键词不能为空。')
    expect((await execute({ keyword: '' })).ok).toBe(false)
    expect((await execute({ keyword: 'x', maxResults: 99 })).ok).toBe(false)
    expect(server.requests).toHaveLength(0)
  })
  it('宿主描述覆盖和禁用生效，无插件级绕过', async () => {
    const { ctx, execute, server } = await runtime()
    const offDescription = ctx.tools.override('pansou_search', 'Host managed description')
    expect(ctx.tools.list()[0].description).toBe('Host managed description')
    offDescription()
    const off = ctx.tools.filter({ exclude: ['pansou_search'] })
    expect((await execute({ keyword: 'x' })).ok).toBe(false)
    expect(server.requests).toHaveLength(0)
    off()
  })
  it('错误文本脱敏并使用中文前缀，日志不含正文', async () => {
    const { ctx, execute } = await runtime({ token: 'fixture-token' }, (_req, res) => { res.writeHead(401); res.end('echo fixture-token') })
    const logs: unknown[] = []
    ctx.logger.exporter({ colors: 0, export: (message) => logs.push(message) })
    const result = await execute({ keyword: 'x' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toContain('PanSou 搜索失败：PanSou API 请求失败：HTTP 401')
      expect(result.value).not.toContain('fixture-token')
    }
    expect(JSON.stringify(logs)).not.toContain('fixture-token')
  })
  it('卸载取消在途请求并注销工具，再加载只有一个定义', async () => {
    let requested = () => {}
    const received = new Promise<void>((resolve) => { requested = resolve })
    const { ctx, execute, fiber, server } = await runtime({}, () => requested())
    const pending = execute({ keyword: 'x' })
    await received
    await fiber.dispose()
    expect((await pending).ok).toBe(false)
    expect(ctx.tools.list()).toHaveLength(0)
    await ctx.plugin(plugin, Config.parse({ baseUrl: server.url }))
    expect(ctx.tools.list()).toHaveLength(1)
  })
})
