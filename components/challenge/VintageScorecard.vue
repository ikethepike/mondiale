<template>
  <section v-if="region && outcome && run" class="vintage-scorecard">
    <header class="verdict">
      <span class="eyebrow">{{ regionName }} · this map held {{ formatRuns(outcome.runs) }}</span>
      <h2 class="headline">{{ verdictLine }}</h2>
      <p v-if="because" class="because">{{ because }}</p>
    </header>

    <VintageTimebar
      class="timebar"
      :range="challenge.range"
      :band="outcome.runs"
      :steps="outcome.stepYears"
      steps-selectable
      :highlight="selected?.year"
      :states="outcome.states"
      :pawns="pawns"
      @select="selectYear"
    />
    <p class="curve-caption">
      Shaded: sovereign states on this map, year by year — {{ statesThen }} then, {{ statesNow }} in
      {{ VINTAGE_LAST_YEAR }}.
    </p>

    <div class="evidence">
      <div class="dating">
        <span class="eyebrow">How to date it</span>
        <div class="bookends">
          <article v-for="end in ends" :key="end.side" class="bookend pane" :class="end.side">
            <small>{{ end.side === 'already' ? 'No earlier than' : 'No later than' }}</small>
            <template v-if="end.change">
              <strong class="year">{{
                end.side === 'already' ? end.change.year : end.change.year - 1
              }}</strong>
              <p>
                <span class="badge">{{ end.n }}</span>
                {{ end.side === 'already' ? 'Already on the map:' : 'Still to come:' }}
                {{ describeChange(end.change) }} ({{ end.change.year }}).
              </p>
            </template>
            <p v-else class="edge">
              {{ end.side === 'already' ? 'The oldest map we have.' : 'Still the map today.' }}
            </p>
          </article>
        </div>
        <ol v-if="clueRows.length" class="clues">
          <li
            v-for="row in clueRows"
            :key="row.n"
            :class="{ lit: row.n === hovered }"
            @pointerenter="hovered = row.n"
            @pointerleave="hovered = undefined"
          >
            <span class="badge">{{ row.n }}</span>
            <CountryChip v-if="row.country" tag="span" compact :country="row.country" />
            <span class="sentence">{{ sentenceCase(describeChange(row.clue.change)) }}</span>
            <span class="bound">{{
              row.clue.bound === 'after'
                ? `since ${row.clue.change.year}`
                : `before ${row.clue.change.year}`
            }}</span>
          </li>
        </ol>
        <span v-if="moreClues" class="more chip map-caption">+ {{ moreClues }} more clues</span>
      </div>

      <VintageLens
        class="lens"
        :region="region"
        :scene="challenge.scene"
        :then-label="formatYears(run)"
        :badges="lensBadges"
        :highlight="hovered"
      />
    </div>

    <div class="since">
      <span class="eyebrow">Since then</span>
      <ol class="changelog">
        <li v-for="change in visibleChangelog" :key="`${change.step}-${change.unit}`">
          <button
            type="button"
            class="change"
            :class="{ lit: change.year === selected?.year }"
            @click="openChange(change)"
          >
            <span class="year">{{ change.year }}</span>
            <CountryChip
              v-if="countryOf(change)"
              tag="span"
              compact
              :country="countryOf(change)!"
            />
            <span class="verb chip">{{ CHANGE_LABELS[change.kind] }}</span>
            <span class="sentence">
              {{ sentenceCase(describeChange(change)) }}
              <small v-if="change.note">{{ change.note }}</small>
            </span>
          </button>
        </li>
      </ol>
      <button
        v-if="hiddenChanges"
        type="button"
        class="more chip map-caption"
        @click="showAll = true"
      >
        + {{ hiddenChanges }} more changes
      </button>
      <p v-if="!changes.length" class="edge">
        Nothing has changed since — this is still the map today.
      </p>
    </div>

    <VintageDossier v-model:open="dossierOpen" :change="dossierChange" />
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import VintageDossier from '~/components/challenge/VintageDossier.vue'
import VintageLens from '~/components/challenge/VintageLens.vue'
import VintageTimebar from '~/components/challenge/VintageTimebar.vue'
import { getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import { sentenceCase } from '~~/lib/strings'
import { useClientEvents } from '~~/lib/events/client-side'
import { useVintageStory } from '~~/lib/use-vintage-story'
import { loadVintageRegion } from '~~/lib/vintage'
import { yearsFrom } from '~~/lib/vintage-tuning'
import {
  CHANGE_LABELS,
  bookends,
  changelog,
  clues,
  dealtRun,
  describeChange,
  formatRuns,
  formatYears,
  lastYear,
  verdictReason,
  vintageVerdict,
  yearsWord,
  type VintageChange,
} from '~~/lib/vintage-story'
import type { VintageChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAnswer, Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { VINTAGE_LAST_YEAR, VINTAGE_REGION_NAMES, type VintageRegion } from '~~/types/vintage.types'

/** Vintage's scorecard: how close the table came, how the map could have
 *  been dated, and everything that changed since. */
const props = defineProps<{
  challenge: VintageChallenge
  roundAnswers: Record<string, GroupChallengeAnswer>
  players: Record<string, Player>
  playerId: string
  viewerId: string
  round?: Round
}>()

const { gameStore } = useClientEvents()

const CLUE_CAP = 6
const CHANGELOG_CAP = 6

const region = shallowRef<VintageRegion>()
onMounted(async () => {
  region.value = await loadVintageRegion(props.challenge.region)
})

const outcome = useVintageStory(
  () => {
    const rounds = gameStore.game?.rounds ?? []
    const index = props.round ? rounds.indexOf(props.round) : -1
    return index >= 0 ? index : rounds.length ? rounds.length - 1 : undefined
  },
  () => !!props.roundAnswers[props.viewerId] || !gameStore.game?.players[props.viewerId]
)
const run = computed(() =>
  outcome.value ? dealtRun(outcome.value, props.challenge.scene) : undefined
)
const regionName = computed(() => VINTAGE_REGION_NAMES[props.challenge.region])
const year = computed(() => props.roundAnswers[props.playerId]?.year)
const who = computed(() => seatLabel(props.players, props.playerId, props.viewerId))

const verdict = computed(() =>
  region.value && outcome.value && run.value
    ? vintageVerdict(region.value, outcome.value, run.value, props.challenge.labelled, year.value)
    : ({ kind: 'none' } as const)
)
const verdictLine = computed(() => {
  const v = verdict.value
  const said = `${who.value} said`
  if (v.kind === 'none') return `${who.value} gave no date`
  if (v.kind === 'inside') return `${said} ${year.value} — spot on`
  if (v.kind === 'close') return `${said} ${year.value} — close enough for full marks`
  return `${said} ${year.value} — ${yearsWord(v.off)} too ${v.kind}`
})
const because = computed(() => {
  const reason = verdictReason(verdict.value)
  return reason ? `But ${reason}` : ''
})

const pawns = computed(() =>
  Object.entries(props.roundAnswers).flatMap(([id, answer]) => {
    const player = props.players[id]
    if (!player || answer.year === undefined || !outcome.value) return []
    const off = yearsFrom(outcome.value.runs, answer.year)
    return [{ player, year: answer.year, label: off ? `${off > 0 ? '+' : ''}${off}` : '✓' }]
  })
)

const statesThen = computed(() =>
  outcome.value && run.value ? outcome.value.states[run.value[0] - outcome.value.firstYear] : 0
)
const statesNow = computed(() =>
  outcome.value ? outcome.value.states[lastYear(outcome.value) - outcome.value.firstYear] : 0
)

const ends = computed(() => {
  if (!region.value || !outcome.value || !run.value) return []
  const { already, notYet } = bookends(
    region.value,
    outcome.value,
    run.value,
    props.challenge.labelled
  )
  return [
    { side: 'already' as const, change: already, n: 1 },
    { side: 'notYet' as const, change: notYet, n: 2 },
  ]
})

const allClues = computed(() =>
  region.value && outcome.value && run.value
    ? clues(region.value, outcome.value, run.value, props.challenge.labelled)
    : []
)
const clueRows = computed(() =>
  allClues.value.slice(0, CLUE_CAP).map((clue, index) => ({
    clue,
    n: index + 3,
    country: clue.change.iso ? getCountry(clue.change.iso) : undefined,
  }))
)
const moreClues = computed(() => Math.max(0, allClues.value.length - CLUE_CAP))
const lensBadges = computed(() => [
  ...ends.value.flatMap(end => (end.change ? [{ n: end.n, unit: end.change.unit }] : [])),
  ...clueRows.value.map(row => ({ n: row.n, unit: row.clue.change.unit })),
])
const hovered = ref<number>()

const changes = computed(() =>
  region.value && outcome.value && run.value
    ? changelog(region.value, outcome.value, run.value, props.challenge.labelled)
    : []
)
const showAll = ref(false)
const visibleChangelog = computed(() =>
  showAll.value ? changes.value : changes.value.slice(0, CHANGELOG_CAP)
)
const hiddenChanges = computed(() =>
  showAll.value ? 0 : Math.max(0, changes.value.length - CHANGELOG_CAP)
)
const countryOf = (change: VintageChange) => (change.iso ? getCountry(change.iso) : undefined)

const selected = ref<VintageChange>()
const selectYear = (stepYear: number) => {
  selected.value = changes.value.find(change => change.year === stepYear)
  if (selected.value) showAll.value = true
}

const dossierOpen = ref(false)
const dossierChange = ref<VintageChange>()
const openChange = (change: VintageChange) => {
  dossierChange.value = change
  dossierOpen.value = true
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.vintage-scorecard {
  display: grid;
  gap: 1.8rem;
  padding: 0 3rem 3rem;

  @media (max-width: $tablet) {
    padding: 0 1.6rem 2rem;
  }
}

.verdict {
  display: grid;
  gap: 0.4rem;

  .headline {
    margin: 0;
    font-size: var(--caption-display, 2.4rem);
  }

  .because {
    margin: 0;
    font-size: 1.5rem;
    color: ink(0.8);
  }
}

.curve-caption {
  margin: -1rem 0 0;
  font-size: 1.2rem;
  color: ink(0.6);
}

.evidence {
  display: grid;
  gap: 1.6rem;

  @media (min-width: $tablet) {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: start;
  }
}

.dating {
  display: grid;
  gap: 1rem;
}

.bookends {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: 1fr 1fr;
}

.bookend {
  display: grid;
  gap: 0.3rem;
  padding: 1rem 1.2rem;

  small {
    font-size: 1.1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ink(0.6);
  }

  .year {
    font-size: 2.4rem;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.35;
  }
}

.badge {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-right: 0.3rem;
  font-size: 1.1rem;
  border-radius: 50%;
  border: 1px solid ink(0.9);
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}

.clues {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.4rem;
    border-radius: 0.6rem;
    font-size: 1.3rem;
    transition: background var(--motion-quick) var(--ease-smooth);

    &.lit {
      background: ink(0.06);

      .badge {
        color: var(--background-color);
        background: ink(0.95);
      }
    }
  }

  .bound {
    font-variant-numeric: tabular-nums;
    color: ink(0.65);
  }
}

.edge {
  margin: 0;
  color: ink(0.65);
  font-size: 1.35rem;
}

.since {
  display: grid;
  gap: 0.8rem;
}

.changelog {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.change {
  display: grid;
  grid-template-columns: 4.6rem auto auto 1fr;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 0;
  border-radius: 0.6rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  animation: row-land var(--motion-slow) var(--ease-out-expressive) both;

  &:hover,
  &.lit {
    background: ink(0.06);
  }

  .year {
    font-variant-numeric: tabular-nums;
    font-size: 1.6rem;
  }

  .verb {
    font-size: 1.1rem;
    white-space: nowrap;
  }

  .sentence {
    display: grid;
    font-size: 1.4rem;

    small {
      font-size: 1.25rem;
      color: ink(0.68);
    }
  }
}

.more {
  justify-self: start;
  padding: 0.3rem 1rem;
  font-size: 1.2rem;
}

@media (max-width: $tablet) {
  .change {
    grid-template-columns: 4.2rem 1fr;

    .verb,
    :deep(.country-chip) {
      display: none;
    }
  }
}
</style>
