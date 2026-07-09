<template>
  <div v-if="leader" class="leader-reveal">
    <div class="lead">
      <span
        v-if="leader.image"
        class="portrait"
        :style="{ backgroundImage: `url(${leader.image})` }"
        aria-hidden="true"
      />
      <div class="ident">
        <strong class="name">{{ leader.name }}</strong>
        <span v-if="title" class="title">{{ title }}</span>
        <span class="facts">
          <span v-if="leader.party" class="fact">{{ leader.party }}</span>
          <span v-if="tenure" class="fact">{{ tenure }}</span>
          <span v-if="age" class="fact">{{ age }}</span>
        </span>
      </div>
    </div>
    <p v-if="otherRole" class="other-role">
      {{ otherRole.role }}: <strong>{{ otherRole.leader.name }}</strong>
    </p>
  </div>
</template>
<script lang="ts" setup>
import { leaderRoles, leaderTitle, politicalLeader } from '~~/lib/leaders'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ country: ISOCountryCode }>()

const leader = computed(() => politicalLeader(props.country))
const title = computed(() => (leader.value ? leaderTitle(leader.value) : undefined))

// "in office since 2019 · 6 yrs" — tenure of the surfaced leader.
const tenure = computed(() => {
  const since = leader.value?.sinceYear
  if (!since) return undefined
  const years = new Date().getFullYear() - since
  return years >= 1
    ? `in office since ${since} · ${years} yr${years === 1 ? '' : 's'}`
    : `in office since ${since}`
})

const age = computed(() => {
  const born = leader.value?.bornYear
  return born ? `b. ${born}` : undefined
})

// The OTHER role (head of state vs government), when it's a different person.
const otherRole = computed(() =>
  leaderRoles(props.country).find(entry => entry.leader.name !== leader.value?.name)
)
</script>
<style lang="scss" scoped>
.leader-reveal {
  display: grid;
  gap: 0.8rem;
  justify-items: center;
  text-align: center;
}

.lead {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  text-align: left;
}

.portrait {
  flex: 0 0 auto;
  width: 6.4rem;
  height: 6.4rem;
  border-radius: 50%;
  background-size: cover;
  background-position: center top;
  border: 0.2rem solid hsla(36, 100%, 98%, 0.9);
  box-shadow: 0 2px 8px hsla(215.7, 76.4%, 21.6%, 0.3);
}

.ident {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.name {
  font-size: 1.9rem;
  color: var(--dark-blue);
}

.title {
  font-size: 1.4rem;
  color: var(--dark-blue);
  opacity: 0.85;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.8rem;
  margin-top: 0.2rem;
  font-size: 1.2rem;
  opacity: 0.65;
}

.fact:not(:last-child)::after {
  content: '·';
  margin-left: 0.8rem;
}

.other-role {
  margin: 0;
  font-size: 1.3rem;
  opacity: 0.7;
}
</style>
