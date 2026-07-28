<template>
  <form class="guess-form map-caption" @submit.prevent="submitTyped">
    <input
      ref="input"
      v-model="query"
      type="text"
      :role="suggest ? 'combobox' : undefined"
      :placeholder="placeholder"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      :aria-autocomplete="suggest ? 'list' : undefined"
      :aria-expanded="suggest ? suggestions.length > 0 : undefined"
      :aria-controls="suggest ? listId : undefined"
      :aria-activedescendant="highlighted ? optionId(highlighted) : undefined"
      :disabled="disabled"
      @keydown.down.prevent="moveHighlight(1)"
      @keydown.up.prevent="moveHighlight(-1)"
      @keydown.esc="query = ''"
    />
    <ul v-if="suggestions.length" :id="listId" ref="list" class="suggestions" role="listbox">
      <li
        v-for="(suggestion, index) in suggestions"
        :id="optionId(suggestion)"
        :key="suggestion.id"
        role="option"
        :aria-selected="index === highlightedIndex"
        :class="{ highlighted: index === highlightedIndex }"
        @mousedown.prevent="pick(suggestion)"
      >
        <span class="suggestion-name">{{ suggestion.name }}</span>
      </li>
    </ul>
  </form>
</template>
<script lang="ts" setup>
import { clamp } from '~~/lib/number'
import { editDistance, normalizeAnswer } from '~~/lib/strings'

/**
 * CountryGuessInput's sibling for every other register: a typed guess box
 * with live suggestions over a caller-supplied option list (water features,
 * the empire register…), keyboard and pointer selection. Matching is by the
 * caller's normalizer over the display name and any aliases; anything the
 * filter can't place falls out as a `miss` so views can run their own
 * forgiving fallback. Consoles restyle it through the same `.guess-form` /
 * `.suggestions` hooks as the country box.
 *
 * `suggest: false` keeps the box blind — no dropdown to fish from (recall
 * rounds like Unique or Bust) — while submits stay forgiving: normalized
 * exact matches land, and a length-scaled typo budget catches near-misses.
 */
export interface SuggestOption {
  id: string
  name: string
  /** Accepted alternate names — matched, never displayed. */
  aliases?: string[]
}

const props = defineProps({
  options: {
    type: Array as PropType<SuggestOption[]>,
    required: true,
  },
  placeholder: {
    type: String,
    default: 'Type a name…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Domain normalizer applied to the query and every candidate name. */
  normalize: {
    type: Function as PropType<(value: string) => string>,
    default: (value: string) => normalizeAnswer(value),
  },
  /** Show the live suggestion list. Off = type from memory, submit to find out. */
  suggest: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{ pick: [option: SuggestOption]; miss: [input: string] }>()

const query = ref('')
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()

const listId = useId()
const optionId = (option: SuggestOption) => `${listId}-${option.id}`

const keyed = computed(() =>
  props.options.map(option => ({
    option,
    keys: [option.name, ...(option.aliases ?? [])].map(props.normalize),
  }))
)

const suggestions = computed(() => {
  if (props.disabled || !props.suggest) return []
  const needle = props.normalize(query.value)
  if (!needle) return []
  const hits = keyed.value.filter(({ keys }) => keys.some(key => key.includes(needle)))
  // Names that start with the typed text surface above mid-word matches.
  return hits
    .sort((a, b) => {
      const aLeads = a.keys.some(key => key.startsWith(needle))
      const bLeads = b.keys.some(key => key.startsWith(needle))
      return Number(bLeads) - Number(aLeads)
    })
    .slice(0, 6)
    .map(({ option }) => option)
})

// The anchored highlight (CountryGuessInput's contract): pinned to an option,
// not a slot, so a list reshuffle under the cursor can't silently commit a
// different answer on Enter. Typing clears the anchor back to the best match.
const chosenId = ref<string>()
watch(query, () => (chosenId.value = undefined))
watch(suggestions, current => {
  if (!current.some(option => option.id === chosenId.value)) {
    chosenId.value = current[0]?.id
  }
})

const highlightedIndex = computed(() => {
  const index = suggestions.value.findIndex(option => option.id === chosenId.value)
  return index === -1 ? 0 : index
})
const highlighted = computed<SuggestOption | undefined>(
  () => suggestions.value[highlightedIndex.value]
)

const moveHighlight = (delta: number) => {
  const current = suggestions.value
  if (!current.length) return
  const index = clamp(highlightedIndex.value + delta, 0, current.length - 1)
  chosenId.value = current[index].id
}

watch(highlightedIndex, index =>
  nextTick(() => list.value?.children[index]?.scrollIntoView({ block: 'nearest' }))
)

const pick = (option: SuggestOption) => {
  query.value = ''
  emit('pick', option)
}

/** Typo forgiveness for submits the list can't anchor (suggestions off, or
 *  no substring hit): the same length-scaled budget as country search —
 *  short words earn no edits, so prefix-fishing never lands. */
const fuzzyMatch = (needle: string): SuggestOption | undefined => {
  const budget = needle.length >= 7 ? 2 : needle.length >= 4 ? 1 : 0
  if (!budget) return undefined
  let best: { option: SuggestOption; distance: number } | undefined
  for (const { option, keys } of keyed.value) {
    for (const key of keys) {
      const distance = editDistance(needle, key, budget)
      if (distance <= budget && (!best || distance < best.distance)) {
        best = { option, distance }
      }
    }
  }
  return best?.option
}

const submitTyped = () => {
  if (!query.value.trim()) return
  const needle = props.normalize(query.value)
  const exact = keyed.value.find(({ keys }) => keys.some(key => key === needle))?.option
  const choice = exact ?? highlighted.value ?? fuzzyMatch(needle)
  if (!choice) {
    emit('miss', query.value)
    return
  }
  pick(choice)
}

defineExpose({ focus: () => input.value?.focus() })
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.guess-form {
  width: 34rem;
  max-width: 84vw;
  position: relative;
  // Own stacking context above sibling chrome (timer tracks, footers) so the
  // suggestions always paint on top rather than behind them.
  z-index: 10;
  pointer-events: auto;
  padding: 0.6rem;

  input {
    width: 100%;
    border: none;
    outline: none;
    background: none;
    font-size: 2.2rem;
    text-align: center;
    font-family: inherit;
    color: var(--dark-blue);

    &::placeholder {
      opacity: 0.45;
      color: var(--dark-blue);
    }
  }
}

.suggestions {
  left: 0;
  right: 0;
  top: 100%;
  margin: 0.6rem 0 0;
  padding: 0.4rem;
  list-style: none;
  position: absolute;
  // Cap and scroll rather than run off short screens; dvh tracks the visual
  // viewport when the software keyboard is up.
  max-height: min(32rem, 35vh);
  max-height: min(32rem, 35dvh);
  overflow-y: auto;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.94);
  border: 0.1rem solid ink(0.2);

  li {
    gap: 1rem;
    display: flex;
    cursor: pointer;
    align-items: center;
    border-radius: 0.8rem;
    padding: 0.5rem 0.9rem;
    color: var(--dark-blue);

    &.highlighted,
    &:active {
      background: hsla(197.6, 51.2%, 41.8%, 0.12);
    }
    @media (hover: hover) {
      &:hover {
        background: hsla(197.6, 51.2%, 41.8%, 0.12);
      }
    }
  }
}

.suggestion-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
