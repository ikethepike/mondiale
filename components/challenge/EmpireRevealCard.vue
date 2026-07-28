<template>
  <article class="empire-reveal pane tr decorator-bottom">
    <div class="pane-content">
      <header>
        <EmpireFlag v-if="flagSvg" class="flag" :svg="flagSvg" />
        <div class="title">
          <small>{{ reignSpan }}</small>
          <h3>{{ empire.name }}</h3>
        </div>
      </header>
      <p class="blurb">{{ empire.blurb }}</p>
      <p class="tally">
        You traced <strong>{{ foundCount }} of {{ empire.members.core.length }}</strong> of its core
        lands.
      </p>
      <p v-if="empire.members.partial.length" class="partials">
        Edge territories, not scored: {{ partialNames }}.
      </p>
      <ul v-if="events.length" class="events">
        <li v-for="event in events" :key="event.slug" class="chip">
          {{ event.name }} · {{ formatEventYear(event.year) }}
        </li>
      </ul>
    </div>
  </article>
</template>
<script lang="ts" setup>
import EmpireFlag from '~/components/challenge/EmpireFlag.vue'
import type { Empire } from '~~/data/empires.gen'
import { countryName } from '~~/lib/country'
import { formatEventYear, timelineEvent } from '~~/lib/timeline'

/** The reveal's confession card: what it was, when it ran, what it held only
 *  in part, and the timeline events that share its story. */
const props = defineProps<{
  empire: Empire
  foundCount: number
  /** Raw SVG markup from data/empire-flags.gen — sanitized before insertion. */
  flagSvg?: string
}>()

const reignSpan = computed(() => {
  const years = props.empire.keyframeYears
  return `${formatEventYear(years[0])} – ${formatEventYear(years[years.length - 1])}`
})

const partialNames = computed(() =>
  props.empire.members.partial.map(isoCode => countryName(isoCode)).join(', ')
)

const events = computed(() =>
  (props.empire.eventSlugs ?? [])
    .map(slug => ({ slug, ...timelineEvent(slug) }))
    .filter((event): event is { slug: string; name: string; year: number } =>
      Boolean(event.name && event.year !== undefined)
    )
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.empire-reveal {
  pointer-events: auto;
  width: min(44rem, calc(100vw - 3.2rem));

  .pane-content {
    gap: 1rem;
    display: flex;
    padding: 1.6rem 1.8rem;
    flex-flow: column nowrap;
    max-height: 38dvh;
    overflow-y: auto;
  }
}

header {
  gap: 1.2rem;
  display: flex;
  align-items: center;

  .flag {
    width: 6.4rem;
    height: 4rem;
    flex-shrink: 0;
  }

  .title {
    display: flex;
    flex-flow: column nowrap;

    small {
      opacity: 0.7;
      font-variant-numeric: tabular-nums;
    }
    h3 {
      margin: 0;
    }
  }
}

.blurb {
  margin: 0;
  line-height: 1.5;
}

.tally {
  margin: 0;
}

.partials {
  margin: 0;
  font-size: 1.3rem;
  font-style: italic;
  opacity: 0.85;
}

.events {
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-flow: row wrap;
  list-style: none;

  .chip {
    font-size: 1.15rem;
  }
}

@media (max-width: $tablet) {
  .empire-reveal .pane-content {
    padding: 1.2rem 1.4rem;
  }
}
</style>
