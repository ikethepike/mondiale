import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { GoogleGenAI, Modality, type Part } from '@google/genai'
import sharp from 'sharp'

/**
 * Recreate a reference image at a higher resolution with Gemini, for the
 * handful of landmarks whose only free-licensed photo is too small to use.
 *
 *   bun run generators/upscale-image.ts <image> [options]
 *
 *   --prompt "…"    extra direction, appended to the faithful-recreate prompt
 *   --width  <n>    output width in px (default 1600)
 *   --out    <path> output file (default: <image-dir>/<name>.upscaled.webp)
 *   --crop          crop the result back to the source's exact aspect ratio
 *   --force         ignore the on-disk cache and re-generate
 *
 * IMPORTANT — this GENERATES a new image that resembles the reference; it is
 * not a signal-preserving upscale. That's fine for a well-photographed subject
 * whose only free copy is small (Sky Tower, Kravice), and wrong for anything
 * where the photo IS the evidence. It also produces a derivative work, so
 * check the source's licence before shipping the result.
 *
 * Never wired into generate:landmarks: run it, LOOK at the output, then point
 * the seed at the file yourself. A generated image silently replacing a real
 * photograph should always require a human to say yes.
 */

const MODEL = 'gemini-3-pro-image-preview'
const CACHE_DIRECTORY = 'generators/vendors/gemini/.cache'
const DEFAULT_WIDTH = 1600
const WEBP_QUALITY = 90

/** Gemini only accepts this fixed set; pick whichever is closest to the source. */
const ASPECT_RATIOS: { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
]

const RECREATE_PROMPT = [
  'Recreate this exact photograph at high resolution.',
  'Reproduce the same subject, framing, composition, camera angle, lighting and colours.',
  'Do not add, remove, or rearrange any element. Do not stylise or reinterpret.',
  'The result must be photorealistic and indistinguishable from the original photo,',
  'only sharper and more detailed.',
].join(' ')

const argv = process.argv.slice(2)
/** Flags that consume the following argument; everything else is positional. */
const VALUED = new Set(['prompt', 'width', 'out'])

const flags: Record<string, string | true> = {}
const positional: string[] = []
for (let index = 0; index < argv.length; index++) {
  const argument = argv[index]!
  if (!argument.startsWith('--')) {
    positional.push(argument)
    continue
  }
  const name = argument.slice(2)
  if (VALUED.has(name)) flags[name] = argv[++index] ?? ''
  else flags[name] = true
}

const flag = (name: string): string | undefined => {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}
const has = (name: string): boolean => name in flags

const source = positional[0]

if (!source || has('help')) {
  console.log(
    'Usage: bun run generators/upscale-image.ts <image> [--prompt "…"] [--width 1600] [--out path] [--force]'
  )
  process.exit(source ? 0 : 1)
}
if (!existsSync(source)) {
  console.error(`No such file: ${source}`)
  process.exit(1)
}

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to .env, then re-run with:')
  console.error('  set -a && . ./.env && set +a && bun run generators/upscale-image.ts …')
  process.exit(1)
}

const width = Number(flag('width') ?? DEFAULT_WIDTH)
const extra = flag('prompt')
const prompt = extra ? `${RECREATE_PROMPT} ${extra}` : RECREATE_PROMPT
const force = has('force')
const outputPath =
  flag('out') ?? join(dirname(source), `${basename(source, extname(source))}.upscaled.webp`)

const reference = readFileSync(source)
const metadata = await sharp(reference).metadata()
if (!metadata.width || !metadata.height) {
  console.error('Could not read the source image dimensions.')
  process.exit(1)
}

// Match the source's shape so the recreate doesn't letterbox or crop it.
const sourceRatio = metadata.width / metadata.height
const aspectRatio = ASPECT_RATIOS.reduce((best, candidate) =>
  Math.abs(candidate.value - sourceRatio) < Math.abs(best.value - sourceRatio) ? candidate : best
).label

