import { inject, provide, type InjectionKey } from 'vue'

const SPENT_INTERSTITIAL: InjectionKey<boolean> = Symbol('spent-interstitial')

/** The clock this view's interstitial fronts was already running at mount (a
 *  refresh mid-question): the card dismisses itself the way it does in the
 *  booth, so the view's own `done` wiring still runs. */
export const provideSpentInterstitial = (spent: boolean) => provide(SPENT_INTERSTITIAL, spent)

export const useSpentInterstitial = (): boolean => inject(SPENT_INTERSTITIAL, false)
