import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/**
 * Windows：系统已有计划中的关机任务（ERROR_SHUTDOWN_IS_SCHEDULED）。
 * shutdown.exe 把 Win32 错误码作为进程退出码，因此可以直接用退出码判断。
 */
const WERR_SHUTDOWN_IS_SCHEDULED = 1190

export interface ScheduleResult {
  ok: boolean
  /** 仅 Windows 有意义：系统已有待执行的关机任务（可能不是本工具设置的） */
  alreadyScheduled: boolean
  stderr: string
}

export interface AbortResult {
  ok: boolean
  /** 没有正在进行中的定时关机 */
  nothingPending: boolean
  stderr: string
}

/** 中文 Windows 的控制台输出是 GBK 系编码，按 UTF-8 解会得到乱码 */
function decodeOutput(data: Buffer | string | undefined): string {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  if (process.platform === 'win32') {
    try {
      return new TextDecoder('gb18030').decode(data).trim()
    } catch {
      return data.toString('utf8').trim()
    }
  }
  return data.toString('utf8').trim()
}

function describe(err: unknown): { code: number | string | undefined; stderr: string } {
  const e = err as
    | { code?: number | string; stderr?: Buffer | string; message?: string }
    | undefined
  const stderr = decodeOutput(e?.stderr) || (e?.message ?? String(err ?? ''))
  return { code: e?.code, stderr }
}

function isAlreadyScheduled(code: number | string | undefined, stderr: string): boolean {
  return Number(code) === WERR_SHUTDOWN_IS_SCHEDULED || stderr.includes('1190')
}

export async function scheduleShutdown(seconds: number): Promise<ScheduleResult> {
  if (process.env.PCZZZ_DRY_RUN === '1') {
    return { ok: true, alreadyScheduled: false, stderr: '' }
  }
  try {
    if (process.platform === 'win32') {
      await exec('shutdown', ['/s', '/t', String(Math.round(seconds)), '/c', 'pczzz 定时关机'], {
        windowsHide: true,
        encoding: 'buffer',
      })
    } else {
      // Linux/macOS 的 shutdown 只支持分钟粒度；均需要 root 权限
      const minutes = Math.max(1, Math.ceil(seconds / 60))
      await exec('shutdown', ['-h', `+${minutes}`])
    }
    return { ok: true, alreadyScheduled: false, stderr: '' }
  } catch (err) {
    const { code, stderr } = describe(err)
    return { ok: false, alreadyScheduled: isAlreadyScheduled(code, stderr), stderr }
  }
}

export async function abortShutdown(): Promise<AbortResult> {
  if (process.env.PCZZZ_DRY_RUN === '1') {
    return { ok: true, nothingPending: false, stderr: '' }
  }
  const args = process.platform === 'win32' ? ['/a'] : ['-c']
  try {
    await exec('shutdown', args, { windowsHide: true, encoding: 'buffer' })
    return { ok: true, nothingPending: false, stderr: '' }
  } catch (err) {
    // 失败的最常见原因就是"本来就没有计划中的关机"
    const { stderr } = describe(err)
    return { ok: false, nothingPending: true, stderr }
  }
}
