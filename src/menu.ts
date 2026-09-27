import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MAX_SECONDS, parseDuration } from './time.js';
import { cyan, red } from './ui.js';

interface Waiter {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
}

/** 交互式问答封装。零依赖，全部基于 node:readline。 */
export class Prompt {
  private readonly rl = readline.createInterface({ input: stdin, output: stdout });
  private readonly buffered: string[] = [];
  private waiter: Waiter | null = null;
  private closed = false;

  constructor() {
    // 输入可能先于下一次提问到达（例如管道喂入多行），必须排队，否则中间的行会被丢掉
    this.rl.on('line', (line: string) => {
      const waiter = this.waiter;
      if (waiter) {
        this.waiter = null;
        waiter.resolve(line);
      } else {
        this.buffered.push(line);
      }
    });
    this.rl.on('close', () => {
      this.closed = true;
      const waiter = this.waiter;
      if (waiter) {
        this.waiter = null;
        waiter.reject(new Error('输入流已结束'));
      }
    });
    // readline 处于原始模式时 Ctrl+C 只会触发 'SIGINT' 事件，不会杀掉进程，需要自己接住
    this.rl.on('SIGINT', () => {
      stdout.write('\n已退出。已设置的定时关机仍会执行；取消请运行 pcoff cancel。\n');
      process.exit(0);
    });
  }

  private readLine(): Promise<string> {
    const buffered = this.buffered.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (this.closed) return Promise.reject(new Error('输入流已结束'));
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  async choose(question: string, min: number, max: number): Promise<number> {
    for (;;) {
      stdout.write(question);
      const answer = (await this.readLine()).trim();
      const value = Number(answer);
      if (Number.isInteger(value) && value >= min && value <= max) return value;
      stdout.write(red(`请输入 ${min} ~ ${max} 之间的数字\n`));
    }
  }

  async confirm(question: string): Promise<boolean> {
    for (;;) {
      stdout.write(`${question} ${cyan('(Y/N) ')}`);
      const answer = (await this.readLine()).trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') return true;
      if (answer === 'n' || answer === 'no') return false;
      stdout.write(red('请输入 Y 或 N\n'));
    }
  }

  async askDuration(): Promise<number> {
    for (;;) {
      stdout.write(cyan('请输入时间（如 30s / 20m / 1h / 1h30m，纯数字按秒计）: '));
      const answer = await this.readLine();
      const parsed = parseDuration(answer);
      if (!parsed || parsed.totalSeconds < 1) {
        stdout.write(red('看不懂这个时间，请参考示例：30s、20m、1h、1h30m\n'));
        continue;
      }
      if (parsed.totalSeconds > MAX_SECONDS) {
        stdout.write(red('时间最长 10 年。\n'));
        continue;
      }
      return parsed.totalSeconds;
    }
  }

  close(): void {
    this.closed = true;
    this.rl.close();
  }
}
