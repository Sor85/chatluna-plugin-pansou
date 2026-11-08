import type { Config } from './config'
import type { PansouLink, SearchInput } from './types'
import { parsePansouResponse } from './utils'

function compact(values?: string[]): string[] | undefined {
  const result = values?.map((value) => value.trim()).filter(Boolean)
  return result?.length ? result : undefined
}

export async function searchPansou(config: Config, input: SearchInput, signal: AbortSignal): Promise<PansouLink[]> {
  const keyword = input.keyword.trim()
  if (!keyword) throw new Error('搜索关键词不能为空。')
  signal.throwIfAborted()
  const body: Record<string, unknown> = { kw: keyword, res: input.res ?? 'merge' }
  const channels = compact(input.channels)
  const plugins = compact(input.plugins)
  const cloudTypes = compact(input.cloudTypes ?? config.defaultCloudTypes)
  if (channels) body.channels = channels
  if (plugins) body.plugins = plugins
  if (cloudTypes) body.cloud_types = cloudTypes
  if (input.conc !== undefined) body.conc = input.conc
  if (input.refresh !== undefined) body.refresh = input.refresh
  if (input.src) body.src = input.src
  if (input.ext && Object.keys(input.ext).length) body.ext = input.ext
  if (input.filter && Object.keys(input.filter).length) body.filter = input.filter

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = config.token?.trim()
  if (token) headers.Authorization = `Bearer ${token}`
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('PanSou API 请求超时')), config.timeout)
  const combined = AbortSignal.any([signal, timeout.signal])
  try {
    const response = await fetch(`${config.baseUrl.trim().replace(/\/+$/, '')}/api/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: combined,
      redirect: 'error',
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`PanSou API 请求失败：HTTP ${response.status}${text.trim() ? ` ${text.trim()}` : ''}`)
    }
    const data: unknown = await response.json()
    combined.throwIfAborted()
    return parsePansouResponse(data)
  } finally {
    clearTimeout(timer)
  }
}
