export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug' | 'verbose'

const RANK: Record<LogLevel, number> = {
    none: 0, error: 1, warn: 2, info: 3, debug: 4, verbose: 5,
}

class MxlsLogger {
    private level: LogLevel = 'none'

    setLevel(level: LogLevel): void {
        this.level = level
    }

    getLevel(): LogLevel {
        return this.level
    }

    private enabled(level: LogLevel): boolean {
        return RANK[this.level] >= RANK[level]
    }

    error(msg: string, ...args: unknown[]): void {
        if (this.enabled('error')) console.error(`[mxls] ERROR ${msg}`, ...args)
    }

    warn(msg: string, ...args: unknown[]): void {
        if (this.enabled('warn')) console.warn(`[mxls] WARN  ${msg}`, ...args)
    }

    info(msg: string, ...args: unknown[]): void {
        if (this.enabled('info')) console.info(`[mxls] INFO  ${msg}`, ...args)
    }

    debug(msg: string, ...args: unknown[]): void {
        if (this.enabled('debug')) console.debug(`[mxls] DEBUG ${msg}`, ...args)
    }

    verbose(msg: string, ...args: unknown[]): void {
        if (this.enabled('verbose')) console.debug(`[mxls] TRACE ${msg}`, ...args)
    }
}

export const logger = new MxlsLogger()

/** Set the global log level for the mxls library. Default is 'none' (silent). */
export function setLogLevel(level: LogLevel): void {
    logger.setLevel(level)
}
