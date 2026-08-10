import { onBeforeUnmount, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'
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
 */
export const useNocturne = (spotlight?: MaybeRefOrGetter<readonly ISOCountryCode[]>) => {
  const SPOTLIGHT_CLASS = 'nocturne-target'
  let night = false
  let stamped: Element[] = []

  const clearSpotlight = () => {
    for (const path of stamped) path.classList.remove(SPOTLIGHT_CLASS)
    stamped = []
  }

  const nightfall = () => {
    if (night) return
    night = true
    document.body.classList.add('nocturne-night')
    setChromeTint(NIGHT_CHROME)
  }

  const daybreak = () => {
    if (!night) return
    night = false
    document.body.classList.remove('nocturne-night')
    setChromeTint()
    clearSpotlight()
  }

  // Re-runs on every spotlight change AND repeats the query each time: the map
  // paths are rendered by a component that can remount under us (a camera
  // recede, a variant swap), so a cached NodeList would stop matching.
  watchEffect(() => {
    const wanted = toValue(spotlight) ?? []
    if (!night || !wanted.length) return clearSpotlight()
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
