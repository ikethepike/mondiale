<template>
  <article class="atlas-card pane tr decorator-bottom">
    <button class="close" type="button" aria-label="Close" @click="emit('close')">×</button>

    <div class="atlas-scroll">
      <!-- Hero -->
      <header class="hero">
        <CountryFlag class="flag" :country="country" />
        <div class="titles">
          <h2>{{ countryName(country) }}</h2>
          <p v-if="country.name.local !== country.name.english" class="local">
            {{ country.name.local }}
          </p>
          <p class="sub">
            {{ REGION_LABELS[country.region] }} · {{ country.geography.capital.name }}
          </p>
        </div>
      </header>

      <dl class="quick">
        <div v-if="languages">
          <dt>Languages</dt>
          <dd>{{ languages }}</dd>
        </div>
        <div v-if="country.currency">
          <dt>Currency</dt>
          <dd>{{ country.currency }}</dd>
        </div>
        <div v-if="coordinates">
          <dt>Coordinates</dt>
          <dd>{{ coordinates }}</dd>
        </div>
      </dl>

      <!-- Leader -->
      <section v-if="leader" class="leader">
        <span
          v-if="leader.image"
          class="leader-portrait"
          :style="{ backgroundImage: `url(${leader.image})` }"
          aria-hidden="true"
        />
        <div class="leader-ident">
          <strong>{{ leader.name }}</strong>
          <span v-if="leaderTitleText" class="leader-title">{{ leaderTitleText }}</span>
          <span class="leader-facts">
            <span v-if="leader.party">{{ leader.party }}</span>
            <span v-if="leaderTenure">{{ leaderTenure }}</span>
          </span>
        </div>
      </section>

      <!-- Fact sections -->
      <section v-for="section in sections" :key="section.heading" class="facts">
        <h3>{{ section.heading }}</h3>
        <ul>
          <li v-for="fact in section.facts" :key="fact.label" class="fact">
            <span class="fact-label">{{ fact.label }}</span>
            <span class="fact-value">{{ fact.value }}</span>
            <ScalePlot
              v-if="fact.scale"
              class="fact-scale"
              :amount="fact.scale.amount"
              :min="fact.scale.min"
              :max="fact.scale.max"
              :invert="fact.scale.invert"
              :least-label="fact.scale.leastLabel"
              :most-label="fact.scale.mostLabel"
            />
          </li>
        </ul>
      </section>

      <!-- Neighbours: click to travel the atlas -->
      <section v-if="neighbours.length" class="neighbours">
        <h3>Borders</h3>
        <div class="chips">
          <button
            v-for="iso in neighbours"
            :key="iso"
            class="chip"
            type="button"
            @click="emit('select', iso)"
          >
            {{ countryName(iso) }}
          </button>
        </div>
      </section>
    </div>
  </article>
</template>
<script lang="ts" setup>
import ScalePlot from '~/components/feedback/ScalePlot.vue'
import { BORDERS } from '~~/data/borders.gen'
import { ATLAS_SECTIONS, atlasFact, type AtlasFact } from '~~/lib/atlas'
import { countryName, primaryCoordinates } from '~~/lib/country'
import { leaderTitle, politicalLeader } from '~~/lib/leaders'
import { REGION_LABELS } from '~~/lib/variant'
import { isValidISOCode, type Country, type ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ country: Country }>()
const emit = defineEmits<{ close: []; select: [iso: ISOCountryCode] }>()

const languages = computed(() => props.country.languages?.slice(0, 4).join(', '))

const coordinates = computed(() => primaryCoordinates(props.country))

const leader = computed(() => politicalLeader(props.country.isoCode))
const leaderTitleText = computed(() => (leader.value ? leaderTitle(leader.value) : undefined))
const leaderTenure = computed(() => {
  const since = leader.value?.sinceYear
  if (!since) return undefined
  const years = new Date().getFullYear() - since
  return years >= 1 ? `since ${since} · ${years} yr${years === 1 ? '' : 's'}` : `since ${since}`
})

// Each section keeps only the facts that have data.
const sections = computed(() =>
  ATLAS_SECTIONS.map(section => ({
    heading: section.heading,
    facts: section.accessors
      .map(id => atlasFact(props.country.isoCode, id))
      .filter((fact): fact is AtlasFact => Boolean(fact)),
  })).filter(section => section.facts.length)
)

const neighbours = computed(() =>
  (BORDERS[props.country.isoCode] ?? []).filter((iso): iso is ISOCountryCode => isValidISOCode(iso))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.atlas-card {
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 12;
  width: min(38rem, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border-bottom-left-radius: 0;
}

.close {
  position: absolute;
  top: 0.6rem;
  right: 0.8rem;
  z-index: 2;
  width: 3rem;
  height: 3rem;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 2rem;
  line-height: 1;
  color: var(--dark-blue);
  background: hsla(0, 0%, 100%, 0.6);
}

.atlas-scroll {
  overflow-y: auto;
  padding: 1.6rem 1.6rem 1.8rem;
}

.hero {
  display: flex;
  gap: 1.2rem;
  align-items: center;

  .flag {
    flex: 0 0 auto;
    width: 6rem;
    height: 4rem;
    border-radius: 0.4rem;
    box-shadow: 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.15);
  }

  h2 {
    margin: 0;
    font-size: 2.2rem;
    color: var(--dark-blue);
  }

  .local {
    margin: 0.1rem 0 0;
    font-size: 1.3rem;
    opacity: 0.6;
  }

  .sub {
    margin: 0.2rem 0 0;
    font-size: 1.4rem;
    color: var(--soft-blue);
  }
}

.quick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem 1.2rem;
  margin: 1.2rem 0 0;

  dt {
    font-size: 1rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.5;
  }
  dd {
    margin: 0;
    font-size: 1.4rem;
  }
}

.leader {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.4rem 0 0;
  padding: 0.9rem;
  border-radius: 1rem;
  background: hsla(29.7, 79.9%, 72.7%, 0.16);

  .leader-portrait {
    flex: 0 0 auto;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 50%;
    background-size: cover;
    background-position: center top;
    border: 0.15rem solid hsla(36, 100%, 98%, 0.9);
  }
  .leader-ident {
    display: flex;
    flex-direction: column;
    min-width: 0;
    strong {
      font-size: 1.6rem;
    }
  }
  .leader-title {
    font-size: 1.3rem;
    opacity: 0.85;
  }
  .leader-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.8rem;
    font-size: 1.15rem;
    opacity: 0.65;
  }
  .leader-facts > span:not(:last-child)::after {
    content: '·';
    margin-left: 0.8rem;
  }
}

.facts {
  margin-top: 1.6rem;

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.15rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--soft-blue);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
  }

  .fact {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0.4rem 1rem;
    font-size: 1.4rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
  }
  .fact-label {
    opacity: 0.7;
  }
  .fact-value {
    font-variant-numeric: tabular-nums;
    color: var(--dark-blue);
    text-align: right;
  }
  .fact-scale {
    grid-column: 1 / -1;
    margin-top: 0.2rem;
  }
}

.neighbours {
  margin-top: 1.6rem;

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.15rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--soft-blue);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .chip {
    cursor: pointer;
    padding: 0.4rem 0.9rem;
    font-size: 1.3rem;
    border-radius: 999px;
    color: var(--dark-blue);
    background: hsla(0, 0%, 100%, 0.5);
    border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.18);
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--dark-blue);
    }
  }
}

@media (max-width: $tablet) {
  .atlas-card {
    width: 100vw;
    max-height: 72vh;
    border-radius: 1.4rem 1.4rem 0 0;
  }
}
</style>
