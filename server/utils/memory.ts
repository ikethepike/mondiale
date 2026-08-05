import { readFileSync } from 'node:fs'

export interface MemorySnapshot {
  rssMb: number
  heapUsedMb: number
  /** `full avg60` from /proc/pressure/memory — the share of the last minute
   *  every process spent stalled on reclaim. Absent off Linux. */
  stallFullAvg60?: number
}

/** Stall share above which the machine is quietly thrashing (issue #110: the
 *  2026-08-04 incident showed 35.75% while pages took 25s — 1% catches it long
 *  before it is user-visible). */
export const MEMORY_STALL_WARN_THRESHOLD = 1.0

const toMb = (bytes: number): number => Math.round(bytes / 1048576)

export const memoryPressureFullAvg60 = (): number | undefined => {
  try {
    const pressure = readFileSync('/proc/pressure/memory', 'utf8')
    const full = pressure.match(/^full avg10=\S+ avg60=(\S+)/m)
    return full ? Number(full[1]) : undefined
  } catch {
    return undefined // not Linux, or PSI not enabled
  }
}

export const memorySnapshot = (): MemorySnapshot => {
  const usage = process.memoryUsage()
  const stall = memoryPressureFullAvg60()
  return {
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    ...(stall !== undefined && { stallFullAvg60: stall }),
  }
}
