type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export class Logger {
  constructor(private readonly context: string) {}

  private log(level: LogLevel, message: string, ...args: unknown[]) {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`

    switch (level) {
      case 'error':
        console.error(prefix, message, ...args)
        break
      case 'warn':
        console.warn(prefix, message, ...args)
        break
      case 'debug':
        console.debug(prefix, message, ...args)
        break
      default:
        console.log(prefix, message, ...args)
    }
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args)
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args)
  }

  progress(current: number, total: number, message: string) {
    const percentage = Math.round((current / total) * 100)
    this.info(`[${percentage}%] ${message}`)
  }
}
