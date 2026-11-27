# DSH Remote SSH

在 [DeepSeek Harness](https://github.com/deepseek-ai) 里使用远程 SSH 工作区：**agent、模型、会话、审批留在本地，文件系统、命令和任务在远程机器执行**。远程机器不需要安装或运行 dsh。

这是一个面向真实远程开发场景的 DSH 插件：你在熟悉的 Chat / 工作区 UI 里工作，实际读写、搜索、bash、jobs 都落在 SSH 主机上。

```text
本地 DSH Host
  ├─ agent / model / session / approvals
  ├─ remote workspace binding
  └─ remote fs / shell / jobs providers
          │
          │ SSH
          ▼
远程主机
  ├─ 工作目录
  └─ bash / jobs
```

## 为什么

传统的远程开发通常是“再开一个远程 IDE / 再连一个远程服务”。DSH Remote SSH 选择另一种方式：

- **不启动远程 dsh**：没有远程 profile、代理或嵌入 UI；远程 dsh 的历史会话可以手动导入本地，导入后仍由本地 agent 驱动；
- **只把工具执行搬到远程**：agent 仍然在本地，模型、上下文、审批、会话历史都在本地；
- **工作区就是远程目录**：新建远程工作区后，当前会话的 fs / shell 自动绑定到该主机和目录；
- **保留 DSH 的交互方式**：会话、工作区切换、文件树都还在同一个 UI 里。

## 功能

### 远程工作区

- 在 **Add Workspace**（加号）里选择 **添加本地工作区** 或 **添加远程工作区**；
- 远程工作区只需要 SSH 主机和远程目录，不需要配置 preset；
- 支持在远程目录树里浏览、筛选、前进/后退并选择目录；
- 工作区记录绑定 `hostId`、`target`、`remotePath`、本地 handle、模式与 preset；
- 远程路径在创建前通过 SSH 校验必须存在且是目录；
- 绑定会读取 DSH 当前的 effective working directory（新版 DSH 的 `workingDirectory` 服务），并在 Host 端文件请求没有 agent initiator 时回退到已打开的远程会话；无法绑定时写入 `~/.dsh/remote-ssh/binding-debug.json` 供诊断。

### 远程工具

远程 preset 使用与本地一致的 DSH 工具链，但底层 provider 被替换：

- `read`、`write`、`edit`、`glob`、`grep`；
- `bash`、后台 jobs；
- fs 搜索与大文件分页。

本地 `working_directory`、`render_ui`、`validate_dsh_ui` 等全局工具在远程 preset 中被限制；`ops_*` 是 scope-local 工具，不能用 `tools.restrict()` 隐藏，由 pre-execute 拒绝，避免误用本地路径。本插件不提供远程终端 backend，因此远程工作区里的 `terminal_open` 也会被拒绝（避免在本机开一个终端）。

### 三种远程模式

| 模式 | preset | 说明 |
| --- | --- | --- |
| Standard | `remote-standard` | 运行时从 DSH 本体 `standard` 预设动态派生，并将 fs / search / bash / jobs / present 路由到远程 SSH |
| PTC | `remote-ptc` | 运行时从 DSH 本体 `ptc` 预设动态派生，保留本体的 PTC 执行与规划配置 |
| Minimal | `remote-minimal` | 运行时从 DSH 本体 `minimal` 预设动态派生，保留精简配置并将 fs / bash 路由到远程 SSH |

默认使用 `remote-standard`。所有 `remote-*` preset 均由 `lib/preset-deriver.js` 在运行时基于 DSH 当前生效的预设自动派生（排除 `cordis` 创建者模式，并支持跟随热重载与自定义预设）；每个 session 根据工作区路径解析实际远程目标。

### 文件树与远程内容

右侧原生文件树通过 `workspaceFiles` 桥接**按需逐级列目录**（不在本地磁盘生成全量镜像）：

- 本地 `~/.dsh/remote-ssh/agent-workspaces/<hash>/` 仅保留空的工作区句柄目录，打开工作区时无全盘扫描与本地落盘开销；
- 每次仅查询当前展开目录的一级条目（单次 SSH `find -H -maxdepth 1`），点击子目录时按需拉取下一级，并正确解析符号链接目录；
- 侧边栏文件搜索、文本分页预览与图片预览均按需直接读取远端真实内容；
- PNG / JPEG / GIF / WebP / SVG 等图片直接在侧边栏中预览（按需通过 SSH 下载原始字节，带体积上限保护）。

这样既保留了 DSH 原生文件树的导航体验，又避免了大仓库全量同步、Windows 大小写/非法字符冲突以及过期目录问题。

安装 `dsh-better-sidebar` 时，右侧栏目录树自带一套 Host 文件 API（`/sidebar/api/fs.tree`），默认直接读本地磁盘；插件会在客户端把它的目录列表请求桥接回本插件的 SSH 路由，因此远程工作区的树显示的是远端当前目录，而不是本地句柄目录里残留的旧占位文件。

远程文件的预览按格式分流，尽量与本地一致：

- `md` / `markdown` / `html`：交给 better-sidebar 自带的渲染器（它的 `fs.read` / `fs.readPage` 同样被桥接，读的是远端内容），所以能按 Markdown / HTML 渲染；
- `csv` / `tsv`：插件内置表格预览（最多 500 行 × 40 列）；
- 其余文本与图片：插件内置的远程预览器（文本上限 200 KB / 4000 行）；
- 远程预览是只读的：better-sidebar 的写入、重命名、删除、上传请求在远程工作区路径上会被拒绝，避免写到本地句柄目录。

对话里的文件链接同样可以点开：除了本地句柄路径，直接写成远端绝对路径（如 `/home/user/app/main.py`）或其 Windows 规范化形式（DSH 在 Windows 上会把 `/home/...` 变成 `\home\...`）也会被识别并桥接到 SSH 读取，不会落到本地磁盘。

### 对话中的文件预览

对话里的文件链接和文件变更记录继续使用 DSH 原生的右侧文档预览：

- 点击远程文件路径时，Host 侧的 `workspaceFiles` 会映射到远程文件系统按需读取；
- 绝对路径和相对路径都按当前会话的远程工作区解析；
- 大文件仍走分页读取与审批；
- 导入的远程会话没有本地 `workspaceChanges` 快照，插件会从工具结果的 `meta.diffs` 重建变更摘要和对比；只覆盖带 `diffs` 的文件工具结果，纯 bash 改动不会伪造 diff；
- 如果升级后首次打开仍是空白，重启 DSH 让 Host 桥接重新挂载；诊断信息在 `~/.dsh/remote-ssh/file-surface-bridge.json`、`workspace-changes-bridge.json` 和 `file-surface-calls.json`。

### 导入远程 DSH 会话

远程机器上已有的 dsh 会话可以手动导入本地：

1. 打开侧栏 **Remote SSH**；
2. 在目标主机行点 **导入会话**；
3. 插件通过 SSH 扫描远程 `~/.dsh/sessions`，列出会话标题、工作目录、更新时间、大小；
4. 勾选一个或多个会话，点 **导入所选会话**；
5. 导入完成后直接打开会话，在本地查看历史并继续对话。

导入规则：

- 只读取远程 session log 的快照，不启动远程 dsh，也不会修改远程会话；
- 只支持 DSH 当前的 v4 log；更早的 v3 log 需要先在远程用兼容版本迁移，不能直接导入；
- 远程 `cwd` 会映射为本地 remote-agent workspace；如果该远程目录还没有工作区，会自动创建；
- 导入后的 session header 指向本地 remote-agent workspace，preset 为 `remote-standard` / `remote-ptc` / `remote-minimal`（取决于该远程目录已有工作区的模式），因此继续对话时仍然使用远程 fs / shell；
- 远程日志里的 `agent-preset/selected` 事件会被改写，避免回放时切回远程机器上的本地 preset；
- 远程日志里的 `approval/policy`、`sandbox/mode`、`permission/preset` 事件会保留在原序号位置，但 payload 改成本地限制性默认值（`ask` / `workspace-write` / `workspace-write`），避免远程策略在本地回放时放宽本地审批/沙箱设置，同时不破坏 v4 事件的 `throughSeq`、`shadowedSeqs` 等序号关系；
- 已导入的 session id 会标记为 **已导入**，不会重复写入；
- 导入是手动快照：导入后远程会话的新消息不会自动同步；再次导入同一 id 时只会跳过。

### bwrap 沙箱

如果远程主机支持 unprivileged `bwrap`，插件会在主机检测和添加时识别，并让远程 bash 在沙箱里执行：

```sh
bwrap --ro-bind / / \
  --bind <workspace> <workspace> \
  --dev /dev --proc /proc --tmpfs /tmp \
  --setenv HOME <workspace> \
  --chdir <workspace> \
  --die-with-parent \
  --unshare-pid --unshare-uts --unshare-ipc \
  sh -lc '<command>'
```

- `/` 只读；
- workspace 可写；
- `/tmp` 为 tmpfs；
- `HOME` 指向 workspace；
- 网络不隔离；
- 远程 fs 工具仍使用 direct SSH，不在 bwrap 内。

检测结果会显示在主机行：

```text
aliyun   [bwrap 沙箱]
iota-sc  [无沙箱]
         bwrap: setting up uid map: Permission denied
```

每条远程 shell 命令会写入：

```text
~/.dsh/remote-ssh/sandbox-log.jsonl
```

Remote SSH 页面提供 **沙箱日志** 按钮，显示 `sandbox=bwrap|none`、主机、工作目录和命令。

### 审批

- 沙箱内远程 `bash` 自动放行；
- 无沙箱主机的 `bash` 仍询问；
- 远程 `write` / `edit` 仍询问，因为 direct SSH 写入不在 bwrap 内；
- 本地工具在远程 preset 中受限；
- 没有全局 auto 模式。

## 安装

需要：

- 桌面版 DeepSeek Harness；
- 本地 OpenSSH 客户端；
- 可用的 SSH alias / host；
- 远程目录存在且可写。

### 从 GitHub 安装（推荐）

1. 打开 DSH **Settings → Plugins → Add plugin**；
2. 在 **Package name or address** 中输入：

   ```text
   https://github.com/x1e5c/dsh-remote-ssh
   ```

3. 点 **Install**；
4. 完整重启 DSH。

安装器会读取仓库中的 `package.json` 和 `dsh.bundle.patch`，把 `dsh-remote-ssh` 作为 bundle 加入 profile。

### 手动安装

把插件作为 DSH profile 的 bundle 安装。profile 的 `dsh.profile.bundles` 中需要：

```json
[
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dsh-remote-ssh"
]
```

然后完整重启 DSH。

## 快速开始

1. 打开侧栏 **Remote SSH**；
2. 添加 SSH 主机：
   - 名称；
   - SSH host / alias，例如 `aliyun` 或 `iota-sc`；
3. 点 **检测沙箱**；
4. 点 **Add Workspace**（加号）→ **添加远程工作区**；
5. 选择主机与远程目录；
6. 创建并打开远程工作区；
7. 在文件树或对话中使用远程工具；
8. 如果要继续远程机器上已有的 dsh 会话，回 **Remote SSH** 页点主机的 **导入会话**。

## 项目结构

```text
dsh-remote-ssh/
├─ index.js                  # Host routes / plugin entry
├─ client.js                 # Web UI（工作区菜单、Remote SSH 页、对话框、viewer）
├─ cordis.patch.yml          # bundle patch：Host 插件（remote-* preset 由运行时动态派生）
├─ lib/
│  ├─ controller.js          # 主机、工作区、binding、文件路由、沙箱检测、会话导入
│  ├─ preset-deriver.js      # 从 DSH 本体预设动态派生 remote-* preset 并跟随重载
│  ├─ remote.js              # SSH 调用与路径校验
│  ├─ mirror.js              # 文件树 names-only mirror
│  ├─ remote-sessions.js     # 远程 session 扫描结果解析、标题提取、导入 header
│  └─ ...
├─ remote-fs.js              # 远程 fs provider
├─ remote-shell.js           # 远程 shell provider + bwrap + 日志
├─ remote-tool-restrict.js   # 本地工具限制
├─ remote-fs-approval.js     # 远程执行审批
├─ remote-context.js         # system prompt 上下文
├─ locale/                   # i18n
└─ test/                     # node:test
```

## 配置与状态文件

```text
~/.dsh/remote-ssh/hosts.json             # SSH 主机与 sandbox 能力
~/.dsh/remote-ssh/agent-workspaces.json  # 远程工作区绑定
~/.dsh/remote-ssh/sandbox-log.jsonl      # 远程 shell 执行日志
~/.dsh/remote-ssh/mirror-state.json      # names-only mirror 状态
```

远程工作区 handle 位于：

```text
~/.dsh/remote-ssh/agent-workspaces/<hash>/
```

## 开发

```bash
git clone <repository>
cd dsh-remote-ssh
node --check client.js
node --check lib/controller.js
```

测试：

```bash
node test/workspace-binding.test.mjs
node test/remote-bound.test.mjs
node test/remote-tool-restrict.test.mjs
node test/remote-sessions.test.mjs
node test/import-remote-sessions.test.mjs
```

Windows 下某些测试可能遇到 `spawn EPERM`，这是 DSH 沙箱对子进程的限制，不是测试失败；逐文件运行通常可以绕过。

## 限制

- 远程没有 DSH 的 OS sandbox；bwrap 是可选的额外隔离，且依赖远程内核/用户命名空间；
- 启用 bwrap 时，`bash` 和远程工作区内的 `write` / `edit` 自动免确认（写入前校验 `realpath` 防止软链逃逸）；工作区外的文件修改仍会弹窗确认；
- 文件树按需只查询当前展开目录的一级条目，首次展开子目录会有一次 SSH 往返；
- `dsh-better-sidebar` 的目录监听仍基于本地路径，远端新增/删除文件后需要点一次树的刷新（或重新展开目录）才会出现；
- 远程侧栏预览只读：`md` / `html` 用 better-sidebar 的渲染器，`csv` / `tsv` 用内置表格，其余为内置文本/图片预览；编辑请用远程 `read` / `write` / `edit` 工具；
- 会话导入是手动快照，不是持续同步；导入后远程新消息不会自动出现在本地；
- 远程连接按操作建立，不是持久 ControlMaster；
- 远程路径、目录大小、下载大小与 SSH 延迟都会影响体验；
- 这是实验性插件，接口可能随 DSH 变化。

## License

MIT
