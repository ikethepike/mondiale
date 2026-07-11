<template>
  <div class="review">
    <header class="bar">
      <h1>Stat glyph review</h1>
      <span class="count">{{ accessorIds.length }} stats</span>
    </header>

    <section v-for="group in groups" :key="group.topic" class="group">
      <h2>
        <StatTopicIcon class="topic-glyph" :topic="group.topic" />
        {{ group.topic }}
      </h2>
      <div class="grid">
        <StatCard
          v-for="id in group.ids"
          :key="id"
          :accessor="id"
          :label="accessorTopicLabel(id)"
        >
          <code class="accessor">{{ id }}</code>
        </StatCard>
      </div>
    </section>

    <section class="group">
      <h2>topic emblems</h2>
      <div class="grid">
        <StatCard v-for="topic in topics" :key="topic" :topic="topic" :label="topic" />
      </div>
    </section>

    <section class="group">
      <h2>utility + fallback</h2>
      <div class="grid">
        <StatCard v-for="key in utilityKeys" :key="key" :topic="key" :label="key" />
        <StatCard topic="unknown-topic" label="fallback" />
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import StatCard from '~/components/challenge/StatCard.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { TOPIC_GLYPHS, UTILITY_GLYPHS } from '~~/lib/stat-glyphs'
import { GROUP_CHALLENGES } from '~~/types/challenges/group-challenge.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { ChallengeTopic } from '~~/types/challenge.type'

// Dev-only harness (no auth), following the pages/flags-review.vue convention:
// every stat's bespoke glyph on the real StatCard, grouped by topic.

const accessorIds = Object.keys(GROUP_CHALLENGES) as GroupChallengeAccessorId[]
const topics = Object.keys(TOPIC_GLYPHS) as ChallengeTopic[]
const utilityKeys = Object.keys(UTILITY_GLYPHS)

const groups = computed(() => {
  const byTopic = new Map<string, GroupChallengeAccessorId[]>()
  for (const id of accessorIds) {
    const topic = getChallengeDetails(id)?.topic ?? 'unknown'
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), id])
  }
  return [...byTopic.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, ids]) => ({ topic, ids }))
})

definePageMeta({ layout: false })
</script>

<style lang="scss" scoped>
.review {
  padding: 1rem 1.6rem 6rem;
  color: var(--dark-blue, #1b2a4a);
  background: hsl(36, 56%, 92%);
  min-height: 100vh;
}

.bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 2rem;
  align-items: baseline;
  padding: 0.8rem 0;
  background: inherit;
  border-bottom: 1px solid hsla(215.7, 76.4%, 21.6%, 0.2);
}

h1 {
  font-size: 1.8rem;
  margin: 0;
}

.count {
  opacity: 0.6;
  font-size: 1.3rem;
}

.group h2 {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  font-size: 1.5rem;
  margin: 2.4rem 0 1rem;
  text-transform: capitalize;

  .topic-glyph {
    width: 2rem;
    height: 2rem;
    opacity: 0.7;
  }
}

.grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
}

.accessor {
  opacity: 0.55;
  font-size: 1.1rem;
}
</style>
