/**
 * Mine Commons for NASA Earth Observatory images that carry an `imagerecords`
 * path in their source/credit, filtered to public domain and a usable width.
 * EO's asset host still serves those paths even though the WOC tree is gone.
 */
const UA = { 'User-Agent': 'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale)' }
const wait = ms => new Promise(r => setTimeout(r, ms))
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ')

const search = async q => {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=40` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&format=json'
  const r = await fetch(url, { headers: UA }).catch(() => undefined)
  if (!r?.ok) return []
  const d = await r.json()
  return Object.values(d?.query?.pages ?? [])
}

const hits = new Map()
for (const q of process.argv.slice(2)) {
  for (const p of await search(q)) {
    const ii = p.imageinfo?.[0]
    if (!ii) continue
    const em = ii.extmetadata ?? {}
    const lic = strip(em.LicenseShortName?.value)
    if (!/ublic domain/.test(lic)) continue
    if ((ii.width ?? 0) < 1000) continue
    const blob = strip(em.Credit?.value) + ' ' + strip(em.ImageDescription?.value)
    const m = blob.match(/imagerecords\/\d+\/\d+\/[A-Za-z0-9_.-]+\.(?:jpg|png)/)
    if (!m) continue
    const year = (p.title.match(/\b(19|20)\d{2}\b/) ?? [])[0]
    hits.set(m[0], { title: p.title.replace('File:', '').slice(0, 60), w: ii.width, year })
  }
  await wait(1200)
}

for (const [path, v] of [...hits].sort()) {
  console.log(`${v.year ?? '????'}  ${String(v.w).padStart(5)}  ${path}`)
  console.log(`        ${v.title}`)
}
console.log(`\n${hits.size} records`)
