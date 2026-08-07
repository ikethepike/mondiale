/**
 * The individual gate's shared scaffolding — `useGroupChallenge`'s sibling for
 * the solo blocking challenges.
 *
 * ViewIndividualChallenge is the shell: it owns the interstitial, the prompt,
 * the result beat and the map berth, and dispatches one `Gate*` component per
 * variant. Everything both halves need lives here, provided once by the shell
 * and injected by whichever gate is on stage.
 *
 * `gateSeq` is the reason this exists. Keying the variant component on it means
 * a back-to-back gate REMOUNTS its view, so every clock, hint and counter
 * resets by construction. The shell used to reset them by hand, one `if
 * (timer) clearInterval(timer)` per variant, and every new mode had to
 * remember to add its own.
 */
import { computed, inject, provide, ref, toRef, type InjectionKey, type Ref } from 'vue'
import type {
  DuelOutcome,
  IndividualChallenge,
  IndividualChallengeVariant,
  TrendDuelOutcome,
} from '~~/types/challenges/individual-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import { isCorrectIndividualAnswer } from './challenges'
import { getCountry } from './country'
import { useClientEvents } from './events/client-side'
import { isEasyMode, isHardMode } from './game-rules'
import { gateLeapSteps, gatePot } from './scoring'

export interface GateSubmitOptions {
  /** Skip the map reveal zoom — the duel gates paint their own board first. */
  reveal?: boolean
  /** Timed gates: fraction of the clock left, which scales the leap. */
  remainingFraction?: number
  /** Hints bought, each biting `GATE_HINT_BITE_STEPS` off the leap. */
  hintsUsed?: number
}

export interface GateChallengeContext {
  challenge: Ref<IndividualChallenge | undefined>
  variant: Ref<IndividualChallengeVariant>
  /** The answer's country record — undefined only before the first deal. */
  country: Ref<Country | undefined>
  /** 'correct' | 'incorrect' once answered; the whole view reads this to
   *  switch from question to result. */
  status: Ref<'correct' | 'incorrect' | undefined>
  isHard: Ref<boolean>
  isEasy: Ref<boolean>
  submittedISOCode: Ref<ISOCountryCode | undefined>
  submittedCountry: Ref<Country | undefined>
  /** Steps the win is about to walk, mirrored from the server's own maths. */
  earnedLeapSteps: Ref<number | undefined>
  /** Bumped on every fresh gate — the variant component's `:key`. */
  gateSeq: Ref<number>
  showInterstitial: Ref<boolean>
  /**
   * A miss line only the variant can phrase ("Norway ranks higher"), set
   * before it submits. One seam instead of a per-variant failure ref on the
   * shell; the shell falls back to its own copy when it's unset.
   */
  missNote: Ref<string | undefined>
  /** Duel ledgers, kept because their reveals outlive the question. */
  duelOutcomes: Ref<DuelOutcome[]>
  trendDuelOutcomes: Ref<TrendDuelOutcome[]>
  submitAnswer: (isoCode: ISOCountryCode, options?: GateSubmitOptions) => void
}

const GATE_CHALLENGE: InjectionKey<GateChallengeContext> = Symbol('gate-challenge')

/**
 * A can't-match token: the ISO a gate submits when its clock runs out.
 *
 * Verified through `isCorrectIndividualAnswer` rather than merely differing
 * from `challenge.country`, because a variant can have more than one right
 * answer. Errata's hard swap accepts EITHER culprit, and its two culprits
 * border each other — so a `{CH, AT}` swap turned "dodge the answer" into
 * "submit the other one", and letting the clock expire won the gate at the
 * full pot.
 *
 * Three candidates is always enough to find a loser: they spend three
 * different currencies (so the shared-currency carve-out can clear at most
 * one) and errata deals at most two culprits.
 */
const GIVE_UP_TOKENS = ['CH', 'AT', 'NZ'] as const

export const wrongTokenFor = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata'>
): ISOCountryCode => GIVE_UP_TOKENS.find(token => !isCorrectIndividualAnswer(challenge, token))!

/** Created ONCE, by ViewIndividualChallenge. `relatch` is the shell's alone —
 *  it is what advances `gateSeq`, and a gate view calling it would remount
 *  itself mid-answer. */
