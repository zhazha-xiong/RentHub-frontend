# 本地开发环境排错与教训

> 记录「跑不起来但代码没问题」的本地环境问题。CI（Linux）复现不了的问题优先记在这里，
> 避免下次又把环境问题当成代码缺陷去改。

---

## 案例 1：Vite 起不来，`listen EACCES: permission denied ::1:5173`

**时间**：2026-11-11
**环境**：Windows 11 + Node v26.5.1 + Vite 5.4.21
**症状**：

```
> vite
error when starting dev server:
Error: listen EACCES: permission denied ::1:5173
    at Server.setupListenHandle ...
```

### 排查过程（值得复用的顺序）

1. **先排除“端口被占”**：`Get-NetTCPConnection -LocalPort 5173` → 没有任何监听记录。
   有监听 = `EADDRINUSE`；无监听但仍失败 = 权限/保留问题。
2. **查系统保留段**：`netsh interface ipv4 show excludedportrange protocol=tcp`
   → 看到 `5141–5240`，**5173 正好在区间内**。
3. **最小复现绑定**（排除 Vite、排除 IPv6 猜测）：

```js
// node test-bind.mjs
import net from 'node:net'
for (const host of ['127.0.0.1', '::1', '::', 'localhost']) {
  const s = net.createServer()
  s.once('error', (e) => console.log(host, '→', e.code))
  s.listen(5173, host, () => s.close(() => console.log(host, '→ OK')))
}
```

   结果：**四个地址全部 EACCES** → 与 IPv6 无关，是这个端口本身不可绑定。
   对照组：同一脚本换 8787 → OK，说明 Node 和权限都正常。

### 根因

Windows 的 **WinNAT**（Hyper-V / WSL2 / Docker Desktop 的虚拟网络栈）启动时会批量预留连续端口段，
注册为系统级 `excludedportrange`，由系统独占。普通进程 `bind()` 这些端口会得到
**`EACCES`（而不是 `EADDRINUSE`）**，因为根本没有 socket 在监听。

两个容易踩的点：

- 保留段是**动态**的：每次重启或 `net stop winnat / net start winnat` 都会重新计算，
  所以会出现「上周能跑、这周不能跑」，换台机器又不一样。
- `netsh ... show excludedportrange` 输出里带 `*` 的是人工添加，其余都是 WinNAT 动态保留。

**为什么 CI 永远绿**：CI 跑 Ubuntu，没有 WinNAT 这套机制。

### 解决

```powershell
# ① 换一个不在保留段的端口（最快，推荐日常用）
npm run dev -- --port 5273        # 5273 / 3000 / 8080 / 8888 / 4173 / 8787 都可用

# ② 让 Windows 重新分配保留段（管理员 PowerShell）
net stop winnat
net start winnat

# ③ 显式把 5173 从保留段里排除（管理员，若 ② 无效）
net stop winnat
netsh int ipv4 add excludedportrange protocol=tcp startport=5173 numberofports=1
net start winnat

# 查当前保留段
netsh interface ipv4 show excludedportrange protocol=tcp
```

### 教训

1. **`EACCES` ≠ 端口被占用**。`EADDRINUSE` 才是有进程在听；`EACCES` 先查保留段与权限。
2. **先做最小复现再怀疑框架**。用 10 行 `net.createServer()` 就能判定「环境 vs 代码」，
   比翻 Vite 源码、改配置、重装依赖都快。
3. **Vite 只对 `EADDRINUSE` 自动递增端口**，遇到 `EACCES` 直接退出，不会自己跳到 5273。
   所以这类问题必须手动指定端口。
4. **固定默认端口有风险**。5173 是 Vite 默认值，恰好靠近 Windows 常见保留区（5xxx），
   本地团队可以约定一个备用端口（如 5273），但**不要改仓库里的默认配置**——
   其他人机器上 5173 通常是好的。
5. **"本地挂、CI 绿"时先怀疑本地环境**：Linux CI 没有 WinNAT、没有盘符权限、没有中文路径问题。
   本次就是典型：CI 一直全绿，本地起不来。
6. **报错信息里的 `::1` 具有误导性**。`localhost` 在 Windows 上优先解析到 IPv6（`::1`），
   报错就显示 `::1:5173`，很容易被误导去关 IPv6 —— 实际四个地址都失败。

---

## 案例 2：`npm run dev` 报「'vite' 不是内部或外部命令」

**症状**：`npm run dev` 找不到 `vite`，但 `node_modules/vite/bin/vite.js` 明明存在。

**根因**：`node_modules/.bin` 目录缺失（同时缺 `node_modules/.package-lock.json`）。
说明这份 `node_modules` 不是 npm 正常安装出来的（被复制/解压过），命令入口没跟过来。

**解决**：

```powershell
npm ci     # 删掉 node_modules 按 lock 重装，重新生成 .bin 与 .package-lock.json
```

**教训**：判断依赖是否“装好”，看三样：`node_modules/.bin`、`node_modules/.package-lock.json`、
`npm ls --depth=0` 是否报 missing。只看目录里有没有包名是不够的。

---

## 案例 3：受限沙箱里 `vite build` / `vitest` / `playwright` 报 `spawn EPERM`

**根因**：Vite 加载 `vite.config.ts` 时要用 esbuild 起子进程编译配置；受限令牌禁止 spawn。

**教训**：这不是代码问题，也不是依赖问题。构建与测试交给 CI，本地只跑 `npm run dev`。
判断依据：报错栈里出现 `esbuild/lib/main.js` 的 `ensureServiceIsRunning` + `spawn EPERM`。

---

## 案例 4：未登录打开首页被踢到 `/login`

**症状**：游客访问 `/` 或 `/listings/:id` 直接跳登录页。

**根因**：`api/http.ts` 的拦截器把所有 401 当作“登录过期”，而 `auth.bootstrap()` 在未登录时
一定会收到 401。

**现状**：已知未修（E2E 里公开页也先登录以绕开）。修法见交接文档 §4.1：
按“本地有没有令牌”区分——无令牌的正常 401 交给 bootstrap 静默处理，有令牌才走 refresh→失败跳登录。

**教训**：拦截器里对 401 做统一处理前，先想清楚「未登录」和「登录过期」是不是同一件事。
