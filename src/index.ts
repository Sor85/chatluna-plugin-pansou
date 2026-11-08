import type { Context } from 'cordis'
import type {} from '@chatluna/tool'
import { Config } from './config'
import { createPansouTool } from './tool'

export const name = 'chatluna-pansou'
export { Config }
export const inject = ['tools']

export function apply(ctx: Context, config: Config) {
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort())
  ctx.tools.define(createPansouTool(ctx, config, lifetime.signal))
}
