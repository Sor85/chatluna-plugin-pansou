import type { PansouLink } from './types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string') throw new Error('PanSou API 响应格式无效')
  return value
}

function array(value: unknown): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('PanSou API 响应格式无效')
  return value
}

export function parsePansouResponse(value: unknown): PansouLink[] {
  if (!isObject(value) || typeof value.code !== 'number') throw new Error('PanSou API 响应格式无效')
  if (value.code !== 0) {
    const detail = typeof value.message === 'string' ? value.message : String(value.code)
    throw new Error(`PanSou API 返回错误：${detail}`)
  }
  const response = value.data
  if (!isObject(response)) throw new Error('PanSou API 响应格式无效')
  const merged = response.merged_by_type
  if (merged !== undefined && !isObject(merged)) throw new Error('PanSou API 响应格式无效')
  const links: PansouLink[] = []
  for (const [type, items] of Object.entries(merged ?? {})) {
    for (const link of array(items)) {
      if (!isObject(link)) throw new Error('PanSou API 响应格式无效')
      if (typeof link.url !== 'string' || !link.url.trim()) continue
      links.push({
        type,
        url: link.url,
        password: optionalText(link.password),
        note: optionalText(link.note),
        source: optionalText(link.source),
      })
    }
  }
  if (links.length) return links

  for (const result of array(response.results)) {
    if (!isObject(result)) throw new Error('PanSou API 响应格式无效')
    for (const link of array(result.links)) {
      if (!isObject(link)) throw new Error('PanSou API 响应格式无效')
      if (typeof link.url !== 'string' || !link.url.trim()) continue
      if (typeof link.type !== 'string') throw new Error('PanSou API 响应格式无效')
      const channel = optionalText(result.channel)
      links.push({
        type: link.type,
        url: link.url,
        password: optionalText(link.password),
        note: optionalText(link.work_title ?? result.title ?? result.content),
        source: channel ? `tg:${channel}` : undefined,
      })
    }
  }
  return links
}

export function formatPansouResults(links: PansouLink[], keyword: string, maxResults: number, limits: Readonly<Partial<Record<string, number>>>): string {
  const counts = new Map<string, number>()
  const limited = links.filter((link) => {
    const limit = limits[link.type]
    if (limit === undefined || limit < 1) return true
    const count = counts.get(link.type) ?? 0
    if (count >= limit) return false
    counts.set(link.type, count + 1)
    return true
  })
  if (!limited.length) return `没有找到“${keyword.trim()}”的网盘资源。`
  const visible = limited.slice(0, Math.max(1, maxResults))
  const suffix = limited.length > visible.length ? `，展示前 ${visible.length} 条` : ''
  const blocks = visible.map((link, index) => {
    const lines = [`${index + 1}. [${link.type}] ${link.note?.trim() || link.url}`, `链接：${link.url}`]
    if (link.password?.trim()) lines.push(`提取码：${link.password.trim()}`)
    if (link.source?.trim()) lines.push(`来源：${link.source.trim()}`)
    return lines.join('\n')
  })
  return [`找到 ${limited.length} 条“${keyword.trim()}”的网盘资源${suffix}：`, ...blocks].join('\n\n')
}

export function safeErrorMessage(error: unknown, token?: string): string {
  const text = error instanceof Error ? error.message : '未知错误'
  const secret = token?.trim()
  return (secret ? text.replaceAll(secret, '[已隐藏]') : text)
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .slice(0, 600)
}
