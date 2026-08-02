import { ref, toValue, watchEffect, type MaybeRefOrGetter, type Ref } from 'vue'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'

/**
 * The one way a lyric-wall file reaches a view — the anthem round's backdrop,
 * the scorecard's couplet and the tongue round's written sample all load
 * through here rather than three hand-rolled `watchEffect`s.
 *
 * A miss is silent (`undefined`): every consumer degrades to running without
 * a wall, exactly as rounds did before lyrics existed.
 *
 * The stale-flag matters: the url re-fires per round, and without it a slow
 * response for round N could land AFTER round N+1's and overwrite it — the
 * classic async-watchEffect race. `onCleanup` runs before each re-fire, so a
 * superseded request's result is dropped on the floor.
 */
export const useAnthemLyrics = (
  url: MaybeRefOrGetter<string | undefined>
): Ref<AnthemLyrics | undefined> => {
  const lyrics = ref<AnthemLyrics>()

  watchEffect(async onCleanup => {
    let stale = false
    onCleanup(() => {
      stale = true
    })

    const target = toValue(url)
    if (!target) {
      lyrics.value = undefined
      return
    }

    const fetched = await $fetch<AnthemLyrics>(target).catch(() => undefined)
    if (!stale) lyrics.value = fetched
  })

  return lyrics
}
