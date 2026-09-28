# pcoff

Timed shutdown command tool

## Global installation

```bash
npm install -g pcoff
```

## Usage

```bash
pcoff 1s      # 1 秒后关机
pcoff 20m     # 20 分钟后关机
pcoff 1h      # 1 小时后关机
pcoff 1h30m   # 组合单位：1 小时 30 分钟后
pcoff 90      # 纯数字按秒计
pcoff 30秒    # 中文单位也可以
```

or `pcoff`

```bash
你想多久关机？
  1. 30 秒
  2. 20 分钟
  3. 30 分钟
  4. 1 小时
  5. 2 小时
  6. 自定义
  7. 取消当前关机
  8. 退出
```

选择「自定义」后可继续输入任意时间（如 `45m`、`1h20m`、`300`）。

### 取消关机

```bash
pcoff cancel
```

或在菜单中选择「取消当前关机」。

已安排的关机由操作系统执行，退出程序、关闭窗口都不影响；只有显式取消才会生效。

## 重复安排检测

安排新的关机前，pcoff 会检查是否已存在定时关机任务：

1. **自己的记录**（`~/.pcoff/task.json`）：能显示确切的剩余时间，例如
   「当前已安排 1 小时 29 分钟 后关机（本工具于 23:01:35 设置）。要重新安排吗？(Y/N)」
2. **系统级检测（仅 Windows）**：即使任务不是本工具设置的（比如手动执行过 `shutdown -s -t 3600`），也能检测到。Windows 在已有计划关机时再次执行 `shutdown` 会返回错误码 1190，据此弹出「要取消旧任务并重新安排吗？」的询问。外来任务拿不到剩余时间，只能提示存在。

注意：电脑重启后 Windows 的关机计时器会消失。此时记录文件若还在，重新安排时系统探测会发现"其实没有旧任务"，直接按新时间安排，记录随之更新，不会误伤。

## 平台差异

| 平台          | 精度   | 权限                          | 说明                                                  |
| ------------- | ------ | ----------------------------- | ----------------------------------------------------- |
| Windows       | 秒级   | 无需管理员                    | 完整支持，含系统级检测                                |
| macOS / Linux | 分钟级 | 需要 root（`sudo pcoff ...`） | `shutdown` 命令仅支持分钟；无系统级检测，依赖记录文件 |

## 开发

```bash
npm install
npm run build   # tsc 编译到 dist/
npm test        # 冒烟测试（PCOFF_DRY_RUN=1，不会真的关机）
npm link        # 本地全局试用 pcoff 命令
```

测试钩子：`PCOFF_DRY_RUN=1` 跳过真实的 shutdown 调用；`PCOFF_HOME` 指定记录文件目录（默认 `~/.pcoff`）。

## 发布

```bash
npm login
npm publish
```

## License

MIT
