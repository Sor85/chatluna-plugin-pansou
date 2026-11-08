import type { Context } from 'cordis'
import { Schema } from '@chatluna/schema'
import type { ToolDefinition } from '@chatluna/tool'
import type { Config } from './config'
import { searchPansou } from './client'
import type { SearchInput } from './types'
import { formatPansouResults, safeErrorMessage } from './utils'

// Schemastery 的集合隐式默认值会把“省略”改成空集合，覆盖管理员设置。
function optionalArgument<S, T>(schema: Schema<S, T>) {
  delete schema.meta.default
  return schema.optional()
}

export const searchArgs: Schema<SearchInput> = Schema.object({
  keyword: Schema.string().min(1).required().description('Resource search keywords'),
  channels: optionalArgument(Schema.array(Schema.string().min(1))).description('Telegram channels; omitted uses the PanSou defaults'),
  conc: Schema.number().min(1).step(1).optional().description('Backend search concurrency'),
  res: Schema.enum(['all', 'results', 'merge']).optional().description('Result type; defaults to merge'),
  src: Schema.enum(['all', 'tg', 'plugin']).optional().description('Search sources; omitted uses the PanSou default (all)'),
  plugins: optionalArgument(Schema.array(Schema.string().min(1))).description('Backend plugins; omitted uses the PanSou defaults'),
  cloudTypes: optionalArgument(Schema.array(Schema.string().min(1))).description('Cloud-drive types such as quark, baidu or aliyun; an empty array searches all types'),
  ext: optionalArgument(Schema.dict(Schema.any())).description('Additional parameters passed to PanSou plugins'),
  filter: optionalArgument(Schema.object({
    include: optionalArgument(Schema.array(Schema.string().min(1))).description('Keywords to include'),
    exclude: optionalArgument(Schema.array(Schema.string().min(1))).description('Keywords to exclude'),
  })).description('Backend include/exclude keyword filters'),
  maxResults: Schema.number().min(1).max(20).step(1).optional().description('Maximum displayed results; omitted uses the plugin default'),
  refresh: Schema.boolean().optional().description('Force the PanSou backend to refresh its cache'),
})

export function createPansouTool(ctx: Context, config: Config, lifetime: AbortSignal): ToolDefinition<SearchInput> {
  return {
    name: 'pansou_search',
    description: 'Search cloud-drive resources with PanSou and return concise share links, passwords, cloud types, and sources.',
    locales: {
      zh: {
        description: '通过 PanSou 搜索网盘资源，返回分享链接、提取码、网盘类型与来源',
        args: {
          keyword: '资源搜索关键词',
          channels: 'Telegram 频道列表，省略时使用 PanSou 默认配置',
          conc: '后端并发搜索数量',
          res: '结果类型：all、results、merge，默认为 merge',
          src: '数据来源：all、tg、plugin，省略时由 PanSou 决定，通常为 all',
          plugins: '后端搜索插件列表，省略时使用 PanSou 默认配置',
          cloudTypes: '网盘类型，如 quark、baidu、aliyun；空数组表示全部类型',
          ext: '传递给 PanSou 插件的扩展参数',
          filter: '后端关键词过滤配置',
          'filter.include': '包含关键词',
          'filter.exclude': '排除关键词',
          maxResults: '本次最多展示数量，省略时使用插件默认值',
          refresh: '强制刷新 PanSou 后端缓存',
        },
      },
    },
    args: searchArgs,
    traits: { effect: 'read', parallel: true, timeout: config.timeout + 1000, background: false },
    async run(input, call) {
      const signal = AbortSignal.any([lifetime, call.signal])
      signal.throwIfAborted()
      const keyword = input.keyword.trim()
      if (!keyword) return '搜索关键词不能为空。'
      try {
        const links = await searchPansou(config, input, signal)
        return formatPansouResults(links, keyword, input.maxResults ?? config.maxResults, config.maxResultsByCloudType)
      } catch (error) {
        signal.throwIfAborted()
        ctx.logger.warn('PanSou search failed')
        return `PanSou 搜索失败：${safeErrorMessage(error, config.token)}`
      }
    },
  }
}
