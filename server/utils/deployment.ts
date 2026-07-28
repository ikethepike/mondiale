import type { H3Event } from 'h3'

export interface DeploymentInfo {
  status: 'ok'
  commit: string
  buildTime: string
  uptimeSeconds: number
  node: string
  env: string
  region?: string
  machine?: string
}

export const getDeploymentInfo = (event: H3Event): DeploymentInfo => {
  const { commitHash, buildTime } = useRuntimeConfig(event).public
  return {
    status: 'ok',
    commit: commitHash,
    buildTime,
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
    ...(process.env.FLY_REGION && {
      region: process.env.FLY_REGION,
      machine: process.env.FLY_MACHINE_ID,
    }),
  }
}
