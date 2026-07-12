<template>
  <section
    v-if="conflict"
    class="conflict-profile"
    :class="framed ? 'pane tr decorator-bottom' : 'floating'"
  >
    <div :class="{ 'pane-content': framed }">
      <header class="sides">
        <template v-for="(group, groupIndex) in sides" :key="groupIndex">
          <span v-if="groupIndex > 0" class="versus">›</span>
          <span v-for="side in group" :key="side.name" class="side">
            <CountryFlag
              v-if="side.country"
              class="side-flag"
              :country="side.country"
              mode="background"
            />
            <span class="side-name">{{ side.name }}</span>
          </span>
        </template>
      </header>

      <p class="map-caption facts">
        <span><strong>Years</strong> {{ yearsLabel }}</span>
        <span><strong>Type</strong> {{ typeLabel }}</span>
        <span><strong>Fought over</strong> {{ incompatibilityLabel }}</span>
        <span><strong>Intensity</strong> {{ conflict.reachedWar ? 'War' : 'Minor conflict' }}</span>
      </p>

      <!-- Straight tick strip: one tick per decade since the 1940s, inked
           where this conflict was active — the dot field's ramp, flattened. -->
      <div class="decades" aria-hidden="true">
        <span
          v-for="tick in decadeTicks"
          :key="tick.label"
          class="tick"
          :class="{ active: tick.active }"
          :title="tick.label"
        />
      </div>

      <p class="map-caption note">{{ ucdpNote }}</p>
      <p v-if="overflow" class="map-caption more">
        + {{ overflow }} more recorded {{ overflow === 1 ? 'conflict' : 'conflicts' }} since 1946
      </p>
      <p v-if="supportLine" class="map-caption more">{{ supportLine }}</p>
    </div>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { findCountryByName } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  CONFLICT_TYPE_LABELS,
  conflictActiveYears,
  dominantConflict,
  type ConflictSummary,
} from '~~/types/vendor/ucdp/ucdp.types'

/**
 * The educational reveal: a country's dominant UCDP conflict — sides, years,
 * type, incompatibility, intensity label — plus one rotating UCDP definition.
 * Never a death toll. `framed` wraps it in the pane card (score view); the
 * default floats over the map in the ghost-state dossier idiom.
 */
const props = defineProps<{
  country: ISOCountryCode
  framed?: boolean
}>()

const conflict = ref<ConflictSummary>()
const overflow = ref(0)
const supportLine = ref('')

onMounted(async () => {
  const { CONFLICTS, CONFLICTS_BY_COUNTRY, CONFLICTS_SUPPORTED_BY_COUNTRY } = await import(
    '~~/data/conflict-profiles.gen'
  )
  const ids = CONFLICTS_BY_COUNTRY[props.country] ?? []
  const profiles = ids.flatMap(id => CONFLICTS[id] ?? [])
  conflict.value = dominantConflict(profiles)
  overflow.value = Math.max(0, profiles.length - 1)

  // Power projection, display-only: never a metric, but Korea and Vietnam
  // belong on the US card somewhere.
  const supported = (CONFLICTS_SUPPORTED_BY_COUNTRY[props.country] ?? []).flatMap(
    id => CONFLICTS[id] ?? []
  )
  if (supported.length) {
    const named = supported
      .sort((a, b) => conflictActiveYears(b) - conflictActiveYears(a))
      .map(({ name }) => name)
      .filter(name => !name.includes(',') && name.length <= 24)
      .slice(0, 2)
    const examples = named.length ? ` — including ${named.join(' and ')}` : ''
    supportLine.value = `Sent forces into ${supported.length} more ${supported.length === 1 ? 'conflict' : 'conflicts'} as a supporting party${examples}`
  }
})

/** Two pill groups — side A › side B. "Government of X" gets X's flag pill;
 *  non-state parties stay text-only. */
const sides = computed(() => {
  if (!conflict.value) return []
  const toSide = (name: string) => ({
    name,
    country: findCountryByName(name.replace(/^Government of /, '')),
  })
  return [conflict.value.sideA.map(toSide), conflict.value.sideB.map(toSide)]
})

const yearsLabel = computed(() => {
  const episodes = conflict.value?.episodes ?? []
  if (!episodes.length) return ''
  if (episodes.length <= 3) {
    return episodes.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(', ')
  }
  return `${episodes[0][0]}–${episodes[episodes.length - 1][1]}, on and off`
})

const typeLabel = computed(() =>
  conflict.value ? CONFLICT_TYPE_LABELS[conflict.value.type] : ''
)

const incompatibilityLabel = computed(() => {
  switch (conflict.value?.incompatibility) {
    case 'territory':
      return conflict.value.territory ?? 'territory'
    case 'government':
      return 'who governs'
    case 'both':
      return 'territory & government'
    default:
      return ''
  }
})

const decadeTicks = computed(() => {
  const episodes = conflict.value?.episodes ?? []
  return Array.from({ length: 9 }, (_, index) => {
    const start = 1940 + index * 10
    return {
      label: `${start}s`,
      active: episodes.some(([from, to]) => to >= start && from < start + 10),
    }
  })
})

/**
 * One definition per card, picked by relevance — the card teaches the term it
 * actually shows, and never lectures with more than a line.
 */
const ucdpNote = computed(() => {
  const found = conflict.value
  if (!found) return ''
  if (found.type === 'internationalized civil war') {
    return 'An internal conflict counts as internationalized when another state sends troops into the fighting.'
  }
  if (found.reachedWar) {
    return 'Only a year with 1,000 or more battle deaths counts as war — below that, the data calls it a minor conflict.'
  }
  return 'Every conflict in the data is fought over one of two things: territory, or who governs.'
})
</script>
<style lang="scss" scoped>
.conflict-profile {
  &.floating {
    gap: 0.6rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;

    > div {
      display: contents;
    }
  }

  &.pane > div {
    gap: 0.8rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
    padding-top: 1.6rem;
    padding-bottom: 1.6rem;
  }
}

.sides {
  gap: 0.6rem 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.side-group {
  gap: 1rem;
  display: inline-flex;
  align-items: center;
}

.versus {
  opacity: 0.45;
  font-size: 1.8rem;
  font-weight: bold;
}

.side {
  gap: 0.7rem;
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 1rem;
  border-radius: 2rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--dark-blue);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.side-flag {
  width: 2.2rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.25rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
}

.facts {
  gap: 0.4rem 2rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;

  strong {
    opacity: 0.55;
    margin-right: 0.5rem;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
}

.decades {
  gap: 0.5rem;
  display: flex;
  align-items: flex-end;

  .tick {
    width: 0.25rem;
    height: 0.8rem;
    border-radius: 0.15rem;
    background: currentColor;
    opacity: 0.18;

    &.active {
      opacity: 0.9;
      height: 1.2rem;
      background: var(--hior-ange);
    }
  }
}

.note,
.more {
  margin: 0;
  max-width: min(90vw, 44rem);
  font-size: 1rem;
  text-align: center;
  line-height: 1.55;
  padding: 0.6rem 1.6rem;
}

.more {
  opacity: 0.7;
  padding-top: 0;
}
</style>
