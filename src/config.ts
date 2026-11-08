import { Schema } from '@chatluna/schema'
import type { CloudType, CloudTypeLimits } from './types'

export const cloudTypes: [CloudType, string][] = [
  ['baidu', '百度网盘'],
  ['aliyun', '阿里云盘'],
  ['quark', '夸克网盘'],
  ['tianyi', '天翼云盘'],
  ['115', '115网盘'],
  ['xunlei', '迅雷网盘'],
  ['uc', 'UC网盘'],
  ['mobile', '移动云盘'],
  ['pikpak', 'PikPak'],
  ['123', '123网盘'],
  ['magnet', '磁力链接'],
  ['ed2k', '电驴链接'],
]

export interface Config {
  baseUrl: string
  token?: string
  maxResults: number
  defaultCloudTypes: CloudType[]
  maxResultsByCloudType: CloudTypeLimits
  timeout: number
}

const baseUrlSchema = Schema.string().default('http://127.0.0.1:8888').label('API 根地址')
  .description('PanSou 后端根地址，例如 http://127.0.0.1:8888；后端与 ChatLuna 不在同一台机器时使用后端的网络地址')
const checkedBaseUrl = baseUrlSchema.checked((value) => {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('PanSou API 根地址必须为不含凭据、查询参数或片段的 HTTP(S) 地址')
  }
})
// checked 包装用于服务端校验，SchemaForm 渲染 inner；两层都保留同一份字段元数据。
Object.assign(checkedBaseUrl.meta, baseUrlSchema.meta)

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: checkedBaseUrl,
    token: Schema.string().role('secret').label('认证令牌').description('PanSou 启用认证时使用的 JWT Token，未启用认证时留空'),
    timeout: Schema.number().min(1000).step(1000).default(30000).label('请求超时').description('请求 PanSou API 的超时时间，单位毫秒'),
  }).description('PanSou 后端'),
  Schema.object({
    maxResults: Schema.number().min(1).max(20).step(1).default(5).label('默认结果数量').description('默认返回给模型的最大结果数量，单次工具调用可在 1–20 之间覆盖'),
    defaultCloudTypes: Schema.array(Schema.union(cloudTypes.map(([value, label]) => Schema.const(value).description(label))))
      .role('checkbox').default([]).label('默认网盘类型').description('所选类型作为默认搜索范围；空选项表示全部类型，单次工具调用可覆盖'),
    maxResultsByCloudType: Schema.object(Object.fromEntries(cloudTypes.map(([key, label]) => [
      key,
      Schema.number().min(0).max(20).step(1).default(0).label(label).description(`${label}最多返回数量，0 表示不单独限制`),
    ]))).default(Object.fromEntries(cloudTypes.map(([key]) => [key, 0])))
      .label('分类结果数量').description('单个网盘类型最多返回数量，先按分类裁剪，再应用总结果数量').collapse(),
  }).description('搜索结果'),
])
