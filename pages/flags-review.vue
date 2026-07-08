<template>
  <div class="review">
    <header class="bar">
      <h1>Flag wide-tile review</h1>
      <div class="filters">
        <label>
          Family
          <select v-model="familyFilter">
            <option value="">all</option>
            <option v-for="f in families" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label>
          Resolution
          <select v-model="resolutionFilter">
            <option value="">all</option>
            <option value="family-default">family-default</option>
            <option value="override">override</option>
            <option value="excluded">excluded</option>
          </select>
        </label>
        <span class="count">{{ visible.length }} / {{ rows.length }}</span>
      </div>
    </header>

    <div class="grid">
      <article
        v-for="row in visible"
        :key="row.iso"
        class="row"
        :class="[`res-${row.result.resolution}`, { tuning: tuned[row.iso] }]"
      >
        <div class="meta">
          <strong>{{ row.iso }}</strong>
          <span class="badge">{{ row.result.family }}</span>
          <span class="badge sub">{{ row.result.resolution }}</span>
        </div>

        <div class="cols">
          <figure>
            <div class="box" v-html="row.originalInline" />
            <figcaption>original</figcaption>
          </figure>
          <figure>
            <div class="box wide" v-html="row.wide || excludedNote" />
            <figcaption>recomposed</figcaption>
          </figure>
          <figure>
            <div class="box" v-html="row.naive" />
            <figcaption>naive stretch</figcaption>
          </figure>
        </div>

        <div class="tune">
          <label>k <input v-model.number="knobs[row.iso].k" type="range" min="0.2" max="1" step="0.02" @input="markTuned(row.iso)" /><span>{{ knobs[row.iso].k.toFixed(2) }}</span></label>
          <label>dx <input v-model.number="knobs[row.iso].dx" type="range" min="-300" max="300" step="5" @input="markTuned(row.iso)" /><span>{{ knobs[row.iso].dx }}</span></label>
          <label>dy <input v-model.number="knobs[row.iso].dy" type="range" min="-150" max="150" step="5" @input="markTuned(row.iso)" /><span>{{ knobs[row.iso].dy }}</span></label>
          <button class="exclude" @click="toggleExclude(row.iso)">
            {{ knobs[row.iso].exclude ? 'un-exclude' : 'exclude' }}
          </button>
        </div>
      </article>
    </div>

    <aside class="snippet">
      <h2>OVERRIDES snippet</h2>
      <textarea readonly :value="snippet" />
    </aside>
  </div>
</template>

<script lang="ts" setup>
import { COUNTRIES } from '~~/data/countries.gen'
import { recompose } from '~~/lib/flags/recompose'
import { classify } from '~~/lib/flags/classify'
import type { Family } from '~~/lib/flags/types'
import type { ISOCountryCode } from '~~/types/geography.types'

// Dev-only harness (no auth), following the pages/test.vue convention. Runs the
// LIVE engine from lib/flags so what you see is exactly what the generator will
// emit — no dependency on having run generate:flags-wide yet.

const families: Family[] = [
  'plain',
  'nordic',
  'hoist-triangle',
  'vertical-triband',
  'horizontal-band',
  'single-device',
  'canton',
  'ensign',
  'oneoff',
]

const familyFilter = ref('')
const resolutionFilter = ref('')

const excludedNote = '<div class="excluded-note">EXCLUDED — contain fallback</div>'

interface Knob {
  k: number
  dx: number
  dy: number
  exclude: boolean
}

const isos = Object.keys(COUNTRIES) as ISOCountryCode[]

const defaultK: (f: Family) => number = f =>
  f === 'hoist-triangle' ? 0.5 : f === 'canton' ? 0.8 : f === 'single-device' ? 0.55 : 0.62

// Per-flag live knobs, seeded synchronously (so SSR and the computed both see
// them) from each flag's classified family default.
const knobs = reactive<Record<string, Knob>>(
  Object.fromEntries(
    isos.map(iso => [
      iso,
      { k: defaultK(classify(iso, COUNTRIES[iso].flag)), dx: 0, dy: 0, exclude: false },
    ])
  )
)
const tuned = reactive<Record<string, boolean>>({})

const wrapWide = (svg: string) =>
  svg.replace(
    '<svg ',
    '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" '
  )

const naiveStretch = (svg: string) =>
  svg
    .replace(/preserveAspectRatio="[^"]*"/g, '')
    .replace('<svg ', '<svg preserveAspectRatio="none" style="width:100%;height:100%;display:block" ')

