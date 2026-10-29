# DSH Remote SSH

在 [DeepSeek Harness](https://github.com/deepseek-ai) 里使用远程 SSH 工作区：**agent、模型、会话、审批留在本地，文件系统、命令、任务和终端在远程机器执行**。远程机器不需要安装或运行 dsh。

这是一个面向真实远程开发场景的 DSH 插件：你在熟悉的 Chat / 工作区 UI 里工作，实际读写、搜索、bash、jobs 和终端都落在 SSH 主机上。

```text
本地 DSH Host
  ├─ agent / model / session / approvals
  ├─ remote workspace binding
  └─ remote fs / shell / jobs / terminal providers
          │
          │ SSH
          ▼
远程主机
  ├─ 工作目录
  ├─ bash / jobs
  └─ terminal
```

## 为什么

传统的远程开发通常是“再开一个远程 IDE / 再连一个远程服务”。DSH Remote SSH 选择另一种方式：

- **不启动远程 dsh**：没有远程 profile、代理、嵌入 UI 或远程会话同步；
- **只把工具执行搬到远程**：agent 仍然在本地，模型、上下文、审批、会话历史都在本地；
- **工作区就是远程目录**：新建远程工作区后，当前会话的 fs / shell / terminal 自动绑定到该主机和目录；
- **保留 DSH 的交互方式**：会话、工作区切换、Remote Files、文件树、终端都还在同一个 UI 里。

## 功能

### 远程工作区

- 在 **Add Workspace**（加号）里选择 **添加本地工作区** 或 **添加远程工作区**；
- 远程工作区只需要 SSH 主机和远程目录，不需要配置 preset；
- 支持在远程目录树里浏览、筛选、前进/后退并选择目录；
- 工作区记录绑定 `hostId`、`target`、`remotePath`、本地 handle、模式与 preset；
- 远程路径在创建前通过 SSH 校验必须存在且是目录。

### 远程工具

远程 preset 使用与本地一致的 DSH 工具链，但底层 provider 被替换：

- `read`、`write`、`edit`、`glob`、`grep`；
- `bash`、后台 jobs；
- fs 搜索与大文件分页；
- 远程终端。

本地 `ops_*`、`working_directory`、`render_ui` 等工具在远程 preset 中被限制，避免误用本地路径。

### 三种远程模式

| 模式 | preset | 说明 |
| --- | --- | --- |
| Standard | `remote-standard` | 完整 fs / search / bash / jobs / planning / compaction / delegation |
| PTC | `remote-ptc` | 以 PTC 展示与 planning 为主 |
| Minimal | `remote-minimal` | 只保留远程 fs 与 bash |

默认使用 `remote-standard`。preset 是静态、可复用的；每个 session 根据工作区路径解析实际远程目标。

### Remote Files

侧栏 **Remote files** 提供远程文件操作：

- 浏览远程目录；
- 文件名筛选；
- 文本预览与分页；
- TSV / CSV 表格预览；
- 编辑小文件（带版本校验）；
- 流式下载完整文件；
- 进度与取消。

### 文件树与远程内容

右侧文件树读取的是远程目录的 **names-only mirror**：

- 目录和文件名同步到本地工作区 handle；
- 不把大文件内容拉回本地；
- 打开文件时由远程 viewer 读取真实内容；
- viewer 只读显示前 1000 行，完整内容用 Remote Files。

这样既保留了 DSH 文件树的导航体验，又不会让大仓库同步拖慢本地。

### 终端

远程终端通过 `remote-terminal-multi` 动态注册：

- 每个 agent workspace 一个 backend；
- 类型形如 `remote-ssh-<target>-<path>-<digest>`；
- 5 秒轮询 `agent-workspaces.json` 以跟随新工作区；
- 终端在远程执行，但会话与审批仍在本地。

### bwrap 沙箱

如果远程主机支持 unprivileged `bwrap`，插件会在主机检测和添加时识别，并让远程 bash / terminal 在沙箱里执行：

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

把插件作为 DSH profile 的 bundle 安装。profile 的 `dsh.profile.bundles` 中需要：

```json
[
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-experimental-terminal-bundle",
  "dsh-remote-ssh"
]
```

顺序很重要：**`@deepseek-ai/dsh-experimental-terminal-bundle` 必须在 `dsh-remote-ssh` 之前**，因为 remote bundle 会覆盖它的 `optional-persistent-terminals` group。

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
7. 在 Remote Files、文件树、终端或对话中使用远程工具。

## 项目结构

```text
dsh-remote-ssh/
├─ index.js                  # Host routes / plugin entry
├─ client.js                 # Web UI（工作区菜单、Remote SSH 页、Remote Files、对话框、viewer）
├─ cordis.patch.yml          # bundle patch：Host 插件、presets、terminal group
├─ lib/
│  ├─ controller.js          # 主机、工作区、binding、文件路由、沙箱检测
│  ├─ remote.js              # SSH 调用与路径校验
│  ├─ mirror.js              # 文件树 names-only mirror
│  └─ ...
├─ remote-fs.js              # 远程 fs provider
├─ remote-shell.js           # 远程 shell provider + bwrap + 日志
├─ remote-terminal*.js       # 远程终端 backend
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
```

Windows 下某些测试可能遇到 `spawn EPERM`，这是 DSH 沙箱对子进程的限制，不是测试失败；逐文件运行通常可以绕过。

## 限制

- 远程没有 DSH 的 OS sandbox；bwrap 是可选的额外隔离，且依赖远程内核/用户命名空间；
- bwrap 只覆盖远程 bash / terminal；远程 fs 工具仍是 direct SSH；
- 文件树是 names-only mirror，目录变化后需要刷新；
- 远程连接按操作建立，不是持久 ControlMaster；
- 远程路径、目录大小、下载大小与 SSH 延迟都会影响体验；
- 这是实验性插件，接口可能随 DSH 变化。

## License

MIT
