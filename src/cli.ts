#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { MAX_SECONDS, formatClock, formatDuration, formatTimeOfDay, parseDuration } from './time.js';
import { clearTask, loadActiveTask, saveTask } from './store.js';
import { abortShutdown, scheduleShutdown } from './shutdown.js';
import { Prompt } from './menu.js';
import { bold, cyan, dim, green, red, yellow } from './ui.js';

const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const HELP = `pcoff — 定时关机小工具

用法:
  pcoff                打开交互式菜单
  pcoff <时间>         指定时间后关机，例如: pcoff 30s
  pcoff cancel         取消当前已安排的定时关机

时间格式（可自由组合）:
  30s     30 秒后          20m     20 分钟后       1h      1 小时后
  1h30m   1 小时 30 分钟后  1d12h   也支持天        90      纯数字按秒计
  中文单位同样有效: 30秒 / 20分钟 / 1小时30分

选项:
  -h, --help     显示本帮助
  -v, --version  显示版本号

说明:
  · 关机计划由操作系统执行，退出本程序或关闭窗口不会取消它。
  · 取消方式: pcoff cancel，或菜单中的「取消当前关机」。
  · Windows 完整支持（秒级精度，无需管理员权限）。
  · macOS / Linux: shutdown 需要 root 权限（sudo pcoff ...），且只能按分钟安排。`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function exitGracefully(): never {
  process.stdout.write('\n已退出。已设置的定时关机仍会执行；取消请运行 pcoff cancel。\n');
  process.exit(0);
}

/** 安排成功后的提示 + 倒计时。倒计时期间 Ctrl+C 随时退出，不影响系统层面的关机。 */
async function printScheduled(seconds: number): Promise<void> {
  const fireAt = new Date(Date.now() + seconds * 1000);
  try {
    await saveTask(seconds);
  } catch (err) {
    console.log(yellow(`（记录文件写入失败，不影响已安排的关机：${err instanceof Error ? err.message : String(err)}）`));
  }
  console.log(green(`✅ 已安排在本机 ${formatTimeOfDay(fireAt)} 自动关机（${formatDuration(seconds)} 后）。`));
  console.log(dim('   关机由系统执行，关闭本窗口不影响；取消请运行 pcoff cancel。'));
  startCountdown(seconds);
}

