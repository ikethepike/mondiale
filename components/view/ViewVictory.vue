<template>
  <ModalWrapper>
    <article
      v-if="game"
      ref="card"
      class="view-victory pane tl decorator-bottom"
      @click="skipToEnd"
    >
      <div class="pane-content">
        <h1 data-victory="heading">Congratulations{{ ownName ? `, ${ownName}` : '' }}!</h1>
        <p v-if="placement" data-victory="heading">You placed {{ ordinal(placement) }}.</p>

        <hr data-victory="rule" />
        <h3 data-victory="heading">Leaderboard</h3>
        <ol class="leaderboard">
          <li
            v-for="(standing, index) in gameStore.standings"
            :key="standing.id"
            data-victory="row"
            class="row"
            :class="{ winner: index === 0, 'own-player': standing.id === playerId }"
          >
            <ContourRipple
              v-if="index === 0"
              ref="winnerRipple"
              class="winner-ripple"
              :autoplay="false"
            />
            <PlayerPawn :player="standing" class="pawn" :data-victory="index === 0 ? 'winner-pawn' : undefined" />
            <span class="name">{{ standing.name }}</span>
            <span class="detail">
              <template v-if="standing.completedAtRound">
                Finished in round {{ standing.completedAtRound }}
              </template>
              <template v-else>Reached tile {{ standing.currentPosition + 1 }}</template>
            </span>
          </li>
        </ol>
      </div>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { EASE, prefersReducedMotion } from '~~/lib/motion'

const { game, player, playerId, gameStore } = useClientEvents()

const ownName = computed(() => player.value?.name)

const placement = computed(() => {
  const index = gameStore.standings.findIndex(standing => standing.id === playerId.value)
  return index === -1 ? undefined : index + 1
})

const ordinal = (value: number) => {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  const tens = value % 100
  return `${value}${tens >= 11 && tens <= 13 ? 'th' : (suffixes[value % 10] ?? 'th')}`
}

const card = ref<HTMLElement>()
const winnerRipple = ref<InstanceType<typeof ContourRipple>[]>()
let timeline: gsap.core.Timeline | undefined

// Celebration sequence: headings rise → rule draws → rows stagger in →
// winner row washes warm-sand, their pawn pops, one ripple plays.
onMounted(() => {
  if (!card.value || prefersReducedMotion()) return

  timeline = gsap.timeline()
  timeline.fromTo(
    card.value.querySelectorAll('[data-victory="heading"]'),
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.45, ease: EASE.enter, stagger: 0.12 }
  )
  timeline.fromTo(
    card.value.querySelectorAll('[data-victory="rule"]'),
    { scaleX: 0, transformOrigin: 'left center' },
    { scaleX: 1, duration: 0.5, ease: EASE.cross },
    '<0.3'
  )
  timeline.fromTo(
    card.value.querySelectorAll('[data-victory="row"]'),
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.4, ease: EASE.enter, stagger: 0.12 },
    '<0.2'
  )
  timeline.fromTo(
    card.value.querySelector('.row.winner'),
    { backgroundColor: 'transparent' },
    { backgroundColor: 'rgba(241, 185, 130, 0.35)', duration: 0.4, ease: EASE.cross }
  )
  timeline.fromTo(
    card.value.querySelectorAll('[data-victory="winner-pawn"]'),
    { scale: 1 },
    { scale: 1.25, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 },
    '<'
  )
  timeline.call(() => winnerRipple.value?.[0]?.play(), undefined, '<0.1')
})

const skipToEnd = () => {
  timeline?.progress(1)
}

onUnmounted(() => {
  timeline?.kill()
})
</script>
<style lang="scss" scoped>
.view-victory {
  margin: auto;
  width: 90%;
  max-width: 52rem;
}

hr {
  border: none;
  margin: 2rem 0;
  border-top: 0.1rem solid var(--text-color);
}

.leaderboard {
  padding: 0;
  list-style: none;
}

.row {
  gap: 1.4rem;
  display: flex;
  position: relative;
  align-items: center;
  padding: 0.8rem 1rem;
  border-radius: 0.6rem;

  &.own-player {
    border-left: 0.5rem solid var(--warm-sand);
  }
}

.pawn {
  width: 2.4rem;
  flex-shrink: 0;
}

.name {
  font-weight: bold;
}

.detail {
  opacity: 0.7;
  margin-left: auto;
}

.winner-ripple {
  top: 50%;
  left: 2rem;
  width: 12rem;
  height: 12rem;
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
</style>
