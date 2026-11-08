export interface SearchInput {
  keyword: string
  channels?: string[]
  conc?: number
  res?: 'all' | 'results' | 'merge'
  src?: 'all' | 'tg' | 'plugin'
  plugins?: string[]
  cloudTypes?: string[]
  ext?: Record<string, unknown>
  filter?: { include?: string[]; exclude?: string[] }
  maxResults?: number
  refresh?: boolean
}

export interface PansouLink {
  type: string
  url: string
  password?: string
  note?: string
  source?: string
}

export type CloudType = 'baidu' | 'aliyun' | 'quark' | 'tianyi' | '115' | 'xunlei' | 'uc' | 'mobile' | 'pikpak' | '123' | 'magnet' | 'ed2k'
export type CloudTypeLimitKey = Exclude<CloudType, '115' | '123'> | 'pan115' | 'pan123'
export type CloudTypeLimits = Partial<Record<CloudTypeLimitKey, number>>
