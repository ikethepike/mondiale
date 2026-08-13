import { onBeforeUnmount, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'
import { NIGHT_CHROME, setChromeTint } from '~~/lib/chrome-tint'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Nightfall for the nocturne modes (City Nocturne, the Star Chart): the body
 * class that restyles every real map path (templates/_nocturne-night.scss), the
 * browser-chrome tint that matches it, and the spotlight class on the countries
 * the round is lighting.
 *
 * The one home for all three. A mode that added the class itself would drift
 * from the skin that reads it, and — worse — could leave the app dark: the
 * daybreak here is bound to the consumer's unmount, so an early return, a
 * router jump or a director cut can never strand the night on screen.
 *
 * `spotlight` is reactive: hand it the found countries and each one lights as
 * it lands. Classes are tracked so the composable only ever removes what it
 * stamped — the map engine owns those paths the rest of the time.
 *
 * `held` freezes the camera for the round (no pan, no zoom). It suits a mode
 * that frames ONE subject and wants it to stay put; a mode whose subjects are
 * scattered worldwide must leave it off, or its own answers stay too small to
 * read.
 */
export const useNocturne = (
  spotlight?: MaybeRefOrGetter<readonly ISOCountryCode[]>,
  options: { held?: boolean } = {}
) => {
  const SPOTLIGHT_CLASS = 'nocturne-target'
  // A ref, not a plain flag: the spotlight effect READS it, and a non-reactive
  // read would leave the stamps waiting on the next spotlight change instead of
  // landing the moment night falls.
  const night = ref(false)
  let stamped: Element[] = []

  const clearSpotlight = () => {
    for (const path of stamped) path.classList.remove(SPOTLIGHT_CLASS)
    stamped = []
  }

  const nightfall = () => {
    if (night.value) return
    night.value = true
    document.body.classList.add('nocturne-night')
    if (options.held) document.body.classList.add('nocturne-held')
    setChromeTint(NIGHT_CHROME)
  }

  const daybreak = () => {
    if (!night.value) return
    night.value = false
    document.body.classList.remove('nocturne-night')
    // Removed unconditionally, like the night itself: a mode that stranded
    // this class would leave the map inert for every round after it.
    document.body.classList.remove('nocturne-held')
    setChromeTint()
    clearSpotlight()
  }

  // Re-runs on every spotlight change AND repeats the query each time: the map
  // paths are rendered by a component that can remount under us (a camera
  // recede, a variant swap), so a cached NodeList would stop matching.
  watchEffect(() => {
    const wanted = toValue(spotlight) ?? []
    if (!night.value || !wanted.length) return clearSpotlight()
    clearSpotlight()
    for (const isoCode of wanted) {
      const path = document.querySelector(`.game-map path[data-id][id="${isoCode}"]`)
      if (!path) continue
      path.classList.add(SPOTLIGHT_CLASS)
      stamped.push(path)
    }
  })

  onBeforeUnmount(daybreak)

  return { nightfall, daybreak }
}
