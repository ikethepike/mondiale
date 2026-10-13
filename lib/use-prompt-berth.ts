import type { Ref } from 'vue'
import { useEdgeBerth } from '~~/lib/use-edge-berth'

/**
 * The header-side sibling of `useFooterBerth`: reserve the band down to the
 * prompt's bottom edge, so a subject framed edge to edge on the vertical axis
 * never stands under the title pills. `active` drops the claim — a reveal
 * that reframes to its own subject, a briefing with no prompt on screen.
 */
export const usePromptBerth = (
  prompt: Ref<HTMLElement | undefined>,
  active: () => boolean = () => true,
  key = 'prompt'
) => useEdgeBerth(prompt, 'top', active, key)
