import { computed, shallowRef, watch } from 'vue'
import {
  BOARD_FACT_TUNING,
  loadBoardFacts,
  pickBoardFact,
  type BoardFact,
} from '~~/lib/board-facts'
import {
  lastOneNews,
  seatSetback,
  tableClock,
  tableNews,
  tableWaitingOn,
  turnRecap,
} from '~~/lib/board-feed'
import { useClientEvents } from '~~/lib/events/client-side'
import { DWELL } from '~~/lib/motion'
import { latestRound, roundFeaturedCountry } from '~~/lib/rounds'
import { useServerNow } from '~~/lib/use-server-now'
import type { Player } from '~~/types/player.type'
import type { SeatCursor } from '~~/types/seat.types'

export type BoardHeadline = 'setback' | 'waiting' | 'done'

export interface AsideLine {
  id: string
  kind: 'recap' | 'news' | 'fact'
  kicker: string
  text: string
  source?: string
  /** The seat a news line is about, for its pawn colour. */
  color?: string
  /** How long the line holds; absent while it holds until something replaces it. */
  dwellMs?: number
}

const NEWS_QUEUE_CAP = 3

/**
 * The settled seat's caption: a headline derived from the snapshot and the
 * server clock alone, and an aside that runs your recap, then the table's
 * news as it happens, then fun facts — one line at a time.
 */
export const useBoardFeed = () => {
  const { game, gameStore } = useClientEvents()
  const { now } = useServerNow()

  const seat = computed(() => game.value?.players[gameStore.seatId])
  const settled = computed(() => seat.value?.cursor.step === 'settled')
  const waiting = computed(() =>
    game.value && settled.value ? tableWaitingOn(game.value, gameStore.seatId) : []
  )
  const setback = computed(() =>
    game.value ? seatSetback(game.value, gameStore.seatId) : undefined
  )
  const clock = computed(() => tableClock(waiting.value, now.value))

  const headline = computed<BoardHeadline | undefined>(() => {
    if (!settled.value) return undefined
    if (setback.value && now.value < setback.value.until) return 'setback'
    return waiting.value.length ? 'waiting' : 'done'
  })

  const facts = shallowRef<BoardFact[]>([])
  loadBoardFacts().then(
    deck => (facts.value = deck),
    () => undefined
  )

  const aside = shallowRef<AsideLine>()
  let shownAt = 0
  let until = Number.POSITIVE_INFINITY
  let factsThisWait = 0
  const news: (AsideLine & { at: number })[] = []

  const show = (line: AsideLine | undefined) => {
    aside.value = line
    shownAt = now.value
    until = line?.dwellMs ? now.value + line.dwellMs : Number.POSITIVE_INFINITY
  }

  const recap = (dwellMs?: number): AsideLine | undefined => {
    const text = game.value ? turnRecap(game.value, gameStore.seatId) : undefined
    return text
      ? { id: `recap:${now.value}`, kind: 'recap', kicker: 'Your turn', text, dwellMs }
      : undefined
  }

  const takeNews = (): AsideLine | undefined => {
    const shelfLife = DWELL.tableNews * NEWS_QUEUE_CAP
    while (news.length && now.value - news[0]!.at > shelfLife) news.shift()
    return news.shift()
  }

  const nextFact = (): AsideLine | undefined => {
    const board = gameStore.board
    if (board.factsHidden || !game.value) return undefined
    const focus = factsThisWait
      ? undefined
      : roundFeaturedCountry(latestRound(game.value)?.groupChallenge)
    const context = { rules: game.value, recent: board.factFamilies, focus }
    let fact = pickBoardFact(facts.value, { ...context, seen: new Set(board.factsSeen) })
    if (!fact && board.factsSeen.length) {
      board.factsSeen = []
      fact = pickBoardFact(facts.value, { ...context, seen: new Set() })
    }
    if (!fact) return undefined
    board.factsSeen.push(fact.id)
    board.factFamilies = [...board.factFamilies, fact.family].slice(-BOARD_FACT_TUNING.familyMemory)
    factsThisWait++
    return {
      id: `fact:${fact.id}`,
      kind: 'fact',
      kicker:
        focus && fact.countries.includes(focus) ? `From this round · ${fact.kicker}` : fact.kicker,
      text: fact.text,
      source: fact.source,
      dwellMs: DWELL.fact,
    }
  }

  const advance = () => show(takeNews() ?? nextFact() ?? recap())

  watch(now, () => {
    if (headline.value !== 'waiting') return
    const current = aside.value
    if (!current) {
      const opening = recap(DWELL.recap)
      return opening ? show(opening) : advance()
    }
    if (news.length && current.kind !== 'news' && now.value - shownAt >= DWELL.asideFloor) {
      const fresh = takeNews()
      if (fresh) return show(fresh)
    }
    if (now.value >= until) advance()
  })

  watch(
    () => (settled.value ? seat.value?.cursor.seq : undefined),
    () => {
      aside.value = undefined
      factsThisWait = 0
    }
  )

  const queueNews = (player: Player, text: string) => {
    news.push({
      id: `news:${player.id}:${player.cursor.seq}`,
      kind: 'news',
      kicker: 'At the table',
      text,
      color: player.color,
      dwellMs: DWELL.tableNews,
      at: now.value,
    })
    if (news.length > NEWS_QUEUE_CAP) news.shift()
  }

  let previous = new Map<string, SeatCursor>()
  watch(
    () =>
      Object.values(game.value?.players ?? {})
        .map(player => `${player?.id}:${player?.cursor.seq}`)
        .join(),
    () => {
      const table = Object.values(game.value?.players ?? {}).filter(
        (player): player is Player => !!player
      )
      for (const player of table) {
        if (player.id === gameStore.seatId) continue
        const text = tableNews(previous.get(player.id), player, table)
        if (text) queueNews(player, text)
      }
      previous = new Map(table.map(player => [player.id, { ...player.cursor }]))
    },
    { immediate: true }
  )

  watch(
    () => waiting.value.length,
    (count, before) => {
      const last = waiting.value[0]
      if (count === 1 && before !== 1 && last) queueNews(last, lastOneNews(last))
    }
  )

  const factsHidden = computed(() => gameStore.board.factsHidden)
  const toggleFacts = () => {
    const board = gameStore.board
    board.factsHidden = !board.factsHidden
    const stale = board.factsHidden ? 'fact' : 'recap'
    if (aside.value?.kind === stale) advance()
  }

  const watchSeat = (playerId: string) => {
    gameStore.board.spectateTargetId = playerId
  }

  return { headline, waiting, setback, clock, aside, factsHidden, toggleFacts, watchSeat }
}
