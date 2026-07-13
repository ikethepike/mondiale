import { forgeFlag } from '~~/lib/flags/forge'

const humanUptime = (s: number) => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`
}

export default defineEventHandler((event) => {
  const { commitHash, buildTime } = useRuntimeConfig(event).public
  const uptimeSeconds = Math.round(process.uptime())
  const info = {
    status: 'ok' as const,
    commit: commitHash,
    buildTime,
    uptimeSeconds,
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
    ...(process.env.FLY_REGION && { region: process.env.FLY_REGION, machine: process.env.FLY_MACHINE_ID }),
  }

  const accept = getHeader(event, 'accept') ?? ''
  const wantsJson = getQuery(event).format === 'json' || !accept.includes('text/html')
  if (wantsJson) return info

  const flag = forgeFlag(commitHash)
  const rows = [
    ['build', new Date(buildTime).toUTCString()],
    ['uptime', humanUptime(uptimeSeconds)],
    ['node', info.node],
    ['env', info.env],
    ...(info.region ? [['region', `${info.region} · ${info.machine}`]] : []),
    ['ensign', `${flag.family} · ${flag.colors.join(', ')}`],
  ]

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  // Standalone page (no app bundle), so the cartographer tokens — sour-milk
  // paper, ink hairlines, Lusitana, pane/chip treatments — are inlined from
  // assets/scss (rules/_palette, templates/_pane, templates/_chip).
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mondiale · health</title>
<style>
  @font-face {
    font-family: 'Lusitana';
    src: url('/fonts/lusitana/Lusitana.woff2') format('woff2');
    font-weight: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Lusitana';
    src: url('/fonts/lusitana/Lusitana-Bold.woff2') format('woff2');
    font-weight: bold; font-display: swap;
  }
  :root {
    --sour-milk: hsl(36, 100%, 98%);
    --dark-blue: hsla(215.7, 76.4%, 21.6%, 1);
    --soft-mint: hsl(170.5, 24.7%, 65.1%);
    --black: hsl(0, 0%, 7.5%);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: 62.5%; }
  body {
    min-height: 100vh; display: grid; place-items: center; padding: 3rem 2rem;
    background: var(--sour-milk); color: var(--black);
    font-family: 'Lusitana', Georgia, serif; font-size: 1.6rem;
  }
  main { width: min(46rem, 100%); }
  .plate { border: 0.1rem solid var(--black); }
  .plate svg { display: block; width: 100%; height: auto; }
  figcaption {
    margin: 0.9rem 0 2.4rem; text-align: center; font-style: italic;
    font-size: 1.3rem; color: var(--dark-blue);
  }
  .pane {
    background: var(--sour-milk);
    border: 0.1rem solid var(--black);
    border-top-right-radius: 1.9rem;
    border-bottom: 0.6rem solid var(--black);
    padding: 3rem;
  }
  .head { display: flex; align-items: baseline; gap: 1.2rem; }
  .commit { font: bold 2.8rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.05em; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.5rem;
    font-size: 1.3rem; border-radius: 999px; padding: 0.3rem 0.9rem;
    color: var(--dark-blue);
    background: hsla(170.5, 24.7%, 65.1%, 0.25);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.15);
  }
  dl { margin-top: 2.2rem; }
  .row {
    display: flex; align-items: baseline; gap: 1rem; padding: 0.7rem 0;
    border-bottom: 0.1rem dotted hsla(215.7, 76.4%, 21.6%, 0.35);
  }
  .row:last-child { border-bottom: none; }
  dt { color: var(--dark-blue); font-size: 1.4rem; }
  .leader { flex: 1; }
  dd { font-size: 1.4rem; text-align: right; }
  .hint { margin-top: 2rem; font-size: 1.3rem; font-style: italic; color: var(--dark-blue); }
  .hint a { color: inherit; }
</style>
</head>
<body>
<main>
  <figure>
    <div class="plate">${flag.svg}</div>
    <figcaption>Plate I — ensign of the current deployment</figcaption>
  </figure>
  <div class="pane">
    <div class="head">
      <span class="commit">${commitHash}</span><span class="chip">${info.status}</span>
    </div>
    <dl>${rows.map(([k, v]) => `<div class="row"><dt>${k}</dt><span class="leader"></span><dd>${v}</dd></div>`).join('')}</dl>
    <p class="hint">The ensign is drawn deterministically from the commit hash — every deploy flies its own colors. <a href="/health?format=json">JSON</a></p>
  </div>
</main>
</body>
</html>`
})
