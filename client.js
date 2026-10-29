window.__ModuleLoader__.load({
  id: 'dsh-remote-ssh',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'remote-ssh'

    const DICT = {
      zh: {
        title: '远程 SSH',
        subtitle: '把远程机器上的 dsh 工作区嵌入当前界面；远程 dsh 负责会话、工具和远程目录。',
        new: '新建工作区',
        edit: '编辑工作区',
        refresh: '刷新',
        loading: '正在加载…',
        'empty.title': '还没有远程工作区',
        'empty.body': '添加一个 SSH 主机上的远程目录；打开后由远程 dsh 运行会话，远程工作区会保留在列表中。',
        'empty.action': '新建工作区',
        'status.idle': '未连接',
        'status.connecting': '正在连接…',
        'status.probing': '正在检测远程环境…',
        'status.launching': '正在启动远程 dsh…',
        'status.ready': '已连接',
        'status.error': '连接失败',
        'status.disconnecting': '正在断开…',
        'status.installing': '正在安装远程 dsh…',
        'action.connect': '连接',
        'action.disconnect': '断开',
        'action.open': '打开会话',
        'action.newWorkspaceHere': '在此主机新建工作区',
        'action.copy': '复制地址',
        'action.logs': '日志',
        'action.hideLogs': '收起日志',
        'action.edit': '编辑',
        'action.delete': '删除',
        'action.save': '保存',
        'action.cancel': '取消',
        'action.install': '安装远程 dsh',
        'action.retry': '重试',
        'action.close': '关闭',
        'action.mirror': '同步会话',
        'action.agentWorkspace': '新建远程 Agent 工作区',
        'agentWorkspace.done': '已创建远程 Agent 工作区：{title}。新会话会使用本地模型，工具走 SSH。',
        'agentWorkspace.failed': '创建远程 Agent 工作区失败。',
        'agentWorkspace.pathPrompt': '远程 Agent 工作区路径（绝对路径）：',
        'workspace.title': '远程工作区',
        'workspace.subtitle': '添加 SSH 主机和远程工作区。会话、模型、审批在本地，文件与命令在远程执行。',
        'workspace.hostsTitle': 'SSH 主机',
        'workspace.hostsSubtitle': '只管理 SSH 主机连接；远程工作区在“添加工作区”中选择远程机器和目录。',
        'workspace.addHint': '远程工作区：点击侧栏底部“远程工作区”，选择主机和目录。',
        'flow.title': '添加工作区',
        'flow.local': '本地目录',
        'flow.remote': '远程 SSH',
        'flow.remoteHost': '远程机器',
        'flow.mode': '模式',
        'flow.path': '目录',
        'flow.up': '上一级',
        'flow.select': '选择此目录',
        'flow.cancel': '取消',
        'flow.loading': '正在读取目录…',
        'flow.empty': '这个目录没有子目录。',
        'flow.error': '读取目录失败。',
        'flow.noHost': '还没有 SSH 主机。先在左侧“远程 SSH”中添加主机。',
        'flow.openSSH': '打开 SSH 主机设置',
        'flow.hint': '远程工作区会创建为本地 agent + 远程工具；不会在远程机器运行 dsh。',
        'flow.remoteAction': '远程工作区',
        'flow.remoteMenu': '添加远程工作区',
        'flow.addLocal': '添加本地工作区',
        'flow.addRemote': '添加远程工作区',
        'flow.remoteTitle': '添加远程工作区',
        'flow.remoteSubtitle': '选择 SSH 主机和远程目录即可，不需要选择 preset。',
        'flow.selectHost': '远程机器',
        'flow.filter': '筛选目录…',
        'flow.noMatch': '没有匹配的目录。',
        'flow.creating': '正在创建…',
        'viewer.remote': '远程文件',
        'viewer.loading': '正在读取远程文件…',
        'viewer.binary': '这是二进制文件，暂不预览。',
        'viewer.truncated': '只显示前 1000 行；完整内容请用 Remote Files 下载。',
        'viewer.notRemote': '这个文件不属于远程工作区。',
        'workspace.hosts': 'SSH 主机',
        'workspace.addHost': '添加主机',
        'workspace.hostName': '名称',
        'workspace.hostTarget': 'SSH 主机 / 别名',
        'workspace.hostPath': '默认远程路径',
        'workspace.saveHost': '保存主机',
        'workspace.refresh': '刷新',
        'workspace.detectSandbox': '检测沙箱',
        'workspace.sandboxDetected': '已检测远程沙箱。',
        'workspace.sandboxAvailable': 'bwrap 沙箱',
        'workspace.sandboxMissing': '无沙箱',
        'workspace.sandboxLog': '沙箱日志',
        'workspace.sandboxLogEmpty': '还没有执行日志。',
        'workspace.hostSaved': '主机已保存。',
        'workspace.create': '新建远程工作区',
        'workspace.path': '工作区路径',
        'workspace.mode': '模式',
        'workspace.standard': '标准',
        'workspace.ptc': 'PTC',
        'workspace.minimal': '极简',
        'workspace.empty': '还没有远程工作区。',
        'workspace.open': '打开',
        'workspace.remove': '删除主机',
        'workspace.created': '远程工作区已创建。',
        'workspace.failed': '创建远程工作区失败。',
        'workspace.pathHelp': '必须是远程主机上已存在的绝对路径。',
        'workspace.modeHelp': '标准 / PTC / 极简对应静态 remote preset，不按工作区生成动态 preset。',
        'workspace.noHost': '先添加 SSH 主机。',
        'files.title': '远程文件',
        'files.subtitle': '直接浏览 SSH 远程目录；文件只按需读取预览，不复制到本地。',
        'files.workspace': '远程工作区',
        'files.refresh': '刷新',
        'files.up': '上一级',
        'files.loading': '正在读取远程目录…',
        'files.empty': '这个目录是空的。',
        'files.noWorkspace': '还没有远程 Agent 工作区。点击侧栏底部“远程工作区”创建。',
        'files.preview': '预览',
        'files.binary': '这是二进制文件，暂不预览。',
        'files.truncated': '只显示前 {count} 行；文件较大，可继续分页读取。',
        'files.size': '{size}',
        'files.error': '读取远程文件失败。',
        'files.path': '路径',
        'files.lines': '{count} 行',
        'files.search': '按文件名筛选…',
        'files.noMatch': '没有匹配的文件。',
        'files.loadMore': '加载更多',
        'files.loaded': '已加载 {count} 行',
        'files.end': '已到文件末尾',
        'files.loadingMore': '正在加载更多…',
        'files.table': '表格预览',
        'files.edit': '编辑',
        'files.save': '保存',
        'files.cancel': '取消',
        'files.saving': '正在保存…',
        'files.download': '下载完整文件',
        'files.downloading': '正在下载…',
        'files.cancelDownload': '取消下载',
        'files.downloaded': '已下载',
        'files.downloadFailed': '下载失败',
        'files.saved': '已保存',
        'files.readOnly': '文件较大，仅支持预览。',
        'files.editTooLarge': '文件超过 256KB 或 1000 行，暂不支持编辑。',
        'mirror.busy': '正在同步远程会话…',
        'mirror.done': '已同步 {mirrored} 个远程会话（跳过 {skipped} 个）。在本地工作区侧栏查看“远程 · …”。',
        'mirror.failed': '同步完成，但 {failed} 个会话失败。',
        'mirror.none': '远程没有可同步的会话。',
        'mirror.badge': '远程镜像',
        'mirror.open': '镜像会话',
        'mirror.openHint': '打开本地镜像会话',
        'mirror.notice': '远程镜像会话 · 新消息由 Host 桥接到远程 dsh；文本已接通，图片/附件仍受限。',
        copied: '已复制',
        copyManual: '请手动复制地址：',
        saved: '已保存',
        deleted: '已删除',
        'field.name': '工作区名称',
        'field.namePlaceholder': '例如：训练机 /root',
        'field.target': 'SSH 目标',
        'field.targetPlaceholder': '~/.ssh/config 别名或 user@host',
        'field.targetHelp': '使用 ~/.ssh/config 中的别名时，会自动应用 User、Port、IdentityFile 和 ProxyJump。',
        'field.port': '端口（可选）',
        'field.portPlaceholder': '使用 SSH 配置中的端口',
        'field.remotePath': '远程目录',
        'field.remotePathPlaceholder': '~ 或 /home/me/project',
        'field.remotePathHelp': '远程 dsh 会以该目录作为默认工作区启动。',
        'field.identityFile': '私钥文件（可选）',
        'field.identityFilePlaceholder': '~/.ssh/id_ed25519',
        'field.dshCommand': '远程 dsh 命令（可选）',
        'field.dshCommandPlaceholder': '留空则自动检测',
        'field.dshCommandHelp': '例如 npx -y @deepseek-ai/dsh；留空时会查找 PATH、~/.local/bin 和 nvm 路径。',
        'field.secret': 'SSH 密码 / 私钥口令（可选）',
        'field.secretPlaceholder': '留空保持不变',
        'field.secretHelp': '只保存在本机 DSH 凭据库，不会写入连接列表。推荐使用密钥或 ssh-agent；Windows 上的密码提示依赖 OpenSSH 的 SSH_ASKPASS 支持。',
        'field.clearSecret': '清除已保存的口令',
        advanced: '高级选项',
        'meta.workspace': '远程目录',
        'info.lastUsed': '上次使用',
        'info.lastOpened': '上次打开',
        'info.never': '从未',
        'error.title': '连接出错',
        'error.unknown': '未知错误。',
        'error.ssh-missing': '本机找不到 OpenSSH 客户端（ssh）。',
        'error.connect-failed': '无法建立 SSH 连接。',
        'error.auth-failed': 'SSH 认证失败。',
        'error.host-key-changed': '远程主机密钥已变化或不受信任。',
        'error.dns': '无法解析远程主机名。',
        'error.unsupported-remote': '目前只支持 Linux/macOS 远程主机。',
        'error.path-missing': '远程工作区目录不存在。',
        'error.dsh-missing': '远程机器上找不到 dsh。',
        'error.npm-missing': '远程机器上找不到 npm，无法自动安装 dsh。',
        'error.launch-timeout': '等待远程 dsh 启动超时。',
        'error.launch-failed': '远程 dsh 启动失败。',
        'error.tunnel-closed': 'SSH 隧道已断开。',
        'error.forward-failed': '本地端口转发失败。',
        'error.install-failed': '远程 dsh 安装失败。',
        'error.invalid-input': '输入不完整或格式不正确。',
        'error.credentials-unavailable': '本机凭据服务不可用，无法保存口令。',
        'error.secret-missing': '需要 SSH 密码或私钥口令。',
        'error.busy': '当前连接正在处理中。',
        'error.not-found': '连接不存在。',
        'error.not-ready': '连接尚未就绪。',
        'error.open-failed': '无法打开默认浏览器。',
        'error.ssh-error': 'SSH 命令执行失败。',
        'error.bad-response': '服务端返回了无法解析的响应。',
        'error.api-unreachable': '无法连接本机 Harness 服务。',
        'error.target-required': '请填写 SSH 目标。',
        'error.port-invalid': '端口必须是 1-65535 的整数。',
        'install.confirm': '将在远程主机执行 npm install -g @deepseek-ai/dsh。继续？',
        'install.hint': '远程 dsh 未安装。可以手动安装，或让插件执行：',
        'install.done': '安装完成，请重新连接。',
        'delete.confirm': '删除远程工作区“{name}”？',
        'hint.auth': '推荐在远程主机配置密钥或 ssh-agent；也可以在高级选项中保存密码/口令。',
        'hint.open': '远程界面会嵌入当前主面板；如果显示空白，请使用“在浏览器打开”。',
        'hint.pathMissing': '请编辑工作区并修正远程目录。',
        sshMissing: '本机没有找到 OpenSSH 客户端（ssh）。请先安装 OpenSSH。',
        credentialsMissing: '本机凭据服务不可用，密码/口令登录不可用。',
        footer: '远程 dsh 以你的 SSH 用户身份运行；每个远程工作区使用独立的远程 dsh 配置。首次加载会把已保存工作区的远程会话同步为本地镜像，文本消息可桥接回远程。',
        'logs.title': '连接日志',
        'logs.empty': '暂无日志。',
        'hero.label': '远程',
        'hero.title': '在当前界面打开远程工作区',
        'sidebar.newWorkspace': '远程工作区',
        'overlay.pickTitle': '选择远程工作区',
        'overlay.pickSubtitle': '打开后嵌入当前主面板；远程机器负责处理该目录。',
        'overlay.newTitle': '新建远程工作区',
        'overlay.newSubtitle': '保存一个 SSH 主机上的远程目录，之后可从这里或“新会话”直接打开。',
        'overlay.empty': '还没有远程工作区。先创建一个。',
        'overlay.new': '新建工作区',
        'overlay.open': '打开会话',
        'overlay.connecting': '正在启动远程 dsh…',
        'overlay.opening': '正在打开远程界面…',
        'overlay.source': '从现有工作区复制连接信息',
        'overlay.sourceNone': '不复制，手动填写',
        'overlay.reuseSecret': '主机和端口相同时，会复用该工作区保存的口令。',
        'overlay.saveOpen': '保存并打开',
        'overlay.save': '仅保存',
        'overlay.manage': '管理全部',
        'overlay.back': '返回列表',
        'overlay.close': '关闭',
        'overlay.note': '选择后会在当前主面板中嵌入远程 dsh 界面；本地工作区和会话列表保持不变。',
        'overlay.lastOpened': '上次打开',
        'overlay.never': '从未打开',
        'overlay.needTarget': '请填写 SSH 目标和远程目录。',
        'embed.back': '返回工作区列表',
        'embed.title': '远程会话',
        'embed.select': '切换工作区',
        'embed.reload': '重新加载',
        'embed.browser': '在浏览器打开',
        'embed.disconnect': '断开连接',
        'embed.loading': '正在加载远程 dsh 界面…',
        'embed.waiting': '正在启动远程 dsh…',
        'embed.missingUrl': '远程 dsh 尚未就绪。',
        'embed.notFound': '这个远程工作区已不存在。',
        'embed.frameError': '远程界面加载失败；可以在浏览器中打开。',
        'embed.embeddedHint': '远程界面嵌入当前面板；如果保持空白，请用“在浏览器打开”。',
      },
      en: {
        title: 'Remote SSH',
        subtitle: 'Use a remote dsh workspace inside this interface; the remote dsh owns the session, tools, and directory.',
        new: 'New workspace',
        edit: 'Edit workspace',
        refresh: 'Refresh',
        loading: 'Loading…',
        'empty.title': 'No remote workspaces yet',
        'empty.body': 'Add a remote directory on an SSH host; the remote dsh runs the session and the workspace stays in this list.',
        'empty.action': 'New workspace',
        'status.idle': 'Not connected',
        'status.connecting': 'Connecting…',
        'status.probing': 'Checking remote environment…',
        'status.launching': 'Starting remote dsh…',
        'status.ready': 'Connected',
        'status.error': 'Connection failed',
        'status.disconnecting': 'Disconnecting…',
        'status.installing': 'Installing remote dsh…',
        'action.connect': 'Connect',
        'action.disconnect': 'Disconnect',
        'action.open': 'Open session',
        'action.newWorkspaceHere': 'New workspace on this host',
        'action.copy': 'Copy address',
        'action.logs': 'Logs',
        'action.hideLogs': 'Hide logs',
        'action.edit': 'Edit',
        'action.delete': 'Delete',
        'action.save': 'Save',
        'action.cancel': 'Cancel',
        'action.install': 'Install remote dsh',
        'action.retry': 'Retry',
        'action.close': 'Close',
        'action.mirror': 'Sync sessions',
        'action.agentWorkspace': 'New remote agent workspace',
        'agentWorkspace.done': 'Created remote agent workspace: {title}. New sessions use the local model and run tools over SSH.',
        'agentWorkspace.failed': 'Could not create the remote agent workspace.',
        'agentWorkspace.pathPrompt': 'Remote Agent workspace path (absolute):',
        'workspace.title': 'Remote workspaces',
        'workspace.subtitle': 'Add an SSH host and remote workspace. Session, model, and approvals stay local; files and commands run remotely.',
        'workspace.hostsTitle': 'SSH hosts',
        'workspace.hostsSubtitle': 'SSH connection settings only. Create remote workspaces from Add Workspace by choosing a remote host and directory.',
        'workspace.addHint': 'Remote workspace: click Remote workspace at the sidebar foot, then select a host and directory.',
        'flow.title': 'Add workspace',
        'flow.local': 'Local directory',
        'flow.remote': 'Remote SSH',
        'flow.remoteHost': 'Remote machine',
        'flow.mode': 'Mode',
        'flow.path': 'Directory',
        'flow.up': 'Up',
        'flow.select': 'Use this directory',
        'flow.cancel': 'Cancel',
        'flow.loading': 'Loading directory…',
        'flow.empty': 'This directory has no subdirectories.',
        'flow.error': 'Could not read the directory.',
        'flow.noHost': 'No SSH hosts yet. Add one in Remote SSH first.',
        'flow.openSSH': 'Open SSH host settings',
        'flow.hint': 'The remote workspace is a local agent with remote tools; dsh does not run on the remote machine.',
        'flow.remoteAction': 'Remote workspace',
        'flow.remoteMenu': 'Add remote workspace',
        'flow.addLocal': 'Add local workspace',
        'flow.addRemote': 'Add remote workspace',
        'flow.remoteTitle': 'Add remote workspace',
        'flow.remoteSubtitle': 'Choose an SSH host and a remote directory. No preset selection is required.',
        'flow.selectHost': 'Remote machine',
        'flow.filter': 'Filter directories…',
        'flow.noMatch': 'No matching directories.',
        'flow.creating': 'Creating…',
        'viewer.remote': 'Remote file',
        'viewer.loading': 'Loading remote file…',
        'viewer.binary': 'Binary file; preview is not available.',
        'viewer.truncated': 'Showing the first 1000 lines; use Remote files to download the full file.',
        'viewer.notRemote': 'This file does not belong to a remote workspace.',
        'workspace.hosts': 'SSH hosts',
        'workspace.addHost': 'Add host',
        'workspace.hostName': 'Name',
        'workspace.hostTarget': 'SSH host / alias',
        'workspace.hostPath': 'Default remote path',
        'workspace.saveHost': 'Save host',
        'workspace.refresh': 'Refresh',
        'workspace.detectSandbox': 'Detect sandbox',
        'workspace.sandboxDetected': 'Remote sandbox checked.',
        'workspace.sandboxAvailable': 'bwrap sandbox',
        'workspace.sandboxMissing': 'No sandbox',
        'workspace.sandboxLog': 'Sandbox log',
        'workspace.sandboxLogEmpty': 'No command has run yet.',
        'workspace.hostSaved': 'Host saved.',
        'workspace.create': 'Create remote workspace',
        'workspace.path': 'Workspace path',
        'workspace.mode': 'Mode',
        'workspace.standard': 'Standard',
        'workspace.ptc': 'PTC',
        'workspace.minimal': 'Minimal',
        'workspace.empty': 'No remote workspaces yet.',
        'workspace.open': 'Open',
        'workspace.remove': 'Remove host',
        'workspace.created': 'Remote workspace created.',
        'workspace.failed': 'Could not create the remote workspace.',
        'workspace.pathHelp': 'Must be an existing absolute path on the remote host.',
        'workspace.modeHelp': 'Standard / PTC / Minimal map to static remote presets; no dynamic preset is created per workspace.',
        'workspace.noHost': 'Add an SSH host first.',
        'files.title': 'Remote files',
        'files.subtitle': 'Browse the SSH directory directly; files are read on demand and are never copied locally.',
        'files.workspace': 'Remote workspace',
        'files.refresh': 'Refresh',
        'files.up': 'Up',
        'files.loading': 'Reading the remote directory…',
        'files.empty': 'This directory is empty.',
        'files.noWorkspace': 'No Remote Agent workspace yet. Use Remote workspace at the sidebar foot.',
        'files.preview': 'Preview',
        'files.binary': 'This is a binary file; preview is not available.',
        'files.truncated': 'Showing the first {count} lines; the file is larger and can be paged.',
        'files.size': '{size}',
        'files.error': 'Could not read the remote file.',
        'files.path': 'Path',
        'files.lines': '{count} lines',
        'files.search': 'Filter by file name…',
        'files.noMatch': 'No matching files.',
        'files.loadMore': 'Load more',
        'files.loaded': '{count} lines loaded',
        'files.end': 'End of file',
        'files.loadingMore': 'Loading more…',
        'files.table': 'Table preview',
        'files.edit': 'Edit',
        'files.save': 'Save',
        'files.cancel': 'Cancel',
        'files.saving': 'Saving…',
        'files.download': 'Download full file',
        'files.downloading': 'Downloading…',
        'files.cancelDownload': 'Cancel download',
        'files.downloaded': 'Downloaded',
        'files.downloadFailed': 'Download failed',
        'files.saved': 'Saved',
        'files.readOnly': 'This file is too large to edit.',
        'files.editTooLarge': 'Files over 256 KB or 1000 lines cannot be edited yet.',
        'mirror.busy': 'Syncing remote sessions…',
        'mirror.done': 'Synced {mirrored} remote sessions (skipped {skipped}). Look for “Remote · …” in the local workspace sidebar.',
        'mirror.failed': 'Sync finished with {failed} failed sessions.',
        'mirror.none': 'The remote host has no sessions to sync.',
        'mirror.badge': 'Remote mirror',
        'mirror.open': 'Mirror session',
        'mirror.openHint': 'Open the local mirror session',
        'mirror.notice': 'Remote mirror session. New messages are bridged to the remote dsh by the Host; text works, images and attachments are still limited.',
        copied: 'Copied',
        copyManual: 'Copy this address manually:',
        saved: 'Saved',
        deleted: 'Deleted',
        'field.name': 'Workspace name',
        'field.namePlaceholder': 'e.g. GPU box /root',
        'field.target': 'SSH target',
        'field.targetPlaceholder': '~/.ssh/config alias or user@host',
        'field.targetHelp': 'Aliases from ~/.ssh/config apply User, Port, IdentityFile, and ProxyJump automatically.',
        'field.port': 'Port (optional)',
        'field.portPlaceholder': 'Use the SSH config port',
        'field.remotePath': 'Remote directory',
        'field.remotePathPlaceholder': '~ or /home/me/project',
        'field.remotePathHelp': 'Remote dsh starts with this directory as its default workspace.',
        'field.identityFile': 'Private key file (optional)',
        'field.identityFilePlaceholder': '~/.ssh/id_ed25519',
        'field.dshCommand': 'Remote dsh command (optional)',
        'field.dshCommandPlaceholder': 'Auto-detect when empty',
        'field.dshCommandHelp': 'For example npx -y @deepseek-ai/dsh; empty scans PATH, ~/.local/bin, and nvm paths.',
        'field.secret': 'SSH password / key passphrase (optional)',
        'field.secretPlaceholder': 'Leave empty to keep',
        'field.secretHelp': 'Stored only in the local DSH credential store, never in the connection list. Keys or ssh-agent are recommended; on Windows, password prompts depend on OpenSSH SSH_ASKPASS support.',
        'field.clearSecret': 'Clear the saved secret',
        advanced: 'Advanced options',
        'meta.workspace': 'Remote directory',
        'info.lastUsed': 'Last used',
        'info.lastOpened': 'Last opened',
        'info.never': 'Never',
        'error.title': 'Connection problem',
        'error.unknown': 'Unknown error.',
        'error.ssh-missing': 'The local OpenSSH client (ssh) was not found.',
        'error.connect-failed': 'The SSH connection could not be established.',
        'error.auth-failed': 'SSH authentication failed.',
        'error.host-key-changed': 'The remote host key changed or is not trusted.',
        'error.dns': 'The remote host name could not be resolved.',
        'error.unsupported-remote': 'Only Linux and macOS remote hosts are supported.',
        'error.path-missing': 'The remote workspace directory does not exist.',
        'error.dsh-missing': 'dsh was not found on the remote machine.',
        'error.npm-missing': 'npm was not found on the remote machine, so dsh cannot be installed automatically.',
        'error.launch-timeout': 'Timed out waiting for remote dsh to start.',
        'error.launch-failed': 'Remote dsh failed to start.',
        'error.tunnel-closed': 'The SSH tunnel closed.',
        'error.forward-failed': 'Local port forwarding failed.',
        'error.install-failed': 'Installing remote dsh failed.',
        'error.invalid-input': 'Some fields are missing or invalid.',
        'error.credentials-unavailable': 'The local credential store is unavailable, so secrets cannot be saved.',
        'error.secret-missing': 'An SSH password or key passphrase is required.',
        'error.busy': 'This connection is busy.',
        'error.not-found': 'Connection not found.',
        'error.not-ready': 'This connection is not ready.',
        'error.open-failed': 'The default browser could not be opened.',
        'error.ssh-error': 'The SSH command failed.',
        'error.bad-response': 'The server returned an unreadable response.',
        'error.api-unreachable': 'The local Harness service could not be reached.',
        'error.target-required': 'Enter an SSH target.',
        'error.port-invalid': 'The port must be an integer between 1 and 65535.',
        'install.confirm': 'This runs npm install -g @deepseek-ai/dsh on the remote host. Continue?',
        'install.hint': 'Remote dsh is not installed. Install it manually, or let the plugin run:',
        'install.done': 'Installed. Reconnect to continue.',
        'delete.confirm': 'Delete remote workspace "{name}"?',
        'hint.auth': 'Prefer a key or ssh-agent on the remote host; you can also save a password/passphrase under Advanced options.',
        'hint.open': 'The remote UI is embedded in the main panel; if it stays blank, use Open in browser.',
        'hint.pathMissing': 'Edit the workspace and correct the remote directory.',
        sshMissing: 'The local OpenSSH client (ssh) was not found. Install OpenSSH first.',
        credentialsMissing: 'The local credential store is unavailable; password/passphrase login is disabled.',
        footer: 'Remote dsh runs as your SSH user; each remote workspace uses an isolated remote dsh profile. The first load mirrors saved remote sessions locally; text prompts are bridged back to the remote dsh.',
        'logs.title': 'Connection log',
        'logs.empty': 'No logs yet.',
        'hero.label': 'Remote',
        'hero.title': 'Open a remote workspace in this interface',
        'sidebar.newWorkspace': 'Remote workspace',
        'overlay.pickTitle': 'Choose a remote workspace',
        'overlay.pickSubtitle': 'Opens in the main panel; the remote machine handles this directory.',
        'overlay.newTitle': 'New remote workspace',
        'overlay.newSubtitle': 'Save a remote directory on an SSH host, then open it here or from the new-session row.',
        'overlay.empty': 'No remote workspaces yet. Create one first.',
        'overlay.new': 'New workspace',
        'overlay.open': 'Open session',
        'overlay.connecting': 'Starting remote dsh…',
        'overlay.opening': 'Opening the remote UI…',
        'overlay.source': 'Start from an existing workspace',
        'overlay.sourceNone': 'Do not copy; fill in manually',
        'overlay.reuseSecret': 'When the host and port match, its saved secret is reused.',
        'overlay.saveOpen': 'Save and open',
        'overlay.save': 'Save only',
        'overlay.manage': 'Manage all',
        'overlay.back': 'Back to list',
        'overlay.close': 'Close',
        'overlay.note': 'The remote dsh UI opens embedded in the main panel; local workspaces and their session list stay unchanged.',
        'overlay.lastOpened': 'Last opened',
        'overlay.never': 'Never opened',
        'overlay.needTarget': 'Enter an SSH target and a remote directory.',
        'embed.back': 'Back to workspaces',
        'embed.title': 'Remote session',
        'embed.select': 'Switch workspace',
        'embed.reload': 'Reload',
        'embed.browser': 'Open in browser',
        'embed.disconnect': 'Disconnect',
        'embed.loading': 'Loading the remote dsh UI…',
        'embed.waiting': 'Starting remote dsh…',
        'embed.missingUrl': 'The remote dsh is not ready.',
        'embed.notFound': 'This remote workspace no longer exists.',
        'embed.frameError': 'The embedded remote UI failed to load; open it in the browser instead.',
        'embed.embeddedHint': 'The remote UI is embedded in this panel; if it stays blank, use Open in browser.',
      },
    }

    const CSS = `
.rs-page { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); }
.rs-scroll { flex:1; min-height:0; overflow:auto; }
.rs-wrap { max-width:980px; margin:0 auto; padding:28px 24px 56px; box-sizing:border-box; }
.rs-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:18px; }
.rs-head-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.rs-title { margin:0; font-size:22px; line-height:1.25; font-weight:600; letter-spacing:-0.01em; }
.rs-sub { margin:6px 0 0; font-size:13px; line-height:1.55; color:var(--dsw-alias-label-secondary); max-width:640px; }
.rs-btn { font:inherit; font-size:12px; line-height:1.2; height:30px; padding:0 11px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-primary); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; }
.rs-btn:hover:enabled { background:var(--dsw-alias-bg-layer-2); }
.rs-btn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.rs-btn:disabled { opacity:.5; cursor:default; }
.rs-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.rs-btn-primary:hover:enabled { background:var(--dsw-alias-brand-primary); filter:brightness(1.06); }
.rs-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.rs-btn-ghost { border-color:transparent; color:var(--dsw-alias-label-secondary); }
.rs-list { display:flex; flex-direction:column; gap:12px; }
.rs-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:16px; }
.rs-card-head { display:flex; align-items:flex-start; gap:12px; }
.rs-dot { width:9px; height:9px; border-radius:50%; margin-top:7px; flex:none; background:var(--dsw-alias-state-idle-primary); }
.rs-dot-ready { background:var(--dsw-alias-state-success-primary); }
.rs-dot-error { background:var(--dsw-alias-state-error-primary); }
.rs-dot-busy { background:var(--dsw-alias-state-warn-primary); animation:rs-pulse 1.2s ease-in-out infinite; }
@keyframes rs-pulse { 0%,100%{ opacity:.35 } 50%{ opacity:1 } }
.rs-card-body { flex:1; min-width:0; }
.rs-name { font-size:14px; font-weight:600; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.rs-target { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; color:var(--dsw-alias-label-secondary); font-weight:400; }
.rs-meta { margin-top:5px; font-size:12px; color:var(--dsw-alias-label-secondary); display:flex; gap:10px; flex-wrap:wrap; line-height:1.5; }
.rs-meta code, .rs-url code, .rs-error-detail, .rs-hint code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11.5px; }
.rs-badge { font-size:11px; line-height:1.4; padding:1px 8px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); white-space:nowrap; font-weight:500; }
.rs-badge-ready { color:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); }
.rs-badge-error { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.rs-badge-busy { color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-primary); }
.rs-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; align-items:center; }
.rs-error { margin-top:12px; padding:10px 12px; border:1px solid var(--dsw-alias-state-error-primary); border-radius:8px; font-size:12px; line-height:1.55; }
.rs-error-title { font-weight:600; color:var(--dsw-alias-state-error-primary); }
.rs-error-detail { display:block; margin-top:5px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; word-break:break-word; max-height:140px; overflow:auto; }
.rs-hint { margin-top:8px; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.55; }
.rs-hint p { margin:0 0 6px; }
.rs-hint code { display:inline-block; margin:2px 0 8px; padding:3px 7px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-base); }
.rs-url { margin-top:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px 10px; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; }
.rs-url code { flex:1; min-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary); }
.rs-logs { margin:12px 0 0; padding:10px; max-height:260px; overflow:auto; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
.rs-log-line { display:flex; gap:8px; }
.rs-log-time { color:var(--dsw-alias-state-idle-primary); flex:none; }
.rs-log-error { color:var(--dsw-alias-state-error-primary); }
.rs-log-info { color:var(--dsw-alias-label-primary); }
.rs-log-remote, .rs-log-ssh { color:var(--dsw-alias-label-secondary); }
.rs-empty { padding:52px 20px; text-align:center; border:1px dashed var(--dsw-alias-border-l2); border-radius:12px; color:var(--dsw-alias-label-secondary); }
.rs-empty-title { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary); }
.rs-empty-body { margin:8px auto 16px; max-width:520px; font-size:12.5px; line-height:1.6; }
.rs-alert { margin-bottom:12px; padding:10px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); font-size:12px; line-height:1.55; display:flex; gap:10px; align-items:flex-start; }
.rs-alert-warn { border-color:var(--dsw-alias-state-warn-primary); }
.rs-alert-error { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }
.rs-alert-body { flex:1; }
.rs-editor { margin-bottom:12px; }
.rs-editor-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
.rs-editor-title { margin:0; font-size:15px; font-weight:600; }
.rs-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.rs-field { display:flex; flex-direction:column; gap:5px; min-width:0; }
.rs-field-wide { grid-column:1 / -1; }
.rs-label { font-size:12px; font-weight:600; }
.rs-help { font-size:11px; line-height:1.5; color:var(--dsw-alias-label-secondary); }
.rs-input, .rs-select { box-sizing:border-box; width:100%; min-height:32px; padding:6px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12.5px; }
.rs-input:focus, .rs-select:focus { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:0; border-color:transparent; }
.rs-input::placeholder { color:var(--dsw-alias-state-idle-primary); }
.rs-check { display:flex; align-items:center; gap:8px; font-size:12px; margin-top:4px; }
.rs-check input { accent-color:var(--dsw-alias-brand-primary); }
.rs-advanced { margin-top:14px; border-top:1px solid var(--dsw-alias-border-l1); padding-top:12px; }
.rs-advanced summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary); margin-bottom:12px; }
.rs-footer { margin-top:26px; padding-top:14px; border-top:1px solid var(--dsw-alias-border-l1); font-size:11px; line-height:1.6; color:var(--dsw-alias-label-secondary); }
.rs-toast { position:fixed; right:20px; bottom:20px; z-index:20; max-width:420px; padding:10px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-overlay); box-shadow:0 8px 24px rgba(0,0,0,.18); font-size:12px; line-height:1.5; color:var(--dsw-alias-label-primary); }
.rs-toast code { display:block; margin-top:4px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; word-break:break-word; }
.rs-spin { width:12px; height:12px; border-radius:50%; border:2px solid var(--dsw-alias-border-l2); border-top-color:var(--dsw-alias-brand-primary); animation:rs-spin .8s linear infinite; }
@keyframes rs-spin { to { transform:rotate(360deg) } }
.rs-hero-btn { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 9px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.rs-hero-btn:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.rs-hero-btn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.rs-footer-action { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px; border-radius:8px; border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.rs-footer-action:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.rs-footer-action:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.rs-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:flex-start; justify-content:center; padding:min(10vh,96px) 16px 24px; background:rgba(0,0,0,.5); overflow:auto; pointer-events:auto; }
.rs-modal { width:min(760px,100%); max-height:82vh; display:flex; flex-direction:column; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:14px; box-shadow:0 24px 64px rgba(0,0,0,.35); overflow:hidden; }
.rs-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 20px 12px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.rs-modal-title { margin:0; font-size:17px; line-height:1.3; font-weight:600; }
.rs-modal-sub { margin:5px 0 0; font-size:12px; line-height:1.55; color:var(--dsw-alias-label-secondary); max-width:560px; }
.rs-modal-body { padding:16px 20px; overflow:auto; }
.rs-modal-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-top:1px solid var(--dsw-alias-border-l1); flex-wrap:wrap; }
.rs-modal-note { font-size:11px; line-height:1.55; color:var(--dsw-alias-label-secondary); }
.rs-pick-list { display:flex; flex-direction:column; gap:8px; }
.rs-pick-item { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-base); }
.rs-pick-main { flex:1; min-width:0; }
.rs-pick-name { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; font-size:13px; font-weight:600; }
.rs-pick-meta { margin-top:3px; font-size:11.5px; line-height:1.5; color:var(--dsw-alias-label-secondary); display:flex; gap:8px; flex-wrap:wrap; }
.rs-pick-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.rs-overlay-empty { padding:34px 16px; text-align:center; border:1px dashed var(--dsw-alias-border-l2); border-radius:10px; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.6; }
.rs-source-row { margin-bottom:12px; }
.rs-mirror-banner { display:flex; align-items:center; gap:8px; margin:0 12px 8px; padding:6px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary); font-size:11.5px; line-height:1.45; }
.rs-mirror-banner strong { color:var(--dsw-alias-label-primary); font-weight:600; }
.rs-embed-page { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); }
.rs-embed-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px; border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); flex:none; }
.rs-embed-heading { min-width:0; max-width:min(420px,40vw); }
.rs-embed-title { display:flex; align-items:center; gap:7px; min-width:0; font-size:13px; font-weight:600; }
.rs-embed-title .rs-dot { margin-top:0; }
.rs-embed-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rs-embed-path { margin-top:2px; font-size:11px; line-height:1.4; color:var(--dsw-alias-label-secondary); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rs-embed-spacer { flex:1; }
.rs-embed-select { width:auto; max-width:260px; min-height:28px; height:28px; padding:2px 8px; font-size:12px; }
.rs-embed-banner { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 12px; border-bottom:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:1.5; background:var(--dsw-alias-bg-layer-1); flex:none; }
.rs-embed-banner code { color:var(--dsw-alias-label-secondary); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; max-height:48px; overflow:auto; }
.rs-embed-body { position:relative; flex:1; min-height:0; display:flex; background:var(--dsw-alias-bg-base); }
.rs-embed-frame { display:block; width:100%; height:100%; border:0; background:#fff; }
.rs-embed-loading { position:absolute; inset:0; z-index:1; display:flex; align-items:center; justify-content:center; gap:8px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-secondary); font-size:12px; }
.rs-embed-error { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:32px; text-align:center; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-secondary); font-size:12.5px; line-height:1.6; }
.rs-embed-error p { margin:0; max-width:520px; }
.rs-embed-foot { flex:none; padding:4px 12px; border-top:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.5; }
@media (max-width:700px) { .rs-grid{ grid-template-columns:1fr } .rs-head{ flex-direction:column } .rs-head-actions{ justify-content:flex-start } .rs-wrap{ padding:20px 14px 40px } .rs-overlay{ padding:12px } .rs-modal{ max-height:92vh } .rs-embed-heading{ max-width:100% } .rs-embed-select{ max-width:100% } }
`

    function useLocaleRevision(ctx) {
      const [, setRevision] = useState(0)
      useEffect(() => {
        if (typeof ctx.locale?.subscribe !== 'function') return undefined
        return ctx.locale.subscribe(() => setRevision((value) => value + 1))
      }, [ctx])
    }

    function statusKind(phase) {
      if (phase === 'ready') return 'ready'
      if (phase === 'error') return 'error'
      if (phase === 'connecting' || phase === 'probing' || phase === 'launching' || phase === 'installing' || phase === 'disconnecting') return 'busy'
      return 'idle'
    }

    function isBusyPhase(phase) {
      return phase === 'connecting' || phase === 'probing' || phase === 'launching' || phase === 'installing' || phase === 'disconnecting'
    }

    function errorText(t, error) {
      const code = typeof error?.code === 'string' ? error.code : 'unknown'
      const key = 'error.' + code
      const text = t(key)
      return text === key ? t('error.unknown') : text
    }

    function maskAddress(value) {
      return String(value ?? '').replace(/([?&](?:token|access_token)=)[^&#]*/gi, '$1••••')
    }

    async function callApi(name, body = {}) {
      let response
      try {
        response = await fetch('/api/remote-ssh/' + name, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
        })
      } catch (error) {
        const failure = new Error(error instanceof Error ? error.message : String(error))
        failure.code = 'api-unreachable'
        throw failure
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        const failure = new Error('HTTP ' + response.status)
        failure.code = 'bad-response'
        throw failure
      }
      if (!payload || payload.ok !== true) {
        const failure = new Error(payload?.error?.message || 'HTTP ' + response.status)
        failure.code = payload?.error?.code || 'unknown'
        failure.detail = payload?.error?.detail || null
        throw failure
      }
      return payload
    }

    function workspaceTime(workspace) {
      const raw = workspace?.lastOpenedAt || workspace?.lastUsedAt || workspace?.createdAt
      const value = raw ? Date.parse(raw) : NaN
      return Number.isFinite(value) ? value : 0
    }

    function sortWorkspaces(list) {
      return [...(list || [])].sort((a, b) => workspaceTime(b) - workspaceTime(a))
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    async function openRemoteUrl(url, id) {
      if (!url) {
        const error = new Error('The remote URL is not ready')
        error.code = 'not-ready'
        throw error
      }
      let opened = null
      try {
        opened = window.open(url, '_blank')
      } catch {
        opened = null
      }
      if (opened) {
        try {
          opened.opener = null
        } catch {
          // cross-origin windows may reject the assignment
        }
        callApi('markOpened', { id }).catch(() => {})
        return
      }
      await callApi('open', { id })
    }

    let overlayRequest = null
    const overlayListeners = new Set()

    function notifyOverlay() {
      for (const listener of overlayListeners) listener()
    }

    function openRemoteOverlay(mode = 'pick', options = {}) {
      overlayRequest = { mode, ...options, nonce: Date.now() }
      notifyOverlay()
    }

    function closeRemoteOverlay() {
      overlayRequest = null
      notifyOverlay()
    }

    function useOverlayRequest() {
      const [, setTick] = useState(0)
      useEffect(() => {
        const listener = () => setTick((value) => value + 1)
        overlayListeners.add(listener)
        return () => overlayListeners.delete(listener)
      }, [])
      return overlayRequest
    }

    let activeRemote = null
    const activeRemoteListeners = new Set()

    function setActiveRemote(value) {
      activeRemote = value
      for (const listener of activeRemoteListeners) listener()
    }

    function useActiveRemote() {
      const [, setTick] = useState(0)
      useEffect(() => {
        const listener = () => setTick((value) => value + 1)
        activeRemoteListeners.add(listener)
        return () => activeRemoteListeners.delete(listener)
      }, [])
      return activeRemote
    }

    async function activateEmbedded(ctx, workspace) {
      if (!workspace || !workspace.id) throw new Error('missing workspace id')
      const result = await callApi('proxy', { id: workspace.id })
      if (typeof result.url !== 'string' || result.url === '') {
        const failure = new Error('The host did not return an embedded workspace URL')
        failure.code = 'bad-response'
        throw failure
      }
      setActiveRemote({
        id: workspace.id,
        name: workspace.name || workspace.id,
        url: result.url,
        pending: false,
        error: null,
      })
      callApi('markOpened', { id: workspace.id }).catch(() => {})
      if (ctx && typeof ctx.layout?.selectPanel === 'function') ctx.layout.selectPanel('remote-ssh')
    }

    function useWorkspaceList(active, intervalMs = 2000) {
      const [snapshot, setSnapshot] = useState(null)
      const [error, setError] = useState(null)
      const refresh = useCallback(async (quiet = false) => {
        try {
          const data = await callApi('list')
          setSnapshot({
            connections: Array.isArray(data.connections) ? data.connections : [],
            sshAvailable: data.sshAvailable !== false,
            credentialsAvailable: data.credentialsAvailable !== false,
          })
          setError(null)
        } catch (failure) {
          if (!quiet) setError(failure)
        }
      }, [])
      useEffect(() => {
        if (!active) return undefined
        let alive = true
        let first = true
        const load = async () => {
          if (!alive) return
          await refresh(!first)
          first = false
        }
        load()
        const timer = setInterval(load, intervalMs)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [active, intervalMs, refresh])
      return { snapshot, error, refresh }
    }

    function Styles() {
      return h('style', null, CSS)
    }

    function CloudIcon({ size = 14 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', { d: 'M7 18h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.2 9.4 4.3 4.3 0 0 0 7 18Z' }),
      h('path', { d: 'M9 14l2 2 4-4' }),
      )
    }

    function CloudPlusIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', { d: 'M6.5 18h8a4 4 0 0 0 .55-7.96A5.5 5.5 0 0 0 5.7 9.4 4.3 4.3 0 0 0 6.5 18Z' }),
      h('path', { d: 'M17.5 15.5v5M15 18h5' }),
      )
    }

    function blankDraft() {
      return {
        id: '',
        name: '',
        target: '',
        port: '',
        identityFile: '',
        remotePath: '~',
        dshCommand: '',
        secret: '',
        clearSecret: false,
        hasSecret: false,
      }
    }

    function draftFrom(connection) {
      return {
        id: connection.id,
        name: connection.name,
        target: connection.target,
        port: connection.port === null || connection.port === undefined ? '' : String(connection.port),
        identityFile: connection.identityFile || '',
        remotePath: connection.remotePath || '~',
        dshCommand: connection.dshCommand || '',
        secret: '',
        clearSecret: false,
        hasSecret: Boolean(connection.hasSecret),
      }
    }

    function draftFromTemplate(connection) {
      return {
        ...draftFrom(connection),
        id: '',
        name: connection.name,
        remotePath: '',
        secret: '',
        clearSecret: false,
      }
    }

    function Field({ label, help, wide, children }) {
      return h('label', { className: 'rs-field' + (wide ? ' rs-field-wide' : '') },
        h('span', { className: 'rs-label' }, label),
        children,
        help ? h('span', { className: 'rs-help' }, help) : null,
      )
    }

    function FullPage({ ctx, t }) {
      useLocaleRevision(ctx)
      const [snapshot, setSnapshot] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [busy, setBusy] = useState({})
      const [editing, setEditing] = useState(null)
      const [logsFor, setLogsFor] = useState(null)
      const [logs, setLogs] = useState([])
      const [notice, setNotice] = useState(null)
      const [reloadKey, setReloadKey] = useState(0)
      const activeEmbedded = useActiveRemote()
      const proxyPendingRef = useRef(null)
      const noticeTimer = useRef(null)
      const logsRef = useRef(null)
      const nameRef = useRef(null)

      const refresh = useCallback(async (quiet = false) => {
        try {
          const data = await callApi('list')
          setSnapshot({
            connections: Array.isArray(data.connections) ? data.connections : [],
            sshAvailable: data.sshAvailable !== false,
            credentialsAvailable: data.credentialsAvailable !== false,
          })
          setLoadError(null)
        } catch (error) {
          if (!quiet) setLoadError(error)
        }
      }, [])

      const showNotice = useCallback((text, detail) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        setNotice({ text, detail: detail || null })
        noticeTimer.current = setTimeout(() => setNotice(null), 5000)
      }, [])

      useEffect(() => {
        let alive = true
        let first = true
        const load = async () => {
          if (!alive) return
          await refresh(!first)
          first = false
        }
        load()
        const timer = setInterval(load, 2000)
        return () => {
          alive = false
          clearInterval(timer)
          if (noticeTimer.current) clearTimeout(noticeTimer.current)
        }
      }, [refresh])

      useEffect(() => {
        if (!logsFor) return undefined
        let alive = true
        const load = async () => {
          try {
            const data = await callApi('logs', { id: logsFor })
            if (alive) setLogs(Array.isArray(data.lines) ? data.lines : [])
          } catch {
            // keep the previous log view while the host reconnects
          }
        }
        load()
        const timer = setInterval(load, 1000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [logsFor])

      useEffect(() => {
        const node = logsRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [logs])

      useEffect(() => {
        if (editing && nameRef.current) nameRef.current.focus()
      }, [editing?.isNew, editing?.draft?.id])

      const connections = sortWorkspaces(snapshot?.connections)
      const activeItem = activeEmbedded ? connections.find((item) => item.id === activeEmbedded.id) : undefined
      const markBusy = (id, value) => setBusy((current) => ({ ...current, [id]: value }))

      useEffect(() => {
        if (!activeEmbedded || activeEmbedded.url || activeEmbedded.error) return
        if (!activeItem) return
        if (activeItem.phase === 'ready' && activeItem.url) {
          if (proxyPendingRef.current === activeEmbedded.id) return
          proxyPendingRef.current = activeEmbedded.id
          void activateEmbedded(ctx, activeItem)
            .catch((failure) => {
              setActiveRemote((current) => current && current.id === activeEmbedded.id
                ? {
                  ...current,
                  pending: false,
                  error: { code: failure.code || 'proxy-failed', message: failure.message, detail: failure.detail ?? null },
                }
                : current)
            })
            .finally(() => {
              if (proxyPendingRef.current === activeEmbedded.id) proxyPendingRef.current = null
            })
          return
        }
        if (activeItem.phase === 'error' && activeItem.error) {
          setActiveRemote({
            ...activeEmbedded,
            pending: false,
            error: activeItem.error,
          })
        }
      }, [activeEmbedded, activeItem, ctx])

      const startNew = () => {
        setEditing({ draft: blankDraft(), isNew: true, error: null })
        setLogsFor(null)
      }

      const startEdit = (connection) => {
        setEditing({ draft: draftFrom(connection), isNew: false, error: null })
      }

      const updateDraft = (key, value) => {
        setEditing((current) => current
          ? { ...current, draft: { ...current.draft, [key]: value }, error: null }
          : current)
      }

      const validateDraft = (draft) => {
        if (!String(draft.target || '').trim()) {
          const error = new Error(t('error.target-required'))
          error.code = 'target-required'
          throw error
        }
        if (String(draft.port || '').trim() !== '') {
          const port = Number(draft.port)
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            const error = new Error(t('error.port-invalid'))
            error.code = 'port-invalid'
            throw error
          }
        }
      }

      const saveDraft = async () => {
        if (!editing) return
        const draft = editing.draft
        try {
          validateDraft(draft)
          markBusy('editor', 'save')
          const payload = {
            id: draft.id || undefined,
            name: draft.name,
            target: draft.target,
            port: draft.port,
            identityFile: draft.identityFile,
            remotePath: draft.remotePath || '~',
            dshCommand: draft.dshCommand,
          }
          if (draft.secret) payload.secret = draft.secret
          if (draft.clearSecret) payload.clearSecret = true
          await callApi('save', payload)
          setEditing(null)
          await refresh(true)
          showNotice(t('saved'))
        } catch (error) {
          setEditing((current) => current ? { ...current, error } : current)
        } finally {
          markBusy('editor', null)
        }
      }

      const connect = async (connection) => {
        markBusy(connection.id, 'connect')
        try {
          await callApi('connect', { id: connection.id })
          await refresh(true)
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const disconnect = async (connection) => {
        markBusy(connection.id, 'disconnect')
        try {
          await callApi('disconnect', { id: connection.id })
          await refresh(true)
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const install = async (connection) => {
        if (!window.confirm(t('install.confirm'))) return
        markBusy(connection.id, 'install')
        try {
          await callApi('install', { id: connection.id })
          setLogsFor(connection.id)
          await refresh(true)
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const mirror = async (connection) => {
        markBusy(connection.id, 'mirror')
        try {
          const result = await callApi('mirror', { id: connection.id })
          await refresh(true)
          if (!result.scanned) {
            showNotice(t('mirror.none'))
            return
          }
          const failed = Array.isArray(result.failures) ? result.failures.length : 0
          showNotice(
            t('mirror.done', { mirrored: result.mirrored ?? 0, skipped: result.skipped ?? 0 }),
            failed > 0 ? `${t('mirror.failed', { failed })} ${result.failures?.[0]?.message ?? ''}`.trim() : null,
          )
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const createAgentWorkspace = async (connection) => {
        const defaultPath = typeof connection.remotePath === 'string' && connection.remotePath.startsWith('/')
          ? connection.remotePath
          : '/root/data'
        const picked = window.prompt(t('agentWorkspace.pathPrompt'), defaultPath)
        if (picked === null) return
        const remotePath = picked.trim()
        if (remotePath === '') return
        markBusy(connection.id, 'agent-workspace')
        try {
          const result = await callApi('agentWorkspace', { id: connection.id, remotePath })
          await refresh(true)
          showNotice(t('agentWorkspace.done', { title: result.title }))
          const workspace = ctx.uiWorkspace
          if (typeof workspace?.openWorkspace === 'function') {
            await workspace.openWorkspace(result.workspaceId).catch((error) => {
              showNotice(t('agentWorkspace.failed'), error instanceof Error ? error.message : String(error))
            })
          }
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const remove = async (connection) => {
        if (!window.confirm(t('delete.confirm', { name: connection.name }))) return
        markBusy(connection.id, 'delete')
        try {
          await callApi('remove', { id: connection.id })
          if (logsFor === connection.id) setLogsFor(null)
          if (activeEmbedded?.id === connection.id) setActiveRemote(null)
          await refresh(true)
          showNotice(t('deleted'))
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        } finally {
          markBusy(connection.id, null)
        }
      }

      const activateById = async (id) => {
        const item = connections.find((candidate) => candidate.id === id)
        if (!item) return
        if (item.phase === 'ready' && item.url) {
          setActiveRemote({ id: item.id, name: item.name, url: null, pending: true, error: null })
          proxyPendingRef.current = item.id
          try {
            await activateEmbedded(ctx, item)
            await refresh(true)
          } catch (error) {
            setActiveRemote({
              id: item.id,
              name: item.name,
              url: null,
              pending: false,
              error: { code: error.code || 'proxy-failed', message: error.message, detail: error.detail ?? null },
            })
          } finally {
            if (proxyPendingRef.current === item.id) proxyPendingRef.current = null
          }
          return
        }
        setActiveRemote({ id: item.id, name: item.name, url: null, pending: true, error: null })
        try {
          await callApi('connect', { id: item.id })
        } catch (error) {
          setActiveRemote({
            id: item.id,
            name: item.name,
            url: null,
            pending: false,
            error: { code: error.code || 'unknown', message: error.message, detail: error.detail ?? null },
          })
        }
      }

      const openRemote = (connection) => {
        if (!connection.url) return
        void activateById(connection.id)
      }

      const retryActive = async () => {
        if (!activeEmbedded) return
        setActiveRemote({ ...activeEmbedded, url: null, pending: true, error: null })
        try {
          await callApi('connect', { id: activeEmbedded.id })
        } catch (error) {
          setActiveRemote({
            ...activeEmbedded,
            url: null,
            pending: false,
            error: { code: error.code || 'unknown', message: error.message, detail: error.detail ?? null },
          })
        }
      }

      const disconnectActive = async () => {
        if (!activeItem) {
          setActiveRemote(null)
          return
        }
        await disconnect(activeItem)
        setActiveRemote(null)
      }

      const openActiveInBrowser = async () => {
        if (!activeItem?.url) return
        try {
          await openRemoteUrl(activeItem.url, activeItem.id)
          await refresh(true)
        } catch (error) {
          showNotice(errorText(t, error), error.detail)
        }
      }

      const copyUrl = async (connection) => {
        if (!connection.url) return
        try {
          await navigator.clipboard.writeText(connection.url)
          showNotice(t('copied'))
        } catch {
          window.prompt(t('copyManual'), connection.url)
        }
      }

      const toggleLogs = (connection) => {
        setLogsFor((current) => current === connection.id ? null : connection.id)
        setLogs([])
      }

      const editor = editing ? h('section', { className: 'rs-card rs-editor', 'aria-label': editing.isNew ? t('new') : t('edit') },
        h('div', { className: 'rs-editor-head' },
          h('h2', { className: 'rs-editor-title' }, editing.isNew ? t('new') : t('edit')),
          h('button', { type: 'button', className: 'rs-btn rs-btn-ghost', onClick: () => setEditing(null) }, t('action.cancel')),
        ),
        editing.error ? h('div', { className: 'rs-alert rs-alert-error', role: 'alert' },
          h('div', { className: 'rs-alert-body' },
            h('div', null, errorText(t, editing.error)),
            editing.error.detail ? h('code', { className: 'rs-error-detail' }, editing.error.detail) : null,
          ),
        ) : null,
        h('div', { className: 'rs-grid' },
          h(Field, { label: t('field.name') },
            h('input', {
              ref: nameRef,
              className: 'rs-input',
              value: editing.draft.name,
              placeholder: t('field.namePlaceholder'),
              onChange: (event) => updateDraft('name', event.target.value),
              spellCheck: false,
            }),
          ),
          h(Field, { label: t('field.target'), help: t('field.targetHelp'), wide: false },
            h('input', {
              className: 'rs-input',
              value: editing.draft.target,
              placeholder: t('field.targetPlaceholder'),
              onChange: (event) => updateDraft('target', event.target.value),
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
            }),
          ),
          h(Field, { label: t('field.remotePath'), help: t('field.remotePathHelp'), wide: true },
            h('input', {
              className: 'rs-input',
              value: editing.draft.remotePath,
              placeholder: t('field.remotePathPlaceholder'),
              onChange: (event) => updateDraft('remotePath', event.target.value),
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
            }),
          ),
        ),
        h('details', { className: 'rs-advanced' },
          h('summary', null, t('advanced')),
          h('div', { className: 'rs-grid' },
            h(Field, { label: t('field.port') },
              h('input', {
                className: 'rs-input',
                value: editing.draft.port,
                placeholder: t('field.portPlaceholder'),
                inputMode: 'numeric',
                onChange: (event) => updateDraft('port', event.target.value),
              }),
            ),
            h(Field, { label: t('field.identityFile') },
              h('input', {
                className: 'rs-input',
                value: editing.draft.identityFile,
                placeholder: t('field.identityFilePlaceholder'),
                onChange: (event) => updateDraft('identityFile', event.target.value),
                spellCheck: false,
              }),
            ),
            h(Field, { label: t('field.dshCommand'), help: t('field.dshCommandHelp'), wide: true },
              h('input', {
                className: 'rs-input',
                value: editing.draft.dshCommand,
                placeholder: t('field.dshCommandPlaceholder'),
                onChange: (event) => updateDraft('dshCommand', event.target.value),
                spellCheck: false,
              }),
            ),
            h(Field, { label: t('field.secret'), help: t('field.secretHelp'), wide: true },
              h('input', {
                className: 'rs-input',
                type: 'password',
                value: editing.draft.secret,
                placeholder: editing.draft.hasSecret ? t('field.secretPlaceholder') : '',
                autoComplete: 'new-password',
                onChange: (event) => updateDraft('secret', event.target.value),
              }),
            ),
          ),
          editing.draft.hasSecret ? h('label', { className: 'rs-check' },
            h('input', {
              type: 'checkbox',
              checked: editing.draft.clearSecret,
              onChange: (event) => updateDraft('clearSecret', event.target.checked),
            }),
            t('field.clearSecret'),
          ) : null,
        ),
        h('div', { className: 'rs-actions' },
          h('button', {
            type: 'button',
            className: 'rs-btn rs-btn-primary',
            disabled: Boolean(busy.editor),
            onClick: saveDraft,
          }, busy.editor === 'save' ? h('span', { className: 'rs-spin' }) : null, t('action.save')),
          h('button', { type: 'button', className: 'rs-btn', onClick: () => setEditing(null) }, t('action.cancel')),
        ),
      ) : null

      const connectionCard = (connection) => {
        const kind = statusKind(connection.phase)
        const isBusy = isBusyPhase(connection.phase) || Boolean(busy[connection.id])
        const showInstall = connection.error?.code === 'dsh-missing'
        return h('article', { className: 'rs-card', key: connection.id },
          h('div', { className: 'rs-card-head' },
            h('span', { className: 'rs-dot rs-dot-' + kind, 'aria-hidden': true }),
            h('div', { className: 'rs-card-body' },
              h('div', { className: 'rs-name' },
                h('span', null, connection.name),
                h('span', { className: 'rs-target' }, connection.target + (connection.port ? ':' + connection.port : '')),
                h('span', { className: 'rs-badge rs-badge-' + kind }, t('status.' + connection.phase)),
              ),
              h('div', { className: 'rs-meta' },
                h('span', null, t('meta.workspace') + ': ', h('code', null, connection.remotePath)),
                connection.info
                  ? h('span', null, `${connection.info.user || '?'}@${connection.info.hostname || '?'} · ${connection.info.os || '?'}/${connection.info.arch || '?'}`)
                  : null,
                connection.info?.dshVersion ? h('span', null, 'dsh ' + connection.info.dshVersion) : null,
                h('span', null, t('info.lastOpened') + ': ' + ((connection.lastOpenedAt || connection.lastUsedAt) ? new Date(connection.lastOpenedAt || connection.lastUsedAt).toLocaleString() : t('info.never'))),
              ),
            ),
          ),
          h('div', { className: 'rs-actions' },
            connection.phase === 'ready'
              ? h('button', { type: 'button', className: 'rs-btn', onClick: () => disconnect(connection) }, t('action.disconnect'))
              : h('button', {
                type: 'button',
                className: 'rs-btn rs-btn-primary',
                disabled: isBusy || connection.phase === 'ready',
                onClick: () => connect(connection),
              }, isBusy && connection.phase !== 'ready' ? h('span', { className: 'rs-spin' }) : null, t('action.connect')),
            connection.url
              ? h('button', { type: 'button', className: 'rs-btn', onClick: () => copyUrl(connection) }, t('action.copy'))
              : null,
            isBusyPhase(connection.phase) && connection.phase !== 'installing'
              ? h('button', { type: 'button', className: 'rs-btn', onClick: () => disconnect(connection) }, t('action.disconnect'))
              : null,
            h('button', { type: 'button', className: 'rs-btn', onClick: () => toggleLogs(connection) }, logsFor === connection.id ? t('action.hideLogs') : t('action.logs')),
            h('button', {
              type: 'button',
              className: 'rs-btn',
              disabled: Boolean(busy[connection.id]) || isBusy,
              onClick: () => { void mirror(connection) },
            }, busy[connection.id] === 'mirror' ? t('mirror.busy') : t('action.mirror')),
            h('button', {
              type: 'button',
              className: 'rs-btn',
              disabled: Boolean(busy[connection.id]) || isBusy,
              onClick: () => { void createAgentWorkspace(connection) },
            }, busy[connection.id] === 'agent-workspace' ? t('action.agentWorkspace') : t('action.agentWorkspace')),
            h('button', { type: 'button', className: 'rs-btn', disabled: isBusy, onClick: () => openRemoteOverlay('new', { sourceId: connection.id }) }, t('action.newWorkspaceHere')),
            h('button', { type: 'button', className: 'rs-btn', disabled: isBusy, onClick: () => startEdit(connection) }, t('action.edit')),
            h('button', { type: 'button', className: 'rs-btn rs-btn-danger', disabled: Boolean(busy[connection.id]) || isBusy, onClick: () => remove(connection) }, t('action.delete')),
          ),
          connection.error ? h('div', { className: 'rs-error', role: 'alert' },
            h('div', { className: 'rs-error-title' }, errorText(t, connection.error)),
            connection.error.detail ? h('code', { className: 'rs-error-detail' }, connection.error.detail) : null,
            connection.error.code === 'auth-failed' || connection.error.code === 'host-key-changed'
              ? h('p', { className: 'rs-hint' }, t('hint.auth'))
              : null,
            showInstall ? h('div', { className: 'rs-hint' },
              h('p', null, t('install.hint')),
              h('code', null, 'npm install -g @deepseek-ai/dsh'),
              connection.info?.npm
                ? h('div', { className: 'rs-actions' },
                  h('button', { type: 'button', className: 'rs-btn', disabled: isBusy, onClick: () => install(connection) }, t('action.install')),
                )
                : h('p', null, t('error.npm-missing')),
            ) : null,
            connection.error.code === 'path-missing'
              ? h('p', { className: 'rs-hint' }, t('hint.pathMissing'))
              : null,
          ) : null,
          connection.url ? h('div', null,
            h('div', { className: 'rs-url' },
              h('code', { title: connection.maskedUrl || '' }, connection.maskedUrl || maskAddress(connection.url)),
              h('button', { type: 'button', className: 'rs-btn rs-btn-primary', onClick: () => openRemote(connection) }, t('action.open')),
              h('button', { type: 'button', className: 'rs-btn', onClick: () => copyUrl(connection) }, t('action.copy')),
            ),
            h('p', { className: 'rs-hint' }, t('hint.open')),
          ) : null,
          logsFor === connection.id ? h('pre', { className: 'rs-logs', ref: logsRef },
            logs.length === 0
              ? h('span', { className: 'rs-help' }, t('logs.empty'))
              : logs.map((line, index) => h('div', { key: index, className: 'rs-log-line' },
                h('span', { className: 'rs-log-time' }, new Date(line.time).toLocaleTimeString()),
                h('span', { className: 'rs-log-' + (line.stream || 'info') }, line.text),
              )),
          ) : null,
        )
      }

      if (snapshot === null) {
        return h('section', { className: 'rs-page' },
          h(Styles),
          h('div', { className: 'rs-scroll' },
            h('div', { className: 'rs-wrap' },
              h('div', { className: 'rs-empty' },
                h('span', { className: 'rs-spin', style: { display: 'inline-block', marginRight: 8 } }),
                t('loading'),
              ),
            ),
          ),
        )
      }

      if (activeEmbedded) {
        return h('section', { className: 'rs-page' },
          h(EmbeddedView, {
            t,
            active: activeEmbedded,
            activeItem,
            connections,
            reloadKey,
            onBack: () => setActiveRemote(null),
            onSelect: (id) => { void activateById(id) },
            onReload: () => setReloadKey((value) => value + 1),
            onBrowser: () => { void openActiveInBrowser() },
            onDisconnect: () => { void disconnectActive() },
            onRetry: () => { void retryActive() },
          }),
          notice ? h('div', { className: 'rs-toast', role: 'status' },
            h('span', null, notice.text),
            notice.detail ? h('code', null, notice.detail) : null,
          ) : null,
        )
      }

      return h('section', { className: 'rs-page' },
        h(Styles),
        h('div', { className: 'rs-scroll' },
          h('div', { className: 'rs-wrap' },
            h('header', { className: 'rs-head', 'data-window-drag': true },
              h('div', null,
                h('h1', { className: 'rs-title' }, t('title')),
                h('p', { className: 'rs-sub' }, t('subtitle')),
              ),
              h('div', { className: 'rs-head-actions' },
                h('button', { type: 'button', className: 'rs-btn', onClick: () => refresh(false) }, t('refresh')),
                h('button', { type: 'button', className: 'rs-btn rs-btn-primary', onClick: startNew }, t('new')),
              ),
            ),
            loadError ? h('div', { className: 'rs-alert rs-alert-error', role: 'alert' },
              h('div', { className: 'rs-alert-body' }, errorText(t, loadError)),
              h('button', { type: 'button', className: 'rs-btn', onClick: () => refresh(false) }, t('action.retry')),
            ) : null,
            !snapshot.sshAvailable ? h('div', { className: 'rs-alert rs-alert-warn', role: 'alert' },
              h('div', { className: 'rs-alert-body' }, t('sshMissing')),
            ) : null,
            !snapshot.credentialsAvailable ? h('div', { className: 'rs-alert rs-alert-warn', role: 'alert' },
              h('div', { className: 'rs-alert-body' }, t('credentialsMissing')),
            ) : null,
            editor,
            connections.length === 0
              ? h('div', { className: 'rs-empty' },
                h('div', { className: 'rs-empty-title' }, t('empty.title')),
                h('p', { className: 'rs-empty-body' }, t('empty.body')),
                h('button', { type: 'button', className: 'rs-btn rs-btn-primary', onClick: startNew }, t('empty.action')),
              )
              : h('div', { className: 'rs-list' }, connections.map(connectionCard)),
            h('footer', { className: 'rs-footer' }, t('footer')),
          ),
        ),
        notice ? h('div', { className: 'rs-toast', role: 'status' },
          h('span', null, notice.text),
          notice.detail ? h('code', null, notice.detail) : null,
        ) : null,
      )
    }

    function MirrorNotice({ ctx, t, sessionId }) {
      useLocaleRevision(ctx)
      const [mirrorIds, setMirrorIds] = useState([])
      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const data = await callApi('list')
            if (alive) setMirrorIds(Array.isArray(data.mirrorSessionIds) ? data.mirrorSessionIds : [])
          } catch {
            // keep the last known mirror set
          }
        }
        load()
        const timer = setInterval(load, 5000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])
      if (!sessionId || !mirrorIds.includes(sessionId)) return null
      return h('div', { className: 'rs-mirror-banner', role: 'status' },
        h(Styles),
        h('strong', null, t('mirror.badge')),
        h('span', null, t('mirror.notice')),
      )
    }

    function HeroRemoteButton({ ctx, t }) {
      useLocaleRevision(ctx)
      return h(React.Fragment, null,
        h(Styles),
        h('button', {
          type: 'button',
          className: 'rs-hero-btn',
          title: t('hero.title'),
          'aria-label': t('hero.title'),
          onClick: () => openRemoteOverlay('pick'),
        },
        h(CloudIcon, { size: 14 }),
        h('span', null, t('hero.label')),
        ),
      )
    }

    function SidebarRemoteAction({ ctx, t, wide = false }) {
      useLocaleRevision(ctx)
      return h(React.Fragment, null,
        h(Styles),
        h('button', {
          type: 'button',
          className: 'rs-footer-action',
          title: t('sidebar.newWorkspace'),
          'aria-label': t('sidebar.newWorkspace'),
          onClick: () => openRemoteOverlay('new'),
        },
        h(CloudPlusIcon, { size: 16 }),
        wide ? h('span', null, t('sidebar.newWorkspace')) : null,
        ),
      )
    }

    function MirrorIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M3 3.25h10a1.25 1.25 0 0 1 1.25 1.25v6.5A1.25 1.25 0 0 1 13 12.25H8l-3.25 2v-2H3A1.25 1.25 0 0 1 1.75 11V4.5A1.25 1.25 0 0 1 3 3.25Z',
        stroke: 'currentColor',
        strokeWidth: '1.2',
        strokeLinejoin: 'round',
      }))
    }

    function MirrorOpenAction({ ctx, t, wide = false }) {
      useLocaleRevision(ctx)
      const [mirrorIds, setMirrorIds] = useState([])
      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const data = await callApi('list')
            if (alive) setMirrorIds(Array.isArray(data.mirrorSessionIds) ? data.mirrorSessionIds : [])
          } catch {
            // leave the action hidden when the Host is unavailable
          }
        }
        load()
        const timer = setInterval(load, 10000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])
      if (mirrorIds.length === 0) return null
      const open = () => {
        const workspace = ctx.uiWorkspace
        if (typeof workspace?.openSession !== 'function') return
        workspace.openSession(mirrorIds[0])
      }
      return h(React.Fragment, null,
        h(Styles),
        h('button', {
          type: 'button',
          className: 'rs-footer-action',
          title: t('mirror.openHint'),
          'aria-label': t('mirror.openHint'),
          onClick: open,
        },
        h(MirrorIcon, { size: 16 }),
        wide ? h('span', null, t('mirror.open')) : null,
        ),
      )
    }

    function RemoteOverlay({ ctx, t }) {
      useLocaleRevision(ctx)
      const request = useOverlayRequest()
      const active = Boolean(request)
      const { snapshot, error: listError, refresh } = useWorkspaceList(active)
      const [mode, setMode] = useState('pick')
      const [draft, setDraft] = useState(blankDraft)
      const [sourceId, setSourceId] = useState('')
      const [error, setError] = useState(null)
      const [formError, setFormError] = useState(null)
      const [saving, setSaving] = useState(false)
      const [openingId, setOpeningId] = useState(null)
      const tokenRef = useRef(0)
      const prefilledRef = useRef(false)
      const nameRef = useRef(null)

      const connections = sortWorkspaces(snapshot?.connections)

      useEffect(() => {
        if (!request) return
        tokenRef.current += 1
        prefilledRef.current = false
        setMode(request.mode === 'new' ? 'new' : 'pick')
        setError(null)
        setFormError(null)
        setSaving(false)
        setOpeningId(null)
        setSourceId(typeof request.sourceId === 'string' ? request.sourceId : '')
        setDraft(blankDraft())
        if (request.mode === 'new') {
          setTimeout(() => {
            if (nameRef.current) nameRef.current.focus()
          }, 30)
        }
      }, [request?.nonce])

      useEffect(() => {
        if (!request) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closeRemoteOverlay()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [request])

      useEffect(() => {
        if (!request || mode !== 'new' || !sourceId || prefilledRef.current) return
        const item = connections.find((candidate) => candidate.id === sourceId)
        if (!item) return
        prefilledRef.current = true
        setDraft(draftFromTemplate(item))
      }, [connections, mode, request, sourceId])

      if (!request) return null

      const updateDraft = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }))
        setFormError(null)
        if (key === 'target' || key === 'port' || key === 'identityFile') setSourceId('')
      }

      const chooseSource = (id) => {
        setSourceId(id)
        setFormError(null)
        setError(null)
        const item = connections.find((candidate) => candidate.id === id)
        if (item) {
          setDraft(draftFromTemplate(item))
          prefilledRef.current = true
        } else {
          prefilledRef.current = false
        }
      }

      const switchMode = (next) => {
        setMode(next)
        setError(null)
        setFormError(null)
        if (next === 'new') {
          setDraft(blankDraft())
          setSourceId('')
          prefilledRef.current = false
          setTimeout(() => {
            if (nameRef.current) nameRef.current.focus()
          }, 30)
        }
      }

      const validateDraft = () => {
        if (!String(draft.target || '').trim() || !String(draft.remotePath || '').trim()) {
          const failure = new Error(t('overlay.needTarget'))
          failure.code = 'form'
          throw failure
        }
        if (String(draft.port || '').trim() !== '') {
          const port = Number(draft.port)
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            const failure = new Error(t('error.port-invalid'))
            failure.code = 'form'
            throw failure
          }
        }
      }

      const connectAndOpen = async (id, token) => {
        setOpeningId(id)
        setError(null)
        try {
          let data = await callApi('list')
          let item = (data.connections || []).find((candidate) => candidate.id === id)
          if (item?.phase === 'ready' && item.url) {
            if (token === tokenRef.current) {
              await activateEmbedded(ctx, { id, name: item.name, url: item.url })
              closeRemoteOverlay()
            }
            return
          }
          await callApi('connect', { id })
          for (let attempt = 0; attempt < 160; attempt += 1) {
            await sleep(1000)
            if (token !== tokenRef.current || !overlayRequest) return
            data = await callApi('list')
            item = (data.connections || []).find((candidate) => candidate.id === id)
            if (item?.phase === 'ready' && item.url) {
              if (token === tokenRef.current) {
                await activateEmbedded(ctx, { id, name: item.name, url: item.url })
                closeRemoteOverlay()
              }
              return
            }
            if (item?.phase === 'error') {
              const remote = item.error || {}
              const failure = new Error(remote.message || 'Remote dsh failed')
              failure.code = remote.code || 'unknown'
              failure.detail = remote.detail || null
              throw failure
            }
          }
          const failure = new Error('Timed out waiting for remote dsh')
          failure.code = 'launch-timeout'
          throw failure
        } catch (failure) {
          if (token === tokenRef.current) setError(failure)
        } finally {
          if (token === tokenRef.current) setOpeningId(null)
        }
      }

      const openExisting = (item) => {
        setError(null)
        if (item.phase === 'ready' && item.url) {
          void activateEmbedded(ctx, item)
            .then(() => closeRemoteOverlay())
            .catch((failure) => setError(failure))
          return
        }
        void connectAndOpen(item.id, tokenRef.current)
      }

      const saveWorkspace = async (andOpen) => {
        setFormError(null)
        setError(null)
        setSaving(true)
        const token = tokenRef.current
        try {
          validateDraft()
          const payload = {
            name: draft.name,
            target: draft.target,
            remotePath: draft.remotePath,
            port: draft.port,
            identityFile: draft.identityFile,
            dshCommand: draft.dshCommand,
          }
          if (draft.secret) payload.secret = draft.secret
          if (sourceId) payload.copySecretFrom = sourceId
          const saved = await callApi('save', payload)
          await refresh(true)
          const id = saved.host?.id
          if (!id) {
            const failure = new Error('The host did not return the saved workspace id')
            failure.code = 'bad-response'
            throw failure
          }
          if (andOpen) {
            await connectAndOpen(id, token)
          } else if (token === tokenRef.current) {
            await refresh(true)
            setMode('pick')
          }
        } catch (failure) {
          if (token === tokenRef.current) setFormError(failure)
        } finally {
          if (token === tokenRef.current) setSaving(false)
        }
      }

      const busy = Boolean(openingId) || saving
      const title = mode === 'new' ? t('overlay.newTitle') : t('overlay.pickTitle')
      const subtitle = mode === 'new' ? t('overlay.newSubtitle') : t('overlay.pickSubtitle')
      const sourceItem = sourceId ? connections.find((candidate) => candidate.id === sourceId) : null

      const picker = mode === 'pick'
        ? (connections.length === 0
          ? h('div', { className: 'rs-overlay-empty' }, t('overlay.empty'))
          : h('div', { className: 'rs-pick-list' }, connections.map((item) => {
            const kind = statusKind(item.phase)
            const opening = openingId === item.id
            const lastOpened = item.lastOpenedAt || item.lastUsedAt
            return h('div', { className: 'rs-pick-item', key: item.id },
              h('span', { className: 'rs-dot rs-dot-' + kind, 'aria-hidden': true }),
              h('div', { className: 'rs-pick-main' },
                h('div', { className: 'rs-pick-name' },
                  h('span', null, item.name),
                  h('span', { className: 'rs-badge rs-badge-' + kind }, opening ? t('overlay.connecting') : t('status.' + item.phase)),
                ),
                h('div', { className: 'rs-pick-meta' },
                  h('span', null, item.target + (item.port ? ':' + item.port : '')),
                  h('code', null, item.remotePath),
                  h('span', null, t('overlay.lastOpened') + ': ' + (lastOpened ? new Date(lastOpened).toLocaleString() : t('overlay.never'))),
                ),
                item.error
                  ? h('div', { className: 'rs-pick-meta' },
                    h('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, errorText(t, item.error)),
                  )
                  : null,
              ),
              h('div', { className: 'rs-pick-actions' },
                h('button', {
                  type: 'button',
                  className: 'rs-btn rs-btn-primary',
                  disabled: busy || opening,
                  onClick: () => openExisting(item),
                }, opening ? h('span', { className: 'rs-spin' }) : null, opening ? t('overlay.connecting') : t('overlay.open')),
              ),
            )
          })))
        : h('div', null,
          sourceItem && sourceItem.hasSecret && !draft.secret
            ? h('p', { className: 'rs-help', style: { marginTop: 0 } }, t('overlay.reuseSecret'))
            : null,
          connections.length > 0
            ? h('div', { className: 'rs-source-row' },
              h(Field, { label: t('overlay.source') },
                h('select', {
                  className: 'rs-select',
                  value: sourceId,
                  onChange: (event) => chooseSource(event.target.value),
                },
                h('option', { value: '' }, t('overlay.sourceNone')),
                connections.map((item) => h('option', { key: item.id, value: item.id }, item.name + ' · ' + item.target + ':' + item.remotePath)),
                ),
              ),
            )
            : null,
          h('div', { className: 'rs-grid' },
            h(Field, { label: t('field.name') },
              h('input', {
                ref: nameRef,
                className: 'rs-input',
                value: draft.name,
                placeholder: t('field.namePlaceholder'),
                onChange: (event) => updateDraft('name', event.target.value),
                spellCheck: false,
              }),
            ),
            h(Field, { label: t('field.target'), help: t('field.targetHelp') },
              h('input', {
                className: 'rs-input',
                value: draft.target,
                placeholder: t('field.targetPlaceholder'),
                onChange: (event) => updateDraft('target', event.target.value),
                spellCheck: false,
                autoCapitalize: 'off',
                autoCorrect: 'off',
              }),
            ),
            h(Field, { label: t('field.remotePath'), help: t('field.remotePathHelp'), wide: true },
              h('input', {
                className: 'rs-input',
                value: draft.remotePath,
                placeholder: t('field.remotePathPlaceholder'),
                onChange: (event) => updateDraft('remotePath', event.target.value),
                spellCheck: false,
                autoCapitalize: 'off',
                autoCorrect: 'off',
              }),
            ),
          ),
          h('details', { className: 'rs-advanced' },
            h('summary', null, t('advanced')),
            h('div', { className: 'rs-grid' },
              h(Field, { label: t('field.port') },
                h('input', {
                  className: 'rs-input',
                  value: draft.port,
                  placeholder: t('field.portPlaceholder'),
                  inputMode: 'numeric',
                  onChange: (event) => updateDraft('port', event.target.value),
                }),
              ),
              h(Field, { label: t('field.identityFile') },
                h('input', {
                  className: 'rs-input',
                  value: draft.identityFile,
                  placeholder: t('field.identityFilePlaceholder'),
                  onChange: (event) => updateDraft('identityFile', event.target.value),
                  spellCheck: false,
                }),
              ),
              h(Field, { label: t('field.dshCommand'), help: t('field.dshCommandHelp'), wide: true },
                h('input', {
                  className: 'rs-input',
                  value: draft.dshCommand,
                  placeholder: t('field.dshCommandPlaceholder'),
                  onChange: (event) => updateDraft('dshCommand', event.target.value),
                  spellCheck: false,
                }),
              ),
              h(Field, { label: t('field.secret'), help: t('field.secretHelp'), wide: true },
                h('input', {
                  className: 'rs-input',
                  type: 'password',
                  value: draft.secret,
                  placeholder: sourceItem?.hasSecret ? t('field.secretPlaceholder') : '',
                  autoComplete: 'new-password',
                  onChange: (event) => updateDraft('secret', event.target.value),
                }),
              ),
            ),
          ),
        )

      const errorBlock = error || listError || formError
        ? h('div', { className: 'rs-error', role: 'alert' },
          h('div', { className: 'rs-error-title' },
            formError?.code === 'form' ? formError.message : errorText(t, formError || error || listError),
          ),
          (formError || error || listError)?.detail
            ? h('code', { className: 'rs-error-detail' }, (formError || error || listError).detail)
            : null,
        )
        : null

      return h('div', {
        className: 'rs-overlay',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) closeRemoteOverlay()
        },
      },
      h(Styles),
      h('div', {
        className: 'rs-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onMouseDown: (event) => event.stopPropagation(),
      },
      h('div', { className: 'rs-modal-head' },
        h('div', null,
          h('h2', { className: 'rs-modal-title' }, title),
          h('p', { className: 'rs-modal-sub' }, subtitle),
        ),
        h('button', { type: 'button', className: 'rs-btn rs-btn-ghost', onClick: closeRemoteOverlay }, t('overlay.close')),
      ),
      h('div', { className: 'rs-modal-body' },
        errorBlock,
        picker,
      ),
      h('div', { className: 'rs-modal-foot' },
        h('div', { className: 'rs-modal-note' }, t('overlay.note')),
        h('div', { className: 'rs-actions', style: { marginTop: 0 } },
          mode === 'pick'
            ? h('button', { type: 'button', className: 'rs-btn rs-btn-primary', disabled: busy, onClick: () => switchMode('new') }, t('overlay.new'))
            : h('button', { type: 'button', className: 'rs-btn', disabled: saving, onClick: () => switchMode('pick') }, t('overlay.back')),
          mode === 'new'
            ? h('button', {
              type: 'button',
              className: 'rs-btn',
              disabled: saving,
              onClick: () => { void saveWorkspace(false) },
            }, t('overlay.save'))
            : null,
          mode === 'new'
            ? h('button', {
              type: 'button',
              className: 'rs-btn rs-btn-primary',
              disabled: saving,
              onClick: () => { void saveWorkspace(true) },
            }, saving ? h('span', { className: 'rs-spin' }) : null, t('overlay.saveOpen'))
            : null,
        ),
      ),
      ),
      )
    }

    function EmbeddedView({ t, active, activeItem, connections, reloadKey, onBack, onSelect, onReload, onBrowser, onDisconnect, onRetry }) {
      const [loaded, setLoaded] = useState(false)
      const [frameError, setFrameError] = useState(false)
      const url = active?.url || ''
      const phase = activeItem?.phase || (active?.pending ? 'launching' : 'idle')
      const kind = statusKind(phase)

      useEffect(() => {
        setLoaded(false)
        setFrameError(false)
      }, [url, reloadKey])

      useEffect(() => {
        if (!url || loaded || frameError) return undefined
        const timer = setTimeout(() => setFrameError(true), 20000)
        return () => clearTimeout(timer)
      }, [url, loaded, frameError])

      if (!active) return null

      const title = activeItem?.name || active?.name || t('embed.title')
      const remotePath = activeItem?.remotePath || ''

      return h('div', { className: 'rs-embed-page' },
        h(Styles),
        h('div', { className: 'rs-embed-bar' },
          h('button', { type: 'button', className: 'rs-btn', onClick: onBack }, '← ' + t('embed.back')),
          h('div', { className: 'rs-embed-heading' },
            h('div', { className: 'rs-embed-title', title },
              h('span', { className: 'rs-dot rs-dot-' + kind, 'aria-hidden': true }),
              h('span', { className: 'rs-embed-name' }, title),
              h('span', { className: 'rs-badge rs-badge-' + kind }, t('status.' + phase)),
            ),
            remotePath ? h('div', { className: 'rs-embed-path', title: remotePath }, remotePath) : null,
          ),
          h('div', { className: 'rs-embed-spacer' }),
          connections.length > 1
            ? h('select', {
              className: 'rs-select rs-embed-select',
              value: active.id,
              'aria-label': t('embed.select'),
              title: t('embed.select'),
              onChange: (event) => onSelect(event.target.value),
            }, connections.map((item) => h('option', { key: item.id, value: item.id }, item.name + ' · ' + item.target + ':' + item.remotePath)))
            : null,
          h('button', { type: 'button', className: 'rs-btn', disabled: !url, onClick: onReload }, t('embed.reload')),
          h('button', { type: 'button', className: 'rs-btn', disabled: !activeItem?.url, onClick: onBrowser }, t('embed.browser')),
          activeItem && phase !== 'idle' && phase !== 'error'
            ? h('button', { type: 'button', className: 'rs-btn', onClick: onDisconnect }, t('embed.disconnect'))
            : null,
        ),
        activeItem?.error
          ? h('div', { className: 'rs-embed-banner', role: 'alert' },
            h('span', null, errorText(t, activeItem.error)),
            activeItem.error.detail ? h('code', null, activeItem.error.detail) : null,
            h('button', { type: 'button', className: 'rs-btn', onClick: onRetry }, t('action.retry')),
          )
          : null,
        h('div', { className: 'rs-embed-body' },
          url
            ? h(React.Fragment, null,
              h('iframe', {
                key: url + ':' + reloadKey,
                className: 'rs-embed-frame',
                src: url,
                title: t('embed.title') + ': ' + title,
                allow: 'clipboard-read; clipboard-write; fullscreen; microphone',
                referrerPolicy: 'no-referrer',
                onLoad: () => setLoaded(true),
                onError: () => setFrameError(true),
              }),
              !loaded && !frameError
                ? h('div', { className: 'rs-embed-loading' },
                  h('span', { className: 'rs-spin' }),
                  t('embed.loading'),
                )
                : null,
              frameError
                ? h('div', { className: 'rs-embed-error' },
                  h('p', null, t('embed.frameError')),
                  h('button', { type: 'button', className: 'rs-btn rs-btn-primary', onClick: onBrowser }, t('embed.browser')),
                )
                : null,
            )
            : h('div', { className: 'rs-embed-error' },
              activeItem
                ? h(React.Fragment, null,
                  h('span', { className: 'rs-spin' }),
                  h('p', null, active?.pending ? t('embed.waiting') : t('embed.missingUrl')),
                  h('button', { type: 'button', className: 'rs-btn', onClick: onRetry }, t('action.retry')),
                )
                : h(React.Fragment, null,
                  h('p', null, t('embed.notFound')),
                  h('button', { type: 'button', className: 'rs-btn', onClick: onBack }, t('embed.back')),
                ),
            ),
        ),
        h('div', { className: 'rs-embed-foot' }, t('embed.embeddedHint')),
      )
    }

    function FilesIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 2 : 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.85 },
      },
      h('path', { d: 'M3.5 6.5h5l2 2h10v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' }),
      h('path', { d: 'M3.5 9h17' }),
      )
    }

    function formatBytes(value) {
      const size = Number(value)
      if (!Number.isFinite(size) || size < 0) return ''
      if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
      if (size >= 1024) return (size / 1024).toFixed(1) + ' KB'
      return size + ' B'
    }

    function renderTablePreview(preview) {
      const delimiter = /\.csv$/i.test(preview.path) ? ',' : '\t'
      const rawLines = (preview.text || '').split(/\r?\n/)
      while (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') rawLines.pop()
      if (rawLines.length === 0) return h('div', { className: 'rs-hint' }, '—')
      const header = rawLines[0].split(delimiter)
      const rows = rawLines.slice(1).map((line) => line.split(delimiter))
      const cellStyle = {
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        verticalAlign: 'top',
      }
      return h('div', { style: { overflow: 'auto', maxHeight: 'calc(100vh - 360px)' } },
        h('table', { style: { borderCollapse: 'collapse', fontSize: 12, minWidth: 'max-content' } },
          h('thead', null, h('tr', null, header.map((cell, index) => h('th', {
            key: index,
            style: {
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'var(--dsw-alias-bg-layer-1)',
              borderBottom: '1px solid var(--dsw-alias-border-l2)',
              padding: '4px 8px',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              fontWeight: 600,
            },
          }, cell || ' ')))),
          h('tbody', null, rows.map((row, rowIndex) => h('tr', { key: rowIndex },
            header.map((_, columnIndex) => h('td', { key: columnIndex, style: cellStyle }, row[columnIndex] ?? '')),
          ))),
        ),
      )
    }

    function RemoteFilesPanel({ ctx, t }) {
      const [workspaces, setWorkspaces] = useState([])
      const [workspaceId, setWorkspaceId] = useState(null)
      const [root, setRoot] = useState('')
      const [path, setPath] = useState('')
      const [search, setSearch] = useState('')
      const [listing, setListing] = useState(null)
      const [preview, setPreview] = useState(null)
      const [loading, setLoading] = useState(false)
      const [loadingMore, setLoadingMore] = useState(false)
      const [editing, setEditing] = useState(false)
      const [editText, setEditText] = useState('')
      const [editVersion, setEditVersion] = useState('')
      const [saving, setSaving] = useState(false)
      const [saved, setSaved] = useState(false)
      const [downloading, setDownloading] = useState(false)
      const [downloadProgress, setDownloadProgress] = useState(0)
      const [downloaded, setDownloaded] = useState(false)
      const downloadControllerRef = useRef(null)
      const [error, setError] = useState(null)

      useEffect(() => () => downloadControllerRef.current?.abort(), [])

      const loadDir = useCallback(async (id, target) => {
        if (!id) return
        setLoading(true)
        setError(null)
        setPreview(null)
        setEditing(false)
        setSaved(false)
        setSearch('')
        try {
          const result = await callApi('filesList', { workspaceId: id, path: target })
          setListing(result)
          setPath(result.path)
          if (!root) setRoot(result.remotePath)
        } catch (failure) {
          setError(failure)
        } finally {
          setLoading(false)
        }
      }, [root])

      useEffect(() => {
        let live = true
        callApi('agentWorkspaces')
          .then((payload) => {
            if (!live) return
            const list = Array.isArray(payload?.workspaces) ? payload.workspaces : []
            setWorkspaces(list)
            if (list[0]) {
              setWorkspaceId(list[0].workspaceId)
              setRoot(list[0].remotePath)
              void loadDir(list[0].workspaceId, list[0].remotePath)
            }
          })
          .catch((failure) => { if (live) setError(failure) })
        return () => { live = false }
      }, [loadDir])

      const openEntry = async (entry) => {
        if (entry.type === 'directory') {
          await loadDir(workspaceId, entry.path)
          return
        }
        setLoading(true)
        setError(null)
        setEditing(false)
        setSaved(false)
        try {
          const file = await callApi('filesRead', { workspaceId, path: entry.path, offset: 0, limit: 200 })
          setPreview({ ...file, offset: 0, nextOffset: 200, lastPageFull: file.lines >= 200 })
        } catch (failure) {
          setError(failure)
        } finally {
          setLoading(false)
        }
      }

      const loadMore = async () => {
        if (!preview || preview.binary || loadingMore) return
        setLoadingMore(true)
        setError(null)
        try {
          const next = Number.isSafeInteger(preview.nextOffset) ? preview.nextOffset : preview.offset + 200
          const page = await callApi('filesRead', { workspaceId, path: preview.path, offset: next, limit: 200 })
          setPreview((current) => current ? ({
            ...page,
            offset: current.offset,
            nextOffset: next + 200,
            lines: current.lines + page.lines,
            text: current.text + (current.text && !current.text.endsWith('\n') ? '\n' : '') + page.text,
            lastPageFull: page.lines >= 200,
          }) : page)
        } catch (failure) {
          setError(failure)
        } finally {
          setLoadingMore(false)
        }
      }

      const startEdit = async () => {
        if (!preview || preview.binary) return
        if (preview.size > 256 * 1024) {
          setError(new Error(t('files.editTooLarge')))
          return
        }
        setLoading(true)
        setError(null)
        try {
          const page = await callApi('filesRead', { workspaceId, path: preview.path, offset: 0, limit: 1000 })
          if (page.binary || page.truncated || page.lines >= 1000) {
            setError(new Error(t('files.editTooLarge')))
            return
          }
          setEditing(true)
          setEditText(page.text)
          setEditVersion(page.version)
          setSaved(false)
        } catch (failure) {
          setError(failure)
        } finally {
          setLoading(false)
        }
      }

      const saveEdit = async () => {
        if (!preview || saving) return
        setSaving(true)
        setError(null)
        try {
          await callApi('filesWrite', {
            workspaceId,
            path: preview.path,
            content: editText,
            version: editVersion,
          })
          setEditing(false)
          setSaved(true)
          const file = await callApi('filesRead', { workspaceId, path: preview.path, offset: 0, limit: 200 })
          setPreview({ ...file, offset: 0, nextOffset: 200, lastPageFull: file.lines >= 200 })
        } catch (failure) {
          setError(failure)
        } finally {
          setSaving(false)
        }
      }

      const downloadFull = async () => {
        if (!preview || downloading) return
        const controller = new AbortController()
        downloadControllerRef.current = controller
        setDownloading(true)
        setDownloadProgress(0)
        setDownloaded(false)
        setError(null)
        try {
          const response = await fetch('/api/remote-ssh/filesDownload', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, path: preview.path }),
            credentials: 'same-origin',
            signal: controller.signal,
          })
          if (!response.ok) {
            let detail = null
            try {
              const payload = await response.json()
              detail = payload?.error?.message ?? null
            } catch {
              // ignore
            }
            throw new Error(detail || t('files.downloadFailed'))
          }
          const total = Number(response.headers.get('content-length')) || preview.size
          const reader = response.body?.getReader()
          if (!reader) throw new Error(t('files.downloadFailed'))
          const chunks = []
          let received = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            received += value.length
            if (total > 0) setDownloadProgress(Math.min(100, Math.round((received / total) * 100)))
          }
          const blob = new Blob(chunks)
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = preview.path.split('/').pop() || 'remote-file'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          setDownloaded(true)
          setDownloadProgress(100)
        } catch (failure) {
          if (failure?.name !== 'AbortError') setError(failure)
        } finally {
          setDownloading(false)
          downloadControllerRef.current = null
        }
      }

      const goUp = () => {
        if (!listing || listing.path === root) return
        const parent = listing.path.replace(/\/[^/]+\/?$/, '') || root
        void loadDir(workspaceId, parent.startsWith(root) ? parent : root)
      }

      const switchWorkspace = (id) => {
        const item = workspaces.find((candidate) => candidate.workspaceId === id)
        setWorkspaceId(id)
        setRoot(item?.remotePath ?? '')
        setListing(null)
        setPreview(null)
        setEditing(false)
        setSaved(false)
        void loadDir(id, item?.remotePath ?? '.')
      }

      const entries = listing?.entries ?? []
      const query = search.trim().toLowerCase()
      const visibleEntries = query === ''
        ? entries
        : entries.filter((entry) => entry.name.toLowerCase().includes(query))
      const errorText = error ? (typeof error.message === 'string' ? error.message : t('files.error')) : null
      const isTable = Boolean(preview && !preview.binary && /\.(tsv|csv)$/i.test(preview.path))

      return h('div', { className: 'rs-page' },
        h('div', { className: 'rs-wrap', style: { maxWidth: '1200px', display: 'flex', flexDirection: 'column', minHeight: 0 } },
          h('div', { className: 'rs-head', style: { paddingBottom: 12 } },
            h('div', null,
              h('h1', { className: 'rs-title' }, t('files.title')),
              h('p', { className: 'rs-sub' }, t('files.subtitle')),
            ),
            h('div', { className: 'rs-head-actions' },
              h('button', { type: 'button', className: 'rs-btn', disabled: !listing, onClick: goUp }, t('files.up')),
              h('button', { type: 'button', className: 'rs-btn', disabled: !workspaceId || loading, onClick: () => loadDir(workspaceId, path) }, t('files.refresh')),
            ),
          ),
          workspaces.length === 0
            ? h('div', { className: 'rs-empty' }, t('files.noWorkspace'))
            : h(React.Fragment, null,
              h('div', { className: 'dsh-remote-files-toolbar' },
                h('span', { className: 'rs-meta', style: { margin: 0 } }, t('files.workspace')),
                h('select', {
                  className: 'rs-select',
                  value: workspaceId ?? '',
                  onChange: (event) => switchWorkspace(event.target.value),
                  style: { maxWidth: 380, width: 'auto', minWidth: 220 },
                }, workspaces.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title))),
                h('code', { className: 'rs-target', style: { marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, path || root),
              ),
              errorText ? h('div', { className: 'rs-error', style: { marginBottom: 10 } }, errorText) : null,
              h('div', { style: { display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 14, minHeight: 0, flex: 1 } },
                h('div', { className: 'rs-card', style: { padding: 8, minHeight: 240, maxHeight: 'calc(100vh - 250px)', overflow: 'auto' } },
                  h('input', {
                    className: 'rs-input',
                    value: search,
                    onChange: (event) => setSearch(event.target.value),
                    placeholder: t('files.search'),
                    style: { marginBottom: 6 },
                  }),
                  loading && !listing
                    ? h('div', { className: 'rs-hint' }, t('files.loading'))
                    : entries.length === 0
                      ? h('div', { className: 'rs-hint' }, t('files.empty'))
                      : visibleEntries.length === 0
                        ? h('div', { className: 'rs-hint' }, t('files.noMatch'))
                        : h('div', { className: 'rs-list', style: { gap: 1 } }, visibleEntries.map((entry) => h('button', {
                          key: entry.path,
                          type: 'button',
                          className: 'dsh-remote-file-row',
                          'data-active': preview?.path === entry.path ? 'true' : undefined,
                          onClick: () => openEntry(entry),
                        },
                        h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, style: { flex: '0 0 auto', opacity: 0.7 } },
                          entry.type === 'directory'
                            ? h('path', { d: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z' })
                            : h('path', { d: 'M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5zM13 3.5V9h5' }),
                        ),
                        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
                        entry.type === 'file' && Number.isFinite(entry.size)
                          ? h('span', { className: 'dsh-remote-file-size' }, formatBytes(entry.size))
                          : entry.type === 'directory'
                            ? h('span', { className: 'dsh-remote-file-size' }, '›')
                            : null,
                        ))),
                ),
                h('div', { className: 'rs-card', style: { minHeight: 240, maxHeight: 'calc(100vh - 250px)', overflow: 'auto', padding: 12 } },
                  preview
                    ? h(React.Fragment, null,
                      h('div', { className: 'rs-meta', style: { marginTop: 0, marginBottom: 8, gap: 8, alignItems: 'center' } },
                        h('code', { className: 'rs-target' }, preview.path),
                        h('span', null, formatBytes(preview.size)),
                        h('span', null, t('files.lines').replace('{count}', String(preview.lines))),
                        isTable ? h('span', { className: 'rs-badge' }, t('files.table')) : null,
                        saved ? h('span', { className: 'rs-hint', style: { margin: 0 } }, t('files.saved')) : null,
                        downloaded ? h('span', { className: 'rs-hint', style: { margin: 0 } }, t('files.downloaded')) : null,
                        downloading
                          ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' } },
                            h('span', { className: 'rs-hint', style: { margin: 0 } }, String(downloadProgress) + '%'),
                            h('div', { style: { width: 80, height: 6, borderRadius: 3, background: 'var(--dsw-alias-bg-layer-2)', overflow: 'hidden' } },
                              h('div', { style: { width: String(downloadProgress) + '%', height: '100%', background: 'var(--dsw-alias-brand-primary)' } }),
                            ),
                            h('button', { type: 'button', className: 'rs-btn', onClick: () => downloadControllerRef.current?.abort() }, t('files.cancelDownload')),
                          )
                          : !editing
                            ? h('button', { type: 'button', className: 'rs-btn', style: { marginLeft: 'auto' }, onClick: downloadFull }, t('files.download'))
                            : null,
                        !preview.binary && !editing && preview.size <= 256 * 1024
                          ? h('button', { type: 'button', className: 'rs-btn', disabled: loading, onClick: startEdit }, t('files.edit'))
                          : null,
                        editing
                          ? h(React.Fragment, null,
                            h('button', { type: 'button', className: 'rs-btn rs-btn-primary', disabled: saving, onClick: saveEdit }, saving ? t('files.saving') : t('files.save')),
                            h('button', { type: 'button', className: 'rs-btn', disabled: saving, onClick: () => { setEditing(false); setSaved(false) } }, t('files.cancel')),
                          )
                          : null,
                      ),
                      editing
                        ? h('textarea', {
                          value: editText,
                          onChange: (event) => setEditText(event.target.value),
                          spellCheck: false,
                          style: {
                            width: '100%',
                            minHeight: 360,
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                            fontSize: 12,
                            lineHeight: 1.55,
                            padding: 10,
                            borderRadius: 8,
                            border: '1px solid var(--dsw-alias-border-l1)',
                            background: 'var(--dsw-alias-bg-base)',
                            color: 'var(--dsw-alias-label-primary)',
                          },
                        })
                        : preview.binary
                          ? h('div', { className: 'rs-hint' }, t('files.binary'))
                          : isTable
                            ? renderTablePreview(preview)
                            : h('pre', { style: { margin: 0, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--dsw-alias-label-primary)' } }, preview.text || ''),
                      preview.truncated && !editing
                        ? h('div', { className: 'rs-hint' }, t('files.truncated').replace('{count}', '200'))
                        : null,
                      !preview.binary && !editing
                        ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 } },
                          preview.lastPageFull
                            ? h('button', { type: 'button', className: 'rs-btn', disabled: loadingMore, onClick: loadMore }, loadingMore ? t('files.loadingMore') : t('files.loadMore'))
                            : h('span', { className: 'rs-hint' }, t('files.end')),
                          h('span', { className: 'rs-hint' }, t('files.loaded').replace('{count}', String(preview.lines))),
                        )
                        : null,
                    )
                    : h('div', { className: 'rs-hint' }, loading ? t('files.loading') : t('files.preview')),
                ),
              ),
            ),
        ),
      )
    }

    function PanelIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 2 : 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.85 },
      },
      h('rect', { x: 3, y: 4.5, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8 20h8M12 16.5V20' }),
      h('path', { d: 'M7 9.5l2.2 2.2L7 13.9' }),
      h('path', { d: 'M12.4 14h4.1' }),
      )
    }

    const REMOTE_PICK_PREFIX = 'C:\\__dsh_remote_ssh__\\'
    let pickerRequest = null
    let pickerResolve = null
    const pickerListeners = new Set()

    function notifyPicker() {
      for (const listener of pickerListeners) listener()
    }

    function requestRemotePick() {
      return new Promise((resolve) => {
        pickerResolve = resolve
        pickerRequest = { at: Date.now() }
        notifyPicker()
      })
    }

    function settlePicker(value) {
      const resolve = pickerResolve
      pickerResolve = null
      pickerRequest = null
      notifyPicker()
      if (resolve) resolve(value)
    }

    function encodeRemoteWorkspacePath(hostId, remotePath, mode) {
      return `${REMOTE_PICK_PREFIX}${hostId}\\${encodeURIComponent(remotePath)}\\${mode}`
    }

    function decodeRemoteWorkspacePath(value) {
      if (typeof value !== 'string') return null
      const match = /^(?:[A-Za-z]:)?[\\/]+__dsh_remote_ssh__[\\/]+([a-f0-9]{8})[\\/]+([^\\/]+)[\\/]+(standard|ptc|minimal)$/.exec(value)
      if (!match) return null
      try {
        const remotePath = decodeURIComponent(match[2])
        if (!remotePath.startsWith('/')) return null
        return { hostId: match[1], remotePath, mode: match[3] }
      } catch {
        return null
      }
    }

    function parentDirectory(path) {
      if (typeof path !== 'string' || path === '' || path === '/') return '/'
      const stripped = path.replace(/\/+$/, '')
      const index = stripped.lastIndexOf('/')
      if (index <= 0) return '/'
      return stripped.slice(0, index)
    }

    function RemoteDirectoryFlow(props) {
      const { ctx, t, open, onCancel } = props
      const [listing, setListing] = useState(null)
      const [path, setPath] = useState('')
      const [hosts, setHosts] = useState([])
      const [hostId, setHostId] = useState('')
      const [query, setQuery] = useState('')
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState(null)
      const [creating, setCreating] = useState(false)

      const loadRemote = useCallback(async (id, target) => {
        if (!id) return
        setLoading(true)
        setError(null)
        try {
          const result = await callApi('remoteDirs', { id, path: target || undefined })
          setListing(result)
          setPath(result?.path || target || '')
          setQuery('')
        } catch (failure) {
          setError(errorText(t, failure))
        } finally {
          setLoading(false)
        }
      }, [t])

      useEffect(() => {
        if (!open) return
        let alive = true
        setListing(null)
        setError(null)
        setQuery('')
        void (async () => {
          try {
            const data = await callApi('list')
            if (!alive) return
            const next = Array.isArray(data.connections) ? data.connections : []
            setHosts(next)
            const selected = next[0]?.id ?? ''
            setHostId(selected)
            if (selected) await loadRemote(selected)
          } catch (failure) {
            if (alive) setError(errorText(t, failure))
          }
        })()
        return () => { alive = false }
      }, [open, loadRemote, t])

      useEffect(() => {
        if (!open || !hostId) return
        void loadRemote(hostId)
      }, [hostId, open, loadRemote])

      if (!open) return null

      const entries = Array.isArray(listing?.entries) ? listing.entries : []
      const normalizedQuery = query.trim().toLowerCase()
      const visibleEntries = normalizedQuery === ''
        ? entries
        : entries.filter((entry) => entry.name.toLowerCase().includes(normalizedQuery))
      const parent = parentDirectory(path)
      const crumbs = (() => {
        const parts = String(path || '/').split('/').filter(Boolean)
        const result = [{ label: '/', path: '/' }]
        let current = ''
        for (const part of parts) {
          current += '/' + part
          result.push({ label: part, path: current })
        }
        return result
      })()

      const navigate = (target) => {
        if (hostId) void loadRemote(hostId, target)
      }

      const select = async () => {
        if (!hostId || !listing?.path) return
        setCreating(true)
        setError(null)
        try {
          const result = await callApi('agentWorkspace', {
            id: hostId,
            remotePath: listing.path,
          })
          onCancel?.()
          const uiWorkspace = ctx.uiWorkspace
          if (typeof uiWorkspace?.openWorkspace === 'function') {
            await uiWorkspace.openWorkspace(result.workspaceId)
          }
        } catch (failure) {
          setError(errorText(t, failure))
        } finally {
          setCreating(false)
        }
      }

      return h('div', {
        style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
        onClick: (event) => { if (event.target === event.currentTarget) onCancel?.() },
      }, h('div', {
        className: 'dsh-remote-dialog',
        style: { padding: 16 },
      },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 } },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('h3', { className: 'dsh-remote-dialog-title' }, t('flow.remoteTitle')),
          h('div', { className: 'dsh-remote-dialog-sub' }, t('flow.remoteSubtitle')),
        ),
        h('button', { type: 'button', className: 'rs-btn rs-btn-ghost', onClick: () => onCancel?.() }, t('flow.cancel')),
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8, marginBottom: 10 } },
        h('label', { className: 'rs-field' },
          h('span', { className: 'rs-label' }, t('flow.selectHost')),
          h('select', {
            className: 'rs-select',
            value: hostId,
            onChange: (event) => setHostId(event.target.value),
          }, hosts.length === 0
            ? h('option', { value: '' }, t('flow.noHost'))
            : hosts.map((item) => h('option', { key: item.id, value: item.id }, `${item.name || item.target} · ${item.target}`))),
        ),
      ),
      error ? h('div', { className: 'rs-error', style: { marginBottom: 8 } }, error) : null,
      hosts.length === 0
        ? h('div', { className: 'rs-card', style: { padding: 12, marginBottom: 10 } },
          h('div', { className: 'rs-hint', style: { marginBottom: 8 } }, t('flow.noHost')),
          h('button', {
            type: 'button',
            className: 'rs-btn',
            onClick: () => { onCancel?.(); ctx.layout?.selectPanel?.('remote-ssh') },
          }, t('flow.openSSH')),
        )
        : h(React.Fragment, null,
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' } },
            h('button', { type: 'button', className: 'rs-btn rs-btn-ghost', onClick: () => navigate(parent), disabled: path === '/' }, t('flow.up')),
            h('div', { className: 'dsh-remote-crumbs' }, crumbs.map((crumb, index) => h(React.Fragment, { key: crumb.path },
              index > 0 ? h('span', { className: 'dsh-remote-crumb-sep' }, '/') : null,
              h('button', {
                type: 'button',
                className: 'dsh-remote-crumb',
                onClick: () => navigate(crumb.path),
              }, crumb.label),
            ))),
          ),
          h('div', { style: { marginBottom: 6 } },
            h('input', {
              className: 'rs-input',
              value: query,
              onChange: (event) => setQuery(event.target.value),
              placeholder: t('flow.filter'),
            }),
          ),
          h('div', {
            style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, minHeight: 220, maxHeight: 360, overflow: 'auto', padding: 4 },
          },
          loading
            ? h('div', { className: 'rs-hint', style: { padding: 12 } }, t('flow.loading'))
            : visibleEntries.length === 0
              ? h('div', { className: 'rs-hint', style: { padding: 12 } }, normalizedQuery === '' ? t('flow.empty') : t('flow.noMatch'))
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } }, visibleEntries.map((entry) => h('button', {
                key: entry.path,
                type: 'button',
                className: 'dsh-remote-dir-row',
                title: entry.path,
                onClick: () => navigate(entry.path),
              },
              h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, style: { flex: '0 0 auto', opacity: 0.7 } },
                h('path', { d: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z' }),
              ),
              h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
              h('span', { style: { opacity: 0.45, fontSize: 16, lineHeight: 1 } }, '›'),
              ))),
          ),
          h('div', { className: 'rs-hint', style: { marginTop: 8, wordBreak: 'break-all' } }, path || '/'),
          h('div', { className: 'dsh-remote-dialog-footer', style: { margin: '12px -16px -16px', padding: '12px 16px' } },
            h('div', { className: 'rs-hint', style: { margin: 0, flex: 1, minWidth: 0 } }, t('flow.hint')),
            h('button', {
              type: 'button',
              className: 'rs-btn rs-btn-primary',
              disabled: loading || creating || !listing?.path || !hostId,
              onClick: select,
            }, creating ? t('flow.creating') : t('flow.select')),
          ),
        ),
      ))
    }

    function RemotePickerHost({ ctx, t }) {
      const [request, setRequest] = useState(pickerRequest)
      useEffect(() => {
        const listener = () => setRequest(pickerRequest)
        pickerListeners.add(listener)
        listener()
        return () => { pickerListeners.delete(listener) }
      }, [])
      if (!request) return null
      return h(RemoteDirectoryFlow, {
        ctx,
        t,
        open: true,
        remoteMode: 'path',
        listDirectory: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal),
        onPicked: (value) => settlePicker(value),
        onCancel: () => settlePicker(null),
      })
    }

    function installRemoteWorkspaceMenuItem(t) {
      if (typeof document === 'undefined' || !document.body) return () => {}
      const addPattern = /^(添加工作区|Add workspace)\s*[.…]+$/
      let scheduled = false
      const scan = () => {
        scheduled = false
        const candidates = document.querySelectorAll('button, [role="menuitem"]')
        for (const add of candidates) {
          const text = (add.textContent ?? '').trim()
          if (!addPattern.test(text)) continue
          const parent = add.parentElement
          if (!parent || parent.querySelector('[data-dsh-remote-workspace-menu]')) continue
          const row = add.cloneNode(true)
          row.removeAttribute('id')
          row.removeAttribute('aria-keyshortcuts')
          row.setAttribute('data-dsh-remote-workspace-menu', 'true')
          row.setAttribute('aria-label', t('flow.remoteMenu'))
          if (row.tagName !== 'BUTTON') {
            row.setAttribute('role', 'menuitem')
            row.setAttribute('tabindex', '0')
          } else {
            row.type = 'button'
          }
          const textNodes = []
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              return node.parentElement?.closest('svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
            },
          })
          while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim() !== '') textNodes.push(walker.currentNode)
          }
          if (textNodes.length > 0) {
            textNodes[0].nodeValue = t('flow.remoteMenu')
            for (let index = 1; index < textNodes.length; index += 1) textNodes[index].nodeValue = ''
          } else {
            row.textContent = t('flow.remoteMenu')
          }
          row.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            window.dispatchEvent(new CustomEvent('dsh-remote-workspace-open'))
            window.setTimeout(() => {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            }, 0)
          })
          row.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            row.click()
          })
          parent.insertBefore(row, add.nextSibling)
        }
      }
      const observer = new MutationObserver(() => {
        if (scheduled) return
        scheduled = true
        queueMicrotask(scan)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      scan()
      return () => observer.disconnect()
    }

    function isRemoteMirrorPath(path) {
      return typeof path === 'string'
        && /[\\/]\.dsh[\\/]remote-ssh[\\/]agent-workspaces[\\/]/i.test(path)
    }

    function remotePathForMirror(localPath, workspaces) {
      const normalized = String(localPath ?? '').replace(/\\/g, '/')
      let best = null
      for (const workspace of workspaces) {
        const root = String(workspace.path ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
        if (!root || !normalized.startsWith(`${root}/`)) continue
        if (!best || root.length > best.root.length) best = { workspace, root }
      }
      if (!best) return null
      const relative = normalized.slice(best.root.length).replace(/^\/+/, '')
      const base = String(best.workspace.remotePath ?? '').replace(/\/+$/, '')
      return {
        workspaceId: best.workspace.workspaceId,
        path: `${base}/${relative}`,
        label: best.workspace.title || `${best.workspace.target}:${best.workspace.remotePath}`,
      }
    }

    function RemoteMirrorViewer(props) {
      const { t, path } = props
      const [state, setState] = useState({ loading: true, error: null, text: '', binary: false, truncated: false, target: null, remotePath: '' })
      useEffect(() => {
        let alive = true
        void (async () => {
          setState((current) => ({ ...current, loading: true, error: null }))
          try {
            const data = await callApi('agentWorkspaces')
            const workspaces = Array.isArray(data.workspaces) ? data.workspaces : []
            const target = remotePathForMirror(path, workspaces)
            if (!target) throw new Error(t('viewer.notRemote'))
            const read = await callApi('filesRead', { workspaceId: target.workspaceId, path: target.path, offset: 0, limit: 1000 })
            if (!alive) return
            setState({
              loading: false,
              error: null,
              text: read.text ?? '',
              binary: Boolean(read.binary),
              truncated: Boolean(read.truncated) || Number(read.lines ?? 0) >= 1000,
              target: target.label,
              remotePath: target.path,
            })
          } catch (failure) {
            if (alive) setState((current) => ({ ...current, loading: false, error: errorText(t, failure) }))
          }
        })()
        return () => { alive = false }
      }, [path, t])
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto' } },
          h('span', { style: { fontWeight: 600, fontSize: 12 } }, t('viewer.remote')),
          h('code', { style: { fontSize: 11, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, state.remotePath || path),
          state.target ? h('span', { className: 'rs-badge', style: { fontSize: 10 } }, state.target) : null,
        ),
        state.loading
          ? h('div', { className: 'rs-hint', style: { padding: 12 } }, t('viewer.loading'))
          : state.error
            ? h('div', { className: 'rs-error', style: { margin: 12 } }, state.error)
            : state.binary
              ? h('div', { className: 'rs-hint', style: { padding: 12 } }, t('viewer.binary'))
              : h(React.Fragment, null,
                h('pre', {
                  style: { margin: 0, padding: 12, flex: 1, minHeight: 0, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre', tabSize: 4 },
                }, state.text),
                state.truncated
                  ? h('div', { className: 'rs-hint', style: { padding: '6px 12px', borderTop: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto' } }, t('viewer.truncated'))
                  : null,
              ),
      )
    }

    function installAddWorkspaceChooser(t) {
      if (typeof document === 'undefined' || !document.body) return () => {}
      let chooser = null
      let bypass = false
      let outside = null
      let onKey = null
      const close = () => {
        if (chooser) {
          chooser.remove()
          chooser = null
        }
        if (outside) {
          document.removeEventListener('pointerdown', outside, true)
          outside = null
        }
        if (onKey) {
          document.removeEventListener('keydown', onKey, true)
          onKey = null
        }
      }
      const item = (label, iconPath, action) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'dsh-add-chooser-item'
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', '16')
        svg.setAttribute('height', '16')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-width', '1.7')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', iconPath)
        svg.append(path)
        const text = document.createElement('span')
        text.textContent = label
        button.append(svg, text)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          close()
          action()
        })
        return button
      }
      const show = (anchor) => {
        close()
        const rect = anchor.getBoundingClientRect()
        const panel = document.createElement('div')
        panel.className = 'dsh-add-chooser'
        panel.style.cssText = 'position:fixed;z-index:1300;min-width:200px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:0 10px 30px rgba(0,0,0,.18)'
        panel.append(
          item(t('flow.addLocal'), 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z', () => {
            bypass = true
            try { anchor.click() } finally { bypass = false }
          }),
          item(t('flow.addRemote'), 'M4 6h16M4 12h16M4 18h10', () => {
            window.dispatchEvent(new CustomEvent('dsh-remote-workspace-open'))
          }),
        )
        document.body.appendChild(panel)
        const width = panel.offsetWidth || 208
        const height = panel.offsetHeight || 76
        let left = Math.min(rect.left, window.innerWidth - width - 8)
        let top = rect.bottom + 6
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
        panel.style.left = `${Math.max(8, left)}px`
        panel.style.top = `${top}px`
        chooser = panel
        outside = (event) => {
          if (panel.contains(event.target)) return
          close()
        }
        onKey = (event) => {
          if (event.key === 'Escape') close()
        }
        document.addEventListener('pointerdown', outside, true)
        document.addEventListener('keydown', onKey, true)
      }
      const onAddClick = (event) => {
        if (bypass) return
        event.preventDefault()
        event.stopImmediatePropagation()
        show(event.currentTarget)
      }
      const scan = () => {
        for (const element of document.querySelectorAll('button, [role="button"]')) {
          if (element.getAttribute('data-dsh-add-chooser') === 'true') continue
          const label = (element.getAttribute('aria-label') ?? '').trim()
          const shortcut = (element.getAttribute('aria-keyshortcuts') ?? '').toLowerCase()
          const text = (element.textContent ?? '').trim()
          if (!/^(添加工作区|Add workspace)$/i.test(label) && !shortcut.includes('control+o') && !shortcut.includes('meta+o')) continue
          if (/^(添加工作区|Add workspace)\s*[.…]+$/.test(text)) continue
          element.setAttribute('data-dsh-add-chooser', 'true')
          element.addEventListener('click', onAddClick, true)
        }
      }
      const observer = new MutationObserver(scan)
      observer.observe(document.body, { childList: true, subtree: true })
      scan()
      return () => {
        observer.disconnect()
        close()
      }
    }

    function RemoteWorkspaceHost({ ctx, t }) {
      const [open, setOpen] = useState(false)
      useEffect(() => {
        const handle = () => setOpen(true)
        window.addEventListener('dsh-remote-workspace-open', handle)
        return () => window.removeEventListener('dsh-remote-workspace-open', handle)
      }, [])
      return h(RemoteDirectoryFlow, {
        ctx,
        t,
        open,
        onCancel: () => setOpen(false),
      })
    }

    function RemoteWorkspaceLauncher({ ctx, t }) {
      const [open, setOpen] = useState(false)
      useEffect(() => {
        const handle = () => setOpen(true)
        window.addEventListener('dsh-remote-workspace-open', handle)
        return () => window.removeEventListener('dsh-remote-workspace-open', handle)
      }, [])
      const listDirectory = (path, signal) => ctx.uiWorkspace.listDirectory(path, signal)
      const onPicked = async (path) => {
        setOpen(false)
        try {
          const view = await ctx.workspaces.create({ path })
          const id = view?.id ?? view?.workspaceId
          if (id && typeof ctx.uiWorkspace.openWorkspace === 'function') await ctx.uiWorkspace.openWorkspace(id)
        } catch {
          // The owner surface reports its own create error; keep the launcher quiet.
        }
      }
      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          className: 'rs-btn rs-btn-ghost',
          title: t('flow.remoteAction'),
          onClick: () => setOpen(true),
        }, t('flow.remoteAction')),
        h(RemoteDirectoryFlow, {
          ctx,
          t,
          open,
          listDirectory,
          onPicked,
          onCancel: () => setOpen(false),
        }),
      )
    }

    function RemoteWorkspacesPage({ ctx, t }) {
      const [connections, setConnections] = useState([])
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [hostForm, setHostForm] = useState({ name: '', target: '' })
      const [sandboxLog, setSandboxLog] = useState(null)

      const refresh = useCallback(async () => {
        setLoading(true)
        try {
          const list = await callApi('list')
          setConnections(Array.isArray(list.connections) ? list.connections : [])
          setError(null)
        } catch (failure) {
          setError(errorText(t, failure))
        } finally {
          setLoading(false)
        }
      }, [t])

      useEffect(() => { void refresh() }, [refresh])

      const saveHost = async () => {
        if (hostForm.target.trim() === '') {
          setError(t('workspace.hostTarget'))
          return
        }
        try {
          await callApi('save', {
            name: hostForm.name.trim() || hostForm.target.trim(),
            target: hostForm.target.trim(),
            remotePath: '/',
          })
          setHostForm({ name: '', target: '' })
          setNotice(t('workspace.hostSaved'))
          await refresh()
        } catch (failure) {
          setError(errorText(t, failure))
        }
      }

      const removeHost = async (id) => {
        if (!window.confirm(t('workspace.remove') + '?')) return
        try {
          await callApi('remove', { id })
          await refresh()
        } catch (failure) {
          setError(errorText(t, failure))
        }
      }

      const checkSandbox = async (id) => {
        try {
          setError(null)
          setNotice(null)
          await callApi('detectSandbox', { id })
          await refresh()
        } catch (failure) {
          setError(errorText(t, failure))
        }
      }

      const openSandboxLog = async () => {
        try {
          setError(null)
          const data = await callApi('sandboxLog', { limit: 200 })
          setSandboxLog(data)
        } catch (failure) {
          setError(errorText(t, failure))
        }
      }

      return h('div', { className: 'rs-page rs-scroll' },
        h('div', { className: 'rs-wrap', style: { maxWidth: 860 } },
          h('div', { className: 'rs-head' },
            h('div', null,
              h('h1', { className: 'rs-title' }, t('workspace.hostsTitle')),
            ),
            h('div', { className: 'rs-head-actions' },
              h('button', { type: 'button', className: 'rs-btn', onClick: openSandboxLog }, t('workspace.sandboxLog')),
              h('button', { type: 'button', className: 'rs-btn', disabled: loading, onClick: refresh }, t('workspace.refresh')),
            ),
          ),
          error ? h('div', { className: 'rs-error', style: { marginBottom: 12 } }, error) : null,
          notice ? h('div', { className: 'rs-alert', style: { marginBottom: 12 } }, notice) : null,
          h('section', { className: 'rs-card', style: { marginBottom: 16 } },
            h('div', { className: 'rs-card-head' },
              h('div', { className: 'rs-card-body' },
                h('div', { className: 'rs-name' }, t('workspace.addHost')),
              ),
            ),
            h('div', { className: 'rs-grid', style: { marginTop: 12 } },
              h('label', { className: 'rs-field' },
                h('span', { className: 'rs-label' }, t('workspace.hostName')),
                h('input', {
                  className: 'rs-input',
                  placeholder: t('workspace.hostName'),
                  value: hostForm.name,
                  onChange: (event) => setHostForm((current) => ({ ...current, name: event.target.value })),
                }),
              ),
              h('label', { className: 'rs-field' },
                h('span', { className: 'rs-label' }, t('workspace.hostTarget')),
                h('input', {
                  className: 'rs-input',
                  placeholder: 'iota-sc',
                  value: hostForm.target,
                  onChange: (event) => setHostForm((current) => ({ ...current, target: event.target.value })),
                }),
              ),
            ),
            h('div', { className: 'rs-actions' },
              h('button', { type: 'button', className: 'rs-btn rs-btn-primary', onClick: saveHost, disabled: loading }, t('workspace.saveHost')),
            ),
          ),
          h('section', { className: 'rs-card', style: { padding: 12 } },
            h('div', { className: 'rs-meta', style: { margin: '0 4px 8px' } }, t('workspace.hosts')),
            connections.length === 0
              ? h('div', { className: 'rs-empty' },
                h('div', { className: 'rs-empty-title' }, t('workspace.noHost')),
              )
              : h('div', { className: 'rs-list' }, connections.map((item) => h('div', {
                key: item.id,
                className: 'dsh-remote-host-row',
              },
              h('span', { className: 'dsh-remote-host-icon' },
                h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 },
                  h('rect', { x: 3, y: 4, width: 18, height: 7, rx: 1.6 }),
                  h('rect', { x: 3, y: 13, width: 18, height: 7, rx: 1.6 }),
                  h('path', { d: 'M7 7.5h.01M7 16.5h.01' }),
                ),
              ),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'dsh-remote-host-name' }, item.name || item.target),
                h('div', { className: 'dsh-remote-host-meta' },
                  h('span', null, t('workspace.hostTarget')),
                  h('span', { className: 'dsh-remote-host-sep' }, '·'),
                  h('code', null, item.target),
                  h('span', {
                    className: item.sandbox === 'bwrap' ? 'rs-badge rs-badge-ready' : 'rs-badge',
                    title: item.sandboxReason || undefined,
                  }, item.sandbox === 'bwrap' ? t('workspace.sandboxAvailable') : t('workspace.sandboxMissing')),
                ),
                item.sandbox !== 'bwrap' && item.sandboxReason
                  ? h('div', { className: 'dsh-remote-host-reason' }, item.sandboxReason)
                  : null,
              ),
              h('button', { type: 'button', className: 'rs-btn', title: t('workspace.detectSandbox'), onClick: () => checkSandbox(item.id) }, t('workspace.detectSandbox')),
              h('button', { type: 'button', className: 'rs-btn', title: t('workspace.remove'), onClick: () => removeHost(item.id) }, '×'),
              ))),
          ),
        ),
        sandboxLog ? h('div', {
          style: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
          onClick: (event) => { if (event.target === event.currentTarget) setSandboxLog(null) },
        }, h('div', { className: 'dsh-remote-dialog', style: { width: 'min(900px,94vw)', maxHeight: '86vh', padding: 0 } },
          h('div', { className: 'dsh-remote-dialog-head' },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('h3', { className: 'dsh-remote-dialog-title' }, t('workspace.sandboxLog')),
              h('div', { className: 'dsh-remote-dialog-sub' }, sandboxLog.path),
            ),
            h('button', { type: 'button', className: 'rs-btn rs-btn-ghost', onClick: () => setSandboxLog(null) }, t('flow.cancel')),
          ),
          h('pre', {
            style: { margin: 0, padding: 16, overflow: 'auto', maxHeight: '70vh', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
          }, (sandboxLog.lines ?? []).map((line) => {
            try {
              const entry = JSON.parse(line)
              return `${entry.at}  ${entry.host}  sandbox=${entry.sandbox}  cwd=${entry.workdir}\n${entry.command}`
            } catch {
              return line
            }
          }).join('\n\n') || t('workspace.sandboxLogEmpty')),
        )) : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'remote-ssh: locale')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.setAttribute('data-dsh-remote-ssh-ui', 'true')
          tag.textContent = `${CSS}\n` + `
.dsh-remote-crumbs{display:flex;align-items:center;gap:2px;min-width:0;overflow:auto;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-remote-crumb{border:0;background:transparent;color:inherit;font:inherit;padding:2px 4px;border-radius:4px;cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-remote-crumb:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-remote-crumb-sep{opacity:.45}
.dsh-remote-dir-row{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.dsh-remote-dir-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-remote-dir-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-add-chooser-item{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.dsh-add-chooser-item:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-add-chooser-item svg{flex:0 0 auto;opacity:.7}
.dsh-remote-host-row{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:8px}
.dsh-remote-host-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-remote-host-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.dsh-remote-host-name{font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-remote-host-meta{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-remote-host-meta code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;overflow:hidden;text-overflow:ellipsis}
.dsh-remote-host-sep{opacity:.45}
.dsh-remote-host-reason{margin-top:2px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);word-break:break-word}
.dsh-remote-dialog{width:min(680px,94vw);max-height:86vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}
.dsh-remote-dialog-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-remote-dialog-title{margin:0;font-size:16px;font-weight:600;line-height:1.35}
.dsh-remote-dialog-sub{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-remote-dialog-body{padding:14px 18px;overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:0}
.dsh-remote-dialog-footer{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-remote-files-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);margin-bottom:12px}
.dsh-remote-file-row{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.dsh-remote-file-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-remote-file-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-remote-file-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2)}
.dsh-remote-file-size{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
`
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'remote-ssh: compact directory browser styles')
        ctx.effect(() => installRemoteWorkspaceMenuItem(t), 'remote-ssh: workspace menu item')
        ctx.effect(() => installAddWorkspaceChooser(t), 'remote-ssh: add workspace chooser')
        ctx.effect(() => {
          const descriptor = {
            id: 'dsh-remote-ssh:mirror-file',
            title: 'Remote SSH file',
            exts: [],
            priority: 1000,
            fetchStrategy: 'none',
            detect: (path) => isRemoteMirrorPath(path),
            component: (props) => h(RemoteMirrorViewer, { ...props, t }),
          }
          let timer = null
          const install = () => {
            const service = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : null
            if (!service || typeof service.matchFileViewer !== 'function') return false
            if (service.matchFileViewer.__dshRemoteSsh) return true
            const original = service.matchFileViewer
            const wrapped = function (path, head) {
              if (isRemoteMirrorPath(path)) return descriptor
              return original.call(this, path, head)
            }
            wrapped.__dshRemoteSsh = true
            try {
              service.matchFileViewer = wrapped
              return true
            } catch {
              return false
            }
          }
          if (!install()) {
            timer = setInterval(() => {
              if (install() && timer) {
                clearInterval(timer)
                timer = null
              }
            }, 500)
          }
          return () => {
            if (timer) clearInterval(timer)
          }
        }, 'remote-ssh: remote mirror file viewer')
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'remote-ssh',
        }, () => h(RemoteWorkspacesPage, { ctx, t })))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'remote-files',
        }, () => h(RemoteFilesPanel, { ctx, t })))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'remote-ssh',
          order: 30,
          label: () => t('title'),
        }, PanelIcon))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'remote-files',
          order: 31,
          label: () => t('files.title'),
        }, FilesIcon))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'remote-workspace-host',
          order: 1001,
        }, () => h(RemoteWorkspaceHost, { ctx, t })))
      },
    }
  },
})
