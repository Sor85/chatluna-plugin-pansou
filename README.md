# ChatLuna PanSou

为 ChatLuna v2 提供网盘资源搜索工具，返回分享链接、提取码、网盘类型和来源。需要独立部署 [PanSou 后端](https://github.com/fish2018/pansou)。

## 配置

在 ChatLuna 的插件管理中配置 `chatluna-plugin-pansou`。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:8888` | PanSou API 根地址，不包含 `/api/search`；不在同一台机器时使用后端的网络地址 |
| `token` | 空 | PanSou 启用认证时使用的 JWT Token |
| `timeout` | `30000` | 请求超时，单位毫秒，最小 1000 |
| `maxResults` | `5` | 默认展示数量，范围 1–20，单次调用可覆盖 |
| `defaultCloudTypes` | `[]` | 默认搜索类型，空数组表示全部，单次调用可覆盖 |
| `maxResultsByCloudType` | 各类型均为 `0` | 分类展示数量，范围 0–20；0 表示不单独限制 |

支持百度、阿里、夸克、天翼、115、迅雷、UC、移动、PikPak、123、磁力与电驴。分类限量与请求参数使用相同的网盘类型键，115 和 123 分别为 `115`、`123`。

工具固定注册为 `pansou_search`。启用范围、权限、审批和描述覆盖使用 ChatLuna 的工具管理；插件不提供 `toolName`、`toolDescription` 配置。

## 使用

模型可根据对话调用工具，例如搜索“Linux”，返回前两条夸克网盘资源。也可在 ChatLuna 的工具调试页面调用：

```json
{
  "keyword": "Linux",
  "cloudTypes": ["quark"],
  "maxResults": 2
}
```

| 参数 | 说明 |
| --- | --- |
| `keyword` | 必填，资源关键词 |
| `channels` | Telegram 频道列表 |
| `conc` | 后端并发搜索数量，正整数 |
| `res` | `all`、`results` 或 `merge`，默认为 `merge` |
| `src` | `all`、`tg` 或 `plugin`，省略时由后端决定 |
| `plugins` | 后端搜索插件列表 |
| `cloudTypes` | 网盘类型列表；省略使用插件默认值，显式空数组搜索全部 |
| `ext` | 传给后端插件的扩展参数对象 |
| `filter` | 后端关键词过滤，例如 `{"include":["教程"],"exclude":["广告"]}` |
| `maxResults` | 本次展示数量，1–20 |
| `refresh` | 强制刷新后端缓存 |

## 结果与限制

- 先应用分类展示数量，再应用总展示数量；输出中的“找到 N 条”是分类裁剪后数量，不是后端总数。
- 按当前 PanSou 协议读取 `{ "code": 0, "data": ... }` 包装响应，不支持裸响应或字符串错误码。
- 优先使用 `merged_by_type`，没有有效合并链接时从 `results[].links` 提取。无论 `res` 取何值，工具都返回链接文本。
- 保留后端顺序与重复结果；不另做排序、去重、本地缓存或自动重试。筛选和缓存刷新由 PanSou 执行。
- 工具只查询，不自行发送平台消息；最终回复由模型与 ChatLuna 完成。
- 不检查分享链接是否有效。登录、后端部署和认证令牌更新由后端管理员管理。
- 支持 HTTP(S) 和反向代理路径；根地址不含内嵌凭据、查询参数或片段。服务端重定向会明确失败，避免认证令牌被转发。
- HTTP、后端错误码和异常响应会返回错误说明；工具取消与插件卸载会中止请求。

## 协议

[MIT](LICENSE)
