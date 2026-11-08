import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { cloudTypes, Config } from '../src/config'
import { searchArgs } from '../src/tool'

const defaults = Config.parse({})

describe('插件配置与宿主表单', () => {
  it('使用默认值与十二种 PanSou 网盘类型键', () => {
    expect(defaults.baseUrl).toBe('http://127.0.0.1:8888')
    expect(defaults.maxResults).toBe(5)
    expect(defaults.timeout).toBe(30000)
    expect(defaults.defaultCloudTypes).toEqual([])
    expect(defaults.maxResultsByCloudType).toEqual(Object.fromEntries(cloudTypes.map(([key]) => [key, 0])))
    expect(Object.keys(defaults.maxResultsByCloudType)).toContain('115')
    expect(Object.keys(defaults.maxResultsByCloudType)).toContain('123')
    expect(Object.keys(defaults.maxResultsByCloudType)).toHaveLength(12)
  })
  it('分类限量使用网盘类型键，不提供旧别名', () => {
    const config = Config.parse({ maxResultsByCloudType: { '115': 1, '123': 2 } })
    expect(config.maxResultsByCloudType['115']).toBe(1)
    expect(config.maxResultsByCloudType['123']).toBe(2)
    const fields = Object.assign({}, ...(Config.list ?? []).map((part) => part.dict))
    expect(fields.maxResultsByCloudType.dict).not.toHaveProperty('pan115')
    expect(fields.maxResultsByCloudType.dict).not.toHaveProperty('pan123')
  })
  it('不暴露工具元数据配置，令牌使用宿主 secret 控件', () => {
    const fields = Object.assign({}, ...(Config.list ?? []).map((part) => part.dict))
    expect(fields).not.toHaveProperty('toolName')
    expect(fields).not.toHaveProperty('toolDescription')
    expect(fields.token.meta.role).toBe('secret')
    expect(fields.baseUrl.inner.meta).toMatchObject({ label: 'API 根地址', default: defaults.baseUrl })
    expect(fields.baseUrl.inner.meta.description).toBe(fields.baseUrl.meta.description)
    for (const field of Object.values(fields)) {
      expect(field).toHaveProperty('meta.label')
    }
  })
  it.each([
    { maxResults: 0 }, { maxResults: 21 }, { maxResults: 1.5 }, { timeout: 999 },
    { maxResultsByCloudType: { '115': -1 } }, { maxResultsByCloudType: { '123': 21 } },
    { defaultCloudTypes: ['not-a-config-option'] }, { baseUrl: 'file:///etc/passwd' },
    { baseUrl: 'http://user:pass@example.com' }, { baseUrl: 'http://example.com?token=x' },
  ])('拒绝非法配置 %j', (value) => {
    expect(() => Config.parse(value)).toThrow()
  })
  it('支持内网、HTTPS 和反向代理路径', () => {
    expect(Config.parse({ baseUrl: ' http://192.168.5.3:8888/pansou/ ' }).baseUrl).toContain('/pansou/')
    expect(Config.parse({ baseUrl: 'https://example.com' }).baseUrl).toBe('https://example.com')
  })
})

describe('工具参数', () => {
  it('省略字段不覆盖插件默认网盘类型，空数组仍可显式覆盖', () => {
    expect(searchArgs.parse({ keyword: '测试' }).cloudTypes).toBeUndefined()
    expect(searchArgs.parse({ keyword: '测试', cloudTypes: [] }).cloudTypes).toEqual([])
    expect(searchArgs.parse({ keyword: '测试', cloudTypes: ['future-drive'] }).cloudTypes).toEqual(['future-drive'])
  })
  it.each([
    {}, { keyword: '' }, { keyword: 12 }, { keyword: 'x', conc: 0 }, { keyword: 'x', conc: 1.5 },
    { keyword: 'x', res: 'invalid' }, { keyword: 'x', src: 'invalid' },
    { keyword: 'x', maxResults: 21 }, { keyword: 'x', maxResults: 1.5 },
    { keyword: 'x', channels: [''] }, { keyword: 'x', refresh: 'true' },
  ])('拒绝非法参数 %j', (value) => {
    expect(() => searchArgs.parse(value)).toThrow()
  })
  it('保留扩展参数、空白关键词与显式 false', () => {
    const input = { keyword: ' ', ext: { nested: { anything: [1, false, null] } }, refresh: false }
    expect(searchArgs.parse(input)).toMatchObject(input)
  })
})

it('根说明清单与所有子目录 AGENTS 双向一致', () => {
  const root = new URL('../', import.meta.url)
  const found: string[] = []
  function walk(directory: URL, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'lib', 'dist', '.git', '.claude'].includes(entry.name)) continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, directory), `${relative}/`)
      else if (entry.name === 'AGENTS.md' && prefix) found.push(relative)
    }
  }
  walk(root)
  const text = readFileSync(new URL('AGENTS.md', root), 'utf8')
  const listed = [...text.matchAll(/^- `([^`]+\/AGENTS\.md)`/gm)].map((match) => match[1])
  expect(found.sort()).toEqual(listed.sort())
})
