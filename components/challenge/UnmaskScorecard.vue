<template>
  <div class="unmask-scorecard">
    <LeaderReveal v-if="dossier?.reveal" :country="dossier.reveal.country" />
    <span class="eyebrow">Who saw through it</span>
    <PlacementList :rows="rows" :players="players" />
  </div>
</template>
<script lang="ts" setup>
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import PlacementList from '~/components/challenge/PlacementList.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatCompact } from '~~/lib/number'
import { seatLabel } from '~~/lib/player'
import { UNMASK_RUNG_LABELS } from '~~/lib/unmask'
import { useUnmaskDossier } from '~~/lib/use-unmask-dossier'
import type { UnmaskChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAnswer, Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/** The scorecard's answer: the file opened in full, and the table ordered by
 *  how little of it each seat needed. */
const props = defineProps<{
  challenge: UnmaskChallenge
  roundAnswers: Record<string, GroupChallengeAnswer>
  round: Round
  players: Record<string, Player>
  viewerId: string
}>()

const { gameStore } = useClientEvents()
const dossier = useUnmaskDossier(
  () => {
    const index = gameStore.game?.rounds.indexOf(props.round) ?? -1
    return index >= 0 ? index : undefined
  },
  () => 0,
  () => true
)

const rows = computed(() =>
  Object.keys(props.roundAnswers)
    .map(playerId => {
      const rung = props.roundAnswers[playerId]?.unmaskRung
      const scored = props.round.playerTurns[playerId]?.points.scored ?? 0
      return { playerId, rung, scored }
    })
    .sort(
      (a, b) =>
        Number(b.scored > 0) - Number(a.scored > 0) || (a.rung ?? Infinity) - (b.rung ?? Infinity)
    )
    .map(({ playerId, rung, scored }) => {
      const kind = rung ? props.challenge.rungs[rung - 1] : undefined
      return {
        playerId,
        name: seatLabel(props.players, playerId, props.viewerId),
        fate:
          rung === undefined
            ? 'never accused'
            : `${scored > 0 ? 'unmasked' : 'wrong country'} at rung ${rung} of ${props.challenge.rungs.length}${kind ? ` · ${UNMASK_RUNG_LABELS[kind].toLowerCase()}` : ''}`,
        tail: `${formatCompact(scored)} pts`,
      }
    })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.unmask-scorecard {
  display: grid;
  gap: 1.2rem;
  padding: 0 3rem 3rem;

  @media (max-width: $tablet) {
    padding: 0 1.6rem 2rem;
  }

  .eyebrow {
    margin: 0.4rem 0 0;
  }
}
</style>
