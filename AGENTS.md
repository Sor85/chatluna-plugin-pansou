# AGENTS.md — chatluna-plugin-pansou

ChatLuna v2 网盘资源搜索插件。独立源码目录是唯一编辑入口，宿主 `external/pansou` 仅为单向同步的构建与运行副本。

## 开发与验证

- `@chatluna/*` 来自 v2 workspace；源码目录不安装依赖、不生成锁文件。执行 `node scripts/sync-to-v2.mjs --once` 同步，不带 `--once` 持续监听；默认宿主 `../../chatluna-v2-mirror`，可用 `CHATLUNA_V2_ROOT` 覆盖。
- 首次同步或依赖变化后在宿主运行 `yarn install`；构建运行 `yarn yakumo build pansou`。在宿主 `external/pansou` 运行 `yarn typecheck` 和 `yarn test`。
- 不覆盖用户配置、数据、其他工作区变更或其他插件源码。集成测试使用 OneBot 沙盒独立测试空间，测试凭据仅从环境变量读取，不写入源码、报告或日志。
- 完整重启宿主需停止 launcher 与 worker，确认端口释放；共享实例重启前协调其他正在运行的测试。
- 不自行创建分支、提交或发布。协议 MIT。

## 通用约定

- 使用 Cordis 4 生命周期、`@chatluna/schema` 与 v2 原生工具，不引入旧 ChatLuna、Koishi、LangChain 或 Zod。
- 配置通过 `Config` 进入 `apply`。工具标识固定为 `pansou_search`，不提供 `toolName` 或 `toolDescription` 配置，工具策略和描述覆盖由 v2 管理。
- 配置界面使用宿主 SchemaForm 与 ui-kit，不复制旧界面组件或另设保存通道。
- 迁移决策见 `.agents/notes/implemented/feature/2026-11-08-pansou-v2.{zh,en}.md`。
- 网络请求响应调用取消与插件卸载；不新增本地缓存、重试、去重或聊天命令，后端缓存刷新通过 `refresh` 透传。

## 发布

- 在源码根目录运行 `node scripts/publish.mjs --dry-run` 演练，正式发布运行 `node scripts/publish.mjs`；npm 两步验证使用 `--otp=<验证码>`，`--help` 查看说明。
- 发布在本机构建，不使用 GitHub Actions 获取私有 v2 依赖。构建副本、安装依赖和源目录不生成锁文件的规则与开发相同；详细发布边界见 `scripts/AGENTS.md`。
- 公开仓库为 `Sor85/chatluna-plugin-pansou`，版本仅取 package.json，不由发布脚本递增。

## 子目录说明

- `scripts/AGENTS.md`：源码同步、本地 npm 发布与演练边界。

- `src/AGENTS.md`：PanSou 协议、配置、工具与生命周期。
- `tests/AGENTS.md`：协议回归、工具集成与隔离沙箱测试。