// Recompute a row whenever its knobs change. We feed the knob values through as
// a per-call override so the harness previews tuning without touching the file.
const rows = computed(() =>
  isos.map(iso => {
    const country = COUNTRIES[iso]
    const source = country.flag
    const knob = knobs[iso]
    // Only pass an override once the reviewer has actually touched this flag;
    // an empty object would otherwise mark every row as "override".
    const override =
      knob && tuned[iso]
        ? knob.exclude
          ? { exclude: true }
          : { k: knob.k, dx: knob.dx, dy: knob.dy }
        : undefined
    const result = recompose(iso, source, override)
    return {
      iso,
      result,
      originalInline: wrapWide(source),
      naive: naiveStretch(source),
      wide: result.svg ? wrapWide(result.svg) : null,
    }
  })
)

const markTuned = (iso: string) => {
  tuned[iso] = true
}
const toggleExclude = (iso: string) => {
  knobs[iso].exclude = !knobs[iso].exclude
  tuned[iso] = true
}

const visible = computed(() =>
  rows.value.filter(
    r =>
      (!familyFilter.value || r.result.family === familyFilter.value) &&
      (!resolutionFilter.value || r.result.resolution === resolutionFilter.value)
  )
)

// Emit a paste-ready OVERRIDES snippet for every flag the reviewer touched.
const snippet = computed(() => {
  const entries: string[] = []
  for (const iso of isos) {
    if (!tuned[iso]) continue
    const k = knobs[iso]
    if (k.exclude) {
      entries.push(`  ${iso}: { exclude: true },`)
      continue
    }
    const parts: string[] = []
    if (Math.abs(k.k - 0.62) > 0.001) parts.push(`k: ${k.k}`)
    if (k.dx) parts.push(`dx: ${k.dx}`)
    if (k.dy) parts.push(`dy: ${k.dy}`)
    if (parts.length) entries.push(`  ${iso}: { ${parts.join(', ')} },`)
  }
  return `export const OVERRIDES: OverrideTable = {\n${entries.join('\n')}\n}`
})

definePageMeta({ layout: false })
</script>

<style scoped>
.review {
  padding: 1rem 1rem 24rem;
  font-family: system-ui, sans-serif;
}
.bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 2rem;
  align-items: center;
  padding: 0.8rem 1rem;
  background: #fff;
  border-bottom: 1px solid #ddd;
}
h1 {
  font-size: 1.6rem;
  margin: 0;
}
.filters {
  display: flex;
  gap: 1.2rem;
  align-items: center;
  font-size: 1.2rem;
}
.filters label {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.count {
  opacity: 0.6;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46rem, 1fr));
  gap: 1.2rem;
  margin-top: 1rem;
}
.row {
  border: 1px solid #e2e2e2;
  border-radius: 0.6rem;
  padding: 0.8rem;
  background: #fafafa;
}
.row.res-excluded {
  border-color: #d98a8a;
  background: #fdf3f3;
}
.row.tuning {
  border-color: #d9b24a;
  background: #fdf9ee;
}
.meta {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin-bottom: 0.5rem;
}
.meta strong {
  font-size: 1.4rem;
  text-transform: uppercase;
}
.badge {
  font-size: 1rem;
  padding: 0.1rem 0.5rem;
  border-radius: 0.4rem;
  background: #e7eef4;
  color: #345;
}
.badge.sub {
  background: #eee;
  color: #666;
}
.cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
}
figure {
  margin: 0;
}
.box {
  height: 56px;
  border: 1px solid #ccd;
  overflow: hidden;
  background: hsla(36, 30%, 90%, 1);
}
.box :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
figcaption {
  font-size: 1rem;
  opacity: 0.6;
  text-align: center;
  margin-top: 0.2rem;
}
.excluded-note {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 1rem;
  color: #a55;
}
.tune {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
  margin-top: 0.6rem;
  font-size: 1rem;
}
.tune label {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}
.tune input[type='range'] {
  width: 8rem;
}
.exclude {
  font-size: 1rem;
  padding: 0.2rem 0.6rem;
}
.snippet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1b2a4a;
  color: #fff;
  padding: 0.6rem 1rem;
  max-height: 22rem;
  overflow: auto;
}
.snippet h2 {
  font-size: 1.2rem;
  margin: 0 0 0.4rem;
}
.snippet textarea {
  width: 100%;
  height: 16rem;
  font-family: monospace;
  font-size: 1.1rem;
  background: #0f1a30;
  color: #cde;
  border: none;
  padding: 0.6rem;
}
</style>
