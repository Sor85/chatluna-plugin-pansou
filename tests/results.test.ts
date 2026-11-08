import { describe, expect, it } from 'vitest'
import { formatPansouResults, parsePansouResponse, safeErrorMessage } from '../src/utils'

const result = (data: unknown, max = 5, limits = {}) => formatPansouResults(parsePansouResponse({ code: 0, data }), ' 测试 ', max, limits)

describe('搜索结果', () => {
  it('展示链接、提取码与来源，不使用 total 计数', () => {
    expect(result({ total: 999, merged_by_type: { quark: [{ url: 'https://example.com/a', note: '  标题  ', password: ' abcd ', source: ' plugin:test ' }] } }))
      .toBe('找到 1 条“测试”的网盘资源：\n\n1. [quark] 标题\n链接：https://example.com/a\n提取码：abcd\n来源：plugin:test')
  })
  it('解析当前 PanSou 的数字错误码与 data 包装', () => {
    expect(parsePansouResponse({ code: 0, message: 'success', data: { merged_by_type: { baidu: [{ url: 'a' }] } } }))
      .toEqual([{ type: 'baidu', url: 'a' }])
  })
  it('有效合并链接优先，不混入原始结果', () => {
    const output = result({ merged_by_type: { quark: [{ url: 'merged' }] }, results: [{ links: [{ type: 'baidu', url: 'raw' }] }] })
    expect(output).toContain('merged')
    expect(output).not.toContain('raw')
  })
  it('无有效合并链接时回退原始结果，保留标题与来源优先级', () => {
    expect(result({ merged_by_type: { quark: [{ url: ' ' }, {}] }, results: [
      { title: '父标题', content: '正文', channel: '频道', links: [{ type: 'baidu', url: 'raw', work_title: '链接标题', password: '1234' }] },
    ] })).toContain('1. [baidu] 链接标题\n链接：raw\n提取码：1234\n来源：tg:频道')
    expect(result({ results: [{ title: '', content: '正文', links: [{ type: 'baidu', url: 'raw' }] }] })).toContain('[baidu] raw')
    expect(result({ results: [{ content: '正文', links: [{ type: 'baidu', url: 'raw' }] }] })).toContain('[baidu] 正文')
  })
  it('先分类裁剪，再全局裁剪，直接使用网盘类型键', () => {
    const data = { merged_by_type: {
      '115': [{ url: '115-a' }, { url: '115-b' }],
      '123': [{ url: '123-a' }, { url: '123-b' }],
      quark: [{ url: 'q-a' }, { url: 'q-b' }],
    } }
    const output = result(data, 2, { '115': 1, '123': 1, quark: 0 })
    expect(output).toContain('找到 4 条“测试”的网盘资源，展示前 2 条：')
    expect(output).toContain('115-a')
    expect(output).toContain('123-a')
    expect(output).not.toContain('115-b')
    expect(output).not.toContain('q-a')
  })
  it('保留重复项、未知网盘类型与原始 URL，不擅自去重排序', () => {
    const output = result({ merged_by_type: { future: [{ url: '  magnet:x  ' }, { url: '  magnet:x  ' }] } }, 5, { baidu: 1 })
    expect(output).toContain('找到 2 条')
    expect(output).toContain('链接：  magnet:x  ')
  })
  it.each([{}, { total: 0 }, { results: [] }, { merged_by_type: {} }, { merged_by_type: { quark: [{ url: '' }, { url: 123 }] } }])('空结果 %j', (data) => {
    expect(result(data)).toBe('没有找到“测试”的网盘资源。')
  })
})

describe('错误响应边界', () => {
  it.each([{ code: 1, message: '失败' }, { code: 401, data: null }, { code: 1, data: {} }])('错误码不可伪装为空结果 %j', (data) => {
    expect(() => parsePansouResponse(data)).toThrow('PanSou API 返回错误')
  })
  it.each([
    null, [], 'x', {}, { merged_by_type: {} }, { data: {} }, { code: 0 },
    { code: '0', data: {} }, { code: '401', data: {} }, { code: 0, data: null },
  ])('拒绝裸响应、字符串错误码和无效包装 %j', (value) => {
    expect(() => parsePansouResponse(value)).toThrow('PanSou API 响应格式无效')
  })
  it.each([null, [], 'x', { results: {} }, { merged_by_type: [] }, { merged_by_type: { quark: {} } }, { merged_by_type: { quark: [null] } }, { merged_by_type: { quark: [{ url: 'x', note: 123 }] } }, { results: [{ links: [{ url: 'x' }] }] }])('结构异常明确失败 %j', (data) => {
    expect(() => result(data)).toThrow('PanSou API 响应格式无效')
  })
  it('认证令牌脱敏且错误正文限长，不假定抛出的一定是 Error', () => {
    expect(safeErrorMessage(new Error('token=test-secret Bearer other-secret'), 'test-secret')).toBe('token=[已隐藏] Bearer [已隐藏]')
    expect(safeErrorMessage(new Error('x'.repeat(1000))).length).toBe(600)
    expect(safeErrorMessage(null)).toBe('未知错误')
  })
})
