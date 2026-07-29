import { readonly, ref } from 'vue'

/**
 * The browser chrome's scene tint. iOS Safari fills the band under its URL
 * bar from the page background and the `theme-color` meta — the one lever a
 * non-scrolling shell has over that edge (real content can't render there;
 * the reverted lvh attempt's lessons live in ModalWrapper.vue). The layout
 * owns the meta and binds it to this ref; scene owners call the setter where
 * they already toggle their body classes. JS needs the literal colors: day
 * is `milk()` in rules/_ink.scss (mirrored in site.webmanifest), night is
 * `--night-page` in rules/_palette.scss.
 */
export const DAY_CHROME = 'hsl(36, 100%, 98%)'
export const NIGHT_CHROME = 'hsl(216, 50%, 7%)'

const tint = ref(DAY_CHROME)

/** Bare call restores day — unmount paths need no color of their own. */
export const setChromeTint = (color: string = DAY_CHROME): void => {
  tint.value = color
}

export const useChromeTint = () => readonly(tint)
