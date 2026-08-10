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
  const found = computed(() => guesses.value.filter(isoCode => answerSet.value.has(isoCode)))

  // Tint guesses on the map as they land — right ones mint, wrong ones red.
  watchEffect(() => {
    const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
    for (const isoCode of guesses.value) {
      tints[isoCode] = answerSet.value.has(isoCode) ? 'optimal' : 'stray'
    }
    options.decorate?.(tints, guesses.value)
    gameStore.map.tints = tints
  })

  const submitRound = () => {
    if (submitted.value) return
    gameStore.map.status =
      found.value.length >= (toValue(options.answers).length || Infinity) ? 'correct' : undefined
    submitOnce([...guesses.value])
  }

  const start = () => {
    begin({ onTimeout: submitRound })
    nextTick(() => options.focusInput?.())
  }

  const onGuess = (country: Country) => {
    if (submitted.value || !started.value || !toValue(options.answers).length) return

    const veto = options.reject?.(country)
    if (veto) return announce({ hint: veto })
    if (guesses.value.includes(country.isoCode)) {
      return announce({ hint: `${countryName(country)} is already on the board` })
    }

    guesses.value.push(country.isoCode)
    const correct = answerSet.value.has(country.isoCode)
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
