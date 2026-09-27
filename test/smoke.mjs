// 冒烟测试：不依赖测试框架，直接跑断言。
// 通过 PCOFF_DRY_RUN=1 跳过真实的 shutdown 调用，通过 PCOFF_HOME 把记录文件隔离到临时目录，
// 因此整条流程绝不会真的安排或取消任何关机。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PCOFF_DRY_RUN = '1';
const home = await mkdtemp(path.join(tmpdir(), 'pcoff-test-'));
process.env.PCOFF_HOME = home;

const { parseDuration, formatDuration, formatClock, MAX_SECONDS } = await import('../dist/time.js');
const { loadActiveTask, saveTask, clearTask } = await import('../dist/store.js');

function runCli(args, input) {
  return spawnSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env },
  });
}

// ---------- parseDuration ----------
const cases = [
  ['1s', 1], ['1m', 60], ['1h', 3600], ['1h30m', 5400], ['90', 90],
  ['30秒', 30], ['1小时', 3600], ['2分30秒', 150], ['1.5h', 5400],
  ['1h 30m', 5400], ['20min', 1200], ['1天', 86400], ['1d12h', 129600],
];
for (const [input, expected] of cases) {
  const parsed = parseDuration(input);
  assert.ok(parsed, `应能解析: ${input}`);
  assert.equal(parsed.totalSeconds, expected, `${input} 应等于 ${expected} 秒`);
}
for (const bad of ['abc', '1x', '', 'h30', '1h30', '-5m', '1..2s']) {
  assert.equal(parseDuration(bad), null, `应拒绝: ${bad}`);
}
assert.equal(MAX_SECONDS, 315360000);

// ---------- 格式化 ----------
assert.equal(formatDuration(5400), '1 小时 30 分钟');
assert.equal(formatDuration(30), '30 秒');
assert.equal(formatDuration(3600), '1 小时');
assert.equal(formatDuration(86401), '1 天 1 秒');
assert.equal(formatClock(3661), '1:01:01');
assert.equal(formatClock(59), '00:59');

// ---------- 记录文件 ----------
await clearTask();
assert.equal(await loadActiveTask(), null);
await saveTask(60);
const task = await loadActiveTask();
assert.ok(task, '保存后应能读到记录');
assert.equal(task.seconds, 60);
assert.ok(new Date(task.fireAt).getTime() > Date.now());

// 已过期的记录应被视为"没有任务"并被清掉
await writeFile(
  path.join(home, 'task.json'),
  JSON.stringify({
    createdAt: new Date(Date.now() - 120000).toISOString(),
    fireAt: new Date(Date.now() - 60000).toISOString(),
    seconds: 60,
    platform: 'test',
  }),
);
assert.equal(await loadActiveTask(), null, '过期记录应返回 null');

// ---------- CLI ----------
let r = runCli(['--help']);
assert.equal(r.status, 0);
assert.match(r.stdout, /定时关机/);

r = runCli(['-v']);
assert.equal(r.status, 0);
assert.match(r.stdout, /pcoff v/);

r = runCli(['bogus']);
assert.equal(r.status, 1);
assert.match(r.stderr, /无法识别/);

// 直接参数模式（dry-run，不会真的关机），应写入记录文件
r = runCli(['1h30m']);
assert.equal(r.status, 0);
assert.match(r.stdout, /已安排/);
const stored = JSON.parse(await readFile(path.join(home, 'task.json'), 'utf8'));
assert.equal(stored.seconds, 5400);

// 清掉记录，给后面的菜单用例一个干净状态
r = runCli(['cancel']);
assert.equal(r.status, 0);
assert.match(r.stdout, /已取消当前定时关机/);

// 交互菜单：自定义 45m 并成功安排
r = runCli([], '6\n45m\n');
assert.equal(r.status, 0);
assert.match(r.stdout, /你想多久关机/);
assert.match(r.stdout, /已安排/);

// 已有任务时询问是否重新安排：选 N 保留原计划
r = runCli([], '2\nn\n8\n');
assert.equal(r.status, 0);
assert.match(r.stdout, /要重新安排吗/);
assert.match(r.stdout, /已保留原计划/);

// 已有任务时选 Y 覆盖
r = runCli([], '3\ny\n8\n');
assert.equal(r.status, 0);
assert.match(r.stdout, /要重新安排吗/);
assert.match(r.stdout, /已安排/);

// pcoff cancel（dry-run 下视为取消成功）应清掉记录
r = runCli(['cancel']);
assert.equal(r.status, 0);
assert.match(r.stdout, /已取消当前定时关机/);
assert.equal(await loadActiveTask(), null, '取消后记录应被清掉');

// 菜单里的取消项
r = runCli([], '7\n8\n');
assert.equal(r.status, 0);
assert.match(r.stdout, /已取消当前定时关机/);
assert.match(r.stdout, /再见/);

// 非法菜单选项应提示并允许重试
r = runCli([], '99\n8\n');
assert.equal(r.status, 0);
assert.match(r.stdout, /请输入 1 ~ 8 之间的数字/);

await rm(home, { recursive: true, force: true });
console.log('✅ 全部测试通过');