// Cache on everything that changes the output — same inputs, same bytes, no call.
const hash = createHash('sha256')
  .update(reference)
  .update(prompt)
  .update(`${MODEL}:${aspectRatio}:${width}`)
  .digest('hex')
  .slice(0, 16)
const cachePath = join(CACHE_DIRECTORY, `${hash}.webp`)

const write = async (bytes: Buffer, cached: boolean) => {
  let working = bytes

  // Gemini only emits its fixed aspect ratios, so a source outside that set
  // comes back with invented content on the long edge. Crop it away on request.
  // Done as its own pass — two .resize() calls on one pipeline don't compose,
  // the last one wins.
  if (has('crop')) {
    const generated = await sharp(bytes).metadata()
    if (generated.width && generated.height) {
      working = await sharp(bytes)
        .resize({
          width: generated.width,
          height: Math.round(generated.width / sourceRatio),
          fit: 'cover',
          position: 'centre',
        })
        .toBuffer()
    }
  }

  const resized = await sharp(working)
    .resize({ width, withoutEnlargement: false })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, resized)

  const final = await sharp(resized).metadata()
  const before = `${metadata.width}×${metadata.height}`
  const after = `${final.width}×${final.height}`
  console.log(
    `\n  ${before}  →  ${after}   ${(resized.length / 1024) | 0}KB${cached ? '  (cached)' : ''}`
  )
  console.log(`  wrote ${outputPath}`)

  const finalRatio = (final.width ?? 1) / (final.height ?? 1)
  if (!has('crop') && Math.abs(finalRatio - sourceRatio) > 0.02) {
    console.log(
      `\n  ⚠ aspect changed ${sourceRatio.toFixed(2)} → ${finalRatio.toFixed(2)}: Gemini only emits`
    )
    console.log(`    ${ASPECT_RATIOS.map(r => r.label).join(', ')}, so it INVENTED content on the`)
    console.log(`    long edge to fill the frame. Re-run with --crop to cut it back.`)
  }
  console.log(`\n  Look at it before you use it — this is a generated image, not the original.`)
}

if (!force && existsSync(cachePath)) {
  await write(readFileSync(cachePath), true)
  process.exit(0)
}

console.log(`  model      ${MODEL}`)
console.log(`  source     ${source} (${metadata.width}×${metadata.height}, ${metadata.format})`)
console.log(`  aspect     ${aspectRatio}  (closest to ${sourceRatio.toFixed(2)})`)
if (extra) console.log(`  + prompt   "${extra}"`)
console.log(`\n  generating…`)

const client = new GoogleGenAI({ apiKey })
const parts: Part[] = [
  { inlineData: { data: reference.toString('base64'), mimeType: `image/${metadata.format}` } },
  { text: prompt },
]

const MAX_ATTEMPTS = 4
let lastError: Error | undefined

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: parts,
      config: {
        responseModalities: [Modality.IMAGE],
        // A recreate is a copy task, not a creative one — keep it deterministic.
        temperature: 0,
        imageConfig: { aspectRatio, imageSize: '2K' },
      },
    })

    const candidate = response.candidates?.[0]
    const image = candidate?.content?.parts?.find(
      part => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')
    )
    if (!image?.inlineData?.data) {
      throw new Error(`Gemini returned no image (finishReason=${candidate?.finishReason ?? '?'})`)
    }

    const bytes = Buffer.from(image.inlineData.data, 'base64')
    mkdirSync(CACHE_DIRECTORY, { recursive: true })
    writeFileSync(cachePath, bytes)
    await write(bytes, false)
    process.exit(0)
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error))
    const status = (error as { status?: number })?.status
    const transient = status === 429 || status === 503 || status === 500

    if (!transient || attempt === MAX_ATTEMPTS) break

    const delay = 2500 * attempt
    console.warn(
      `  ${status} — retrying in ${Math.ceil(delay / 1000)}s (${attempt}/${MAX_ATTEMPTS})`
    )
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

console.error(`\n  failed: ${lastError?.message ?? 'unknown error'}`)
process.exit(1)
