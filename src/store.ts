import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StoredTask {
  /** 记录创建时间（ISO 字符串） */
  createdAt: string;
  /** 计划关机时间（ISO 字符串） */
  fireAt: string;
  seconds: number;
  platform: string;
}

function taskFile(): string {
  const base = process.env.PCOFF_HOME ?? path.join(os.homedir(), '.pcoff');
  return path.join(base, 'task.json');
}

/**
 * 读取本工具上一次安排且尚未到期的关机记录。
 * 过期或损坏的记录会被顺手清掉；读不到返回 null。
 */
export async function loadActiveTask(): Promise<StoredTask | null> {
  let text: string;
  try {
    text = await fs.readFile(taskFile(), 'utf8');
  } catch {
    return null;
  }

  let task: StoredTask;
  try {
    task = JSON.parse(text) as StoredTask;
  } catch {
    await clearTask();
    return null;
  }

  const fireAt = new Date(task.fireAt);
  if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= Date.now()) {
    await clearTask();
    return null;
  }
  return task;
}

export async function saveTask(seconds: number): Promise<void> {
  const now = Date.now();
  const task: StoredTask = {
    createdAt: new Date(now).toISOString(),
    fireAt: new Date(now + seconds * 1000).toISOString(),
    seconds,
    platform: process.platform,
  };
  await fs.mkdir(path.dirname(taskFile()), { recursive: true });
  await fs.writeFile(taskFile(), JSON.stringify(task, null, 2) + '\n', 'utf8');
}

export async function clearTask(): Promise<void> {
  try {
    await fs.rm(taskFile(), { force: true });
  } catch {
    // 记录文件删不掉不该影响主流程
  }
}