function startCountdown(seconds: number): void {
  if (!process.stdout.isTTY) return;
  const fireAt = Date.now() + seconds * 1000;
  const timer = setInterval(() => {
    const left = Math.ceil((fireAt - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(timer);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(green('时间到，系统正在关机。'));
      process.exit(0);
    }
    process.stdout.write(`\r${dim(`剩余 ${formatClock(left)}，Ctrl+C 退出（不影响关机）`)}`);
  }, 1000);
}

/**
 * 带检测的安排流程。返回 true 表示新计划已生效（此后由倒计时接管），
 * 返回 false 表示用户选择保留旧计划。
 *
 * 检测分两层：
 * 1. 记录文件（~/.pcoff/task.json）：本工具自己设置的、尚未到期的任务，能给出剩余时间；
 * 2. Windows 系统探测：shutdown 若因错误码 1190 失败，说明系统里另有一个计划中的关机
 *    （外来任务或重启后记录失效），此时询问用户是否取消旧的再排新的。
 */
async function scheduleWithCheck(prompt: Prompt, seconds: number): Promise<boolean> {
  const own = await loadActiveTask();
  if (own) {
    const remaining = Math.ceil((Date.parse(own.fireAt) - Date.now()) / 1000);
    const replace = await prompt.confirm(
      `当前已安排 ${bold(formatDuration(remaining))} 后关机（本工具于 ${formatTimeOfDay(new Date(own.createdAt))} 设置）。要重新安排吗？`,
    );
    if (!replace) {
      console.log(dim('已保留原计划；取消请运行 pcoff cancel。'));
      return false;
    }
  }

  let res = await scheduleShutdown(seconds);
  if (res.ok) {
    await printScheduled(seconds);
    return true;
  }

  if (res.alreadyScheduled) {
    if (!own) {
      const replace = await prompt.confirm(
        '检测到系统已有一个定时关机任务（可能由其他方式设置，剩余时间未知）。要取消它并按新时间安排吗？',
      );
      if (!replace) {
        console.log(dim('已保留现有计划；取消请运行 pcoff cancel。'));
        return false;
      }
    }
    // 用户已确认替换（或旧任务就是本工具设的），先取消系统里的旧任务再排新的
    await abortShutdown();
    res = await scheduleShutdown(seconds);
    if (res.ok) {
      await printScheduled(seconds);
      return true;
    }
  }

  let message = red(`安排关机失败：${res.stderr || '未知错误'}`);
  if (process.platform !== 'win32' && /root|permission|permitt|not allowed/i.test(res.stderr)) {
    message += dim('\n（macOS/Linux 的 shutdown 需要 root 权限，可尝试：sudo pcoff ...）');
  }
  fail(message);
}

async function runCancel(): Promise<void> {
  const res = await abortShutdown();
  await clearTask();
  if (res.ok) {
    console.log(green('✅ 已取消当前定时关机。'));
  } else {
    console.log(yellow('没有需要取消的定时关机（可能不存在、电脑已重启或已执行）。'));
    if (res.stderr) console.log(dim(`  系统返回：${res.stderr}`));
  }
}

async function menuLoop(prompt: Prompt): Promise<void> {
  for (;;) {
    console.log(`\n${bold('你想多久关机？')}`);
    ['30 秒', '20 分钟', '30 分钟', '1 小时', '2 小时', '自定义', '取消当前关机', '退出'].forEach(
      (label, i) => console.log(`  ${cyan(String(i + 1))}. ${label}`),
    );
    const choice = await prompt.choose(`请选择 ${dim('[1-8]')}: `, 1, 8);
    switch (choice) {
      case 1: if (await scheduleWithCheck(prompt, 30)) return; break;
      case 2: if (await scheduleWithCheck(prompt, 20 * 60)) return; break;
      case 3: if (await scheduleWithCheck(prompt, 30 * 60)) return; break;
      case 4: if (await scheduleWithCheck(prompt, 60 * 60)) return; break;
      case 5: if (await scheduleWithCheck(prompt, 2 * 60 * 60)) return; break;
      case 6: if (await scheduleWithCheck(prompt, await prompt.askDuration())) return; break;
      case 7: await runCancel(); break;
      case 8: console.log(dim('再见 👋')); return;
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    console.log(`pcoff v${VERSION}`);
    return;
  }
  if (argv.includes('cancel') || argv.includes('-c')) {
    await runCancel();
    return;
  }

  const prompt = new Prompt();
  try {
    if (argv.length === 0) {
      await menuLoop(prompt);
      return;
    }
    if (argv.length > 1) {
      fail(red('参数太多，一次只接受一个时间。') + dim('\n用法：pcoff 30s / 20m / 1h；不带参数打开菜单；pcoff cancel 取消。'));
    }
    const parsed = parseDuration(argv[0] ?? '');
    if (!parsed) {
      fail(red(`无法识别的时间：“${argv[0] ?? ''}”`) + dim('\n示例：30s / 20m / 1h / 1h30m；纯数字按秒计。详见 pcoff -h。'));
    }
    if (parsed.totalSeconds < 1) fail(red('时间至少 1 秒。'));
    if (parsed.totalSeconds > MAX_SECONDS) fail(red('时间最长 10 年。'));
    await scheduleWithCheck(prompt, parsed.totalSeconds);
  } finally {
    prompt.close();
  }
}

process.on('SIGINT', exitGracefully);

main().catch((err: unknown) => {
  console.error(red(`出错了：${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
