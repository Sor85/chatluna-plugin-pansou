# scripts 说明

适用范围：`scripts/`。同时遵守根 `AGENTS.md`；发布回归见 `tests/AGENTS.md`。

- 脚本仅使用 Node.js 内置模块；源码目录不安装依赖、不生成锁文件。命令直接通过 `node scripts/<脚本>.mjs` 运行。
- `sync-to-v2.mjs` 单向同步到宿主 `external/pansou`，拒绝符号链接，不同步 Git、本地配置、凭据、日志、测试缓存和构建产物；宿主数据和生成目录不参与删除。
- `publish.mjs` 参考 onebot-sandbox 的本地发布流程，宿主与同步脚本共用 `CHATLUNA_V2_ROOT`。正式发布前检查干净工作区、非 detached HEAD、与 origin 同名分支一致、本地及远端版本标签不存在、npm 登录和版本未发布。
- 发布先同步，再清理副本 `lib`、`dist`、`tsconfig.tsbuildinfo`，执行构建、类型检查、测试；使用 `yarn pack` 改写 workspace 依赖，并检查入口、声明、README、LICENSE 与版本。
- 从解压目录执行 `npm publish`，不直接发布 tgz，以保留 README 元数据。只向官方 npm registry 发布公开包，普通版本用 latest，alpha/beta/rc/next 各用相应标签，其他预发布用 next。
- 构建后及打 Git 标签前复查工作区与原 HEAD，防止包内容与提交不符；确认 npm 版本和 dist-tag 后才创建、推送指向该 HEAD 的版本标签。发布后查不到索引时只重试查询，不重复 publish。
- `--dry-run` 允许未提交工作区，无需 npm 登录；仍完整构建、检查、测试与打包，只调用 `npm publish --dry-run`，不创建或推送标签。`--help` 不启动构建或访问外部服务；未知参数须拒绝，避免拼写错误变成正式发布。
- 不自动改版本、提交代码或推送分支；OTP 不输出到脚本日志。打包目录放系统临时目录，保留路径供失败排查与人工检查。
