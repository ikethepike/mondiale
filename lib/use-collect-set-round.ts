import { computed, nextTick, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'
import { countryName } from '~~/lib/country'
import type { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

type GroupRound = Pick<
  ReturnType<typeof useGroupChallenge>,
  'submitted' | 'started' | 'announce' | 'submitOnce' | 'begin' | 'gameStore'
>

/**
 * The collect-a-set blitz round (water blitz, mother tongue, neighbour
 * blitz): type names against the clock, right ones tint mint and wrong ones
 * red, duplicates bounce, the round self-submits when the set completes or
 * the clock dies. Views supply only their answer list, their wrong-guess
 * copy and any extra map dressing.
 */
export const useCollectSetRound = (
  { submitted, started, announce, submitOnce, begin, gameStore }: GroupRound,
  options: {
    /** The full answer set for this round. */
    answers: MaybeRefOrGetter<readonly ISOCountryCode[]>
    /** "X doesn't border Y", "X doesn't speak Z" — the miss copy. */
    wrongHint: (country: Country) => string
    /** What the room's chip calls a wrong guess, when the country's own name
     *  isn't what the player typed. The Star Chart's answers are CITIES that
     *  score as countries, so its ticker must say "Bratislava", not "Slovakia".
     *  Omitted everywhere the guess IS the country (the chip then wears the
     *  flag, resolved from `isoCode` as before). */
    wrongLabel?: (country: Country) => string
    /** Pre-guess veto: return a hint to bounce the pick (e.g. the centre country). */
    reject?: (country: Country) => string | undefined
    /**
     * What a guess ACTUALLY answers, when more than one name resolves to the
     * same answer. Terra Incognita accepts either the country that vanished or
     * the one that swallowed it, so both must count as the same claim — and a
     * repeat of either has to bounce as a duplicate rather than land as a
     * stray. Defaults to the guess itself, which is every other mode.
     */
    resolve?: (isoCode: ISOCountryCode) => ISOCountryCode | undefined
    /** Extra painting per repaint (highlights, endpoints, camera focus). */
    decorate?: (
      tints: { [isoCode in ISOCountryCode]?: MapTint },
      guessed: readonly ISOCountryCode[]
    ) => void
    /** Focus the typing input when the round starts. */
    focusInput?: () => void
  }
) => {
  const guesses = ref<ISOCountryCode[]>([])
  const answerSet = computed(() => new Set(toValue(options.answers)))
  /** What a guess claims — itself, unless the mode aliases several names onto
   *  one answer. */
  const claimOf = (isoCode: ISOCountryCode) => options.resolve?.(isoCode) ?? isoCode
  /** The answers already claimed, so a second name for one reads as a repeat. */
  const claimed = computed(
    () => new Set(guesses.value.map(claimOf).filter(isoCode => answerSet.value.has(isoCode)))
  )
  const found = computed(() => [...claimed.value])

  // Tint guesses on the map as they land — right ones mint, wrong ones red.
  watchEffect(() => {
    const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
    for (const isoCode of guesses.value) {
      const claim = claimOf(isoCode)
      // Paint the answer, not the name: a country named by its absorber tints
      // the hole that closed, which is what the player is looking at.
      tints[answerSet.value.has(claim) ? claim : isoCode] = answerSet.value.has(claim)
        ? 'optimal'
        : 'stray'
    }
    options.decorate?.(tints, guesses.value)
    gameStore.map.tints = tints
  })

  const submitRound = () => {
    if (submitted.value) return
    gameStore.map.status =
      found.value.length >= (toValue(options.answers).length || Infinity) ? 'correct' : undefined
    // Submit what each guess CLAIMED. The server grades the same aliasing from
    // the challenge, so sending the resolved answer keeps the two ends reading
    // one list — and a stray still travels as itself and still costs.
    submitOnce(guesses.value.map(isoCode => claimOf(isoCode)))
  }

  const start = () => {
    begin({ onTimeout: submitRound })
    nextTick(() => options.focusInput?.())
  }

  const onGuess = (country: Country) => {
    if (submitted.value || !started.value || !toValue(options.answers).length) return

    const veto = options.reject?.(country)
    if (veto) return announce({ hint: veto })
    // A repeat is the same CLAIM, not the same name: where a mode accepts two
    // names for one answer, the second must bounce free rather than land as a
    // stray that costs a point.
    const claim = claimOf(country.isoCode)
    if (guesses.value.includes(country.isoCode) || claimed.value.has(claim)) {
      return announce({ hint: `${countryName(country)} is already on the board` })
    }

    guesses.value.push(country.isoCode)
    const correct = answerSet.value.has(claim)
    // Everyone races the same list, so a right name would be a free answer.
    // Only the misses are named; a hit says just that somebody found one.
    announce({
      kind: correct ? 'correct' : 'wrong',
      ...(correct
        ? {}
        : {
            isoCode: country.isoCode,
            ...(options.wrongLabel ? { label: options.wrongLabel(country) } : {}),
            hint: options.wrongHint(country),
            tone: 'alert' as const,
          }),
    })

    // Everything found — no reason to run out the clock
    if (found.value.length === toValue(options.answers).length) {
      gameStore.map.status = 'correct'
      submitRound()
    }
  }

  return { guesses, answerSet, found, submitRound, start, onGuess }
}