export const provideGateChallenge = (): GateChallengeContext & { relatch: () => void } => {
  const { currentMove, update, gameStore, clearBoard } = useClientEvents()

  const latched = (): IndividualChallenge | undefined =>
    currentMove.value?.challenge?._type === 'individual-challenge'
      ? currentMove.value.challenge
      : undefined

  const challenge = ref(latched())
  const variant = computed<IndividualChallengeVariant>(() => challenge.value?.variant ?? 'find')
  const country = computed(() =>
    challenge.value ? getCountry(challenge.value.country) : undefined
  )
  const status = toRef(gameStore.map, 'status')
  const submittedISOCode = ref<ISOCountryCode>()
  const submittedCountry = computed(() =>
    submittedISOCode.value ? getCountry(submittedISOCode.value) : undefined
  )
  const earnedLeapSteps = ref<number>()
  const gateSeq = ref(0)
  const showInterstitial = ref(true)
  const missNote = ref<string>()
  const duelOutcomes = ref<DuelOutcome[]>([])
  const trendDuelOutcomes = ref<TrendDuelOutcome[]>([])

  const submitAnswer = (isoCode: ISOCountryCode, options: GateSubmitOptions = {}) => {
    // Watch mode: the gates' own timers (outline countdown, zoom-out safety,
    // miss timer) reach here with NO user input, so inert can't block them and
    // the write gate only swallows the emit AFTER this body has mutated local
    // reveal state and the pawn display memory. Same guard as submitOnce in
    // useGroupChallenge — the booth never answers a gate.
    if (gameStore.watching) return
    if (status.value) return
    if (currentMove.value?.challenge?._type === 'final-challenge') return

    submittedISOCode.value = isoCode
    gameStore.map.highlighted.clear()
    update({
      event: 'submit-individual-challenge-answer',
      isoCode,
      remainingFraction: options.remainingFraction,
      hintsUsed: options.hintsUsed,
      gateTile: currentMove.value?.endTile.position,
    })

    const active = currentMove.value?.challenge
    if (active?._type !== 'individual-challenge') return

    const correct = isCorrectIndividualAnswer(active, isoCode)
    if (correct) {
      earnedLeapSteps.value = gateLeapSteps(
        options.remainingFraction,
        options.hintsUsed,
        gatePot(active.variant)
      )
    }
    if (options.reveal !== false) {
      // A shared-currency gate can be won on a country other than the dealt
      // subject — zoom the reveal to the country the player actually got right.
      gameStore.map.reveal = correct ? isoCode : active.country
    }
    gameStore.map.status = correct ? 'correct' : 'incorrect'
  }

  /**
   * Back-to-back gates reach a still-mounted shell (the walk between them is
   * quick). Relatch and bump `gateSeq`; the variant component remounts and its
   * own state goes with it.
   */
  const relatch = () => {
    const next = latched()
    if (!next || next === challenge.value) return
    // Never tear down a result beat in progress — the view unmounts after it.
    if (status.value) return

    challenge.value = next
    clearBoard()
    submittedISOCode.value = undefined
    earnedLeapSteps.value = undefined
    missNote.value = undefined
    duelOutcomes.value = []
    trendDuelOutcomes.value = []
    gateSeq.value++
    showInterstitial.value = true
  }

  const context: GateChallengeContext = {
    challenge,
    variant,
    country,
    status,
    isHard: computed(() => isHardMode(gameStore.game)),
    isEasy: computed(() => isEasyMode(gameStore.game)),
    submittedISOCode,
    submittedCountry,
    earnedLeapSteps,
    gateSeq,
    showInterstitial,
    missNote,
    duelOutcomes,
    trendDuelOutcomes,
    submitAnswer,
  }

  provide(GATE_CHALLENGE, context)
  return { ...context, relatch }
}

/** Injected by every `Gate*` view. Throws rather than silently no-op'ing: a
 *  gate rendered outside the shell would look alive and answer nothing. */
export const useGateChallenge = (): GateChallengeContext => {
  const context = inject(GATE_CHALLENGE)
  if (!context) throw new Error('useGateChallenge must be used inside ViewIndividualChallenge')
  return context
}
