<template>
  <form class="guess-form map-caption" @submit.prevent="submitTyped">
    <input
      ref="input"
      v-model="query"
      type="text"
      role="combobox"
      :placeholder="placeholder"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="suggestions.length > 0"
      :aria-controls="listId"
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
        :key="suggestion.isoCode"
        role="option"
        :aria-selected="index === highlightedIndex"
        :class="{ highlighted: index === highlightedIndex }"
        @mousedown.prevent="pick(suggestion)"
      >
        <CountryFlag class="suggestion-flag" :country="suggestion" mode="background" />
        <span class="suggestion-name">{{ countryName(suggestion) }}</span>
        <span v-if="localCountryName(suggestion)" class="suggestion-local">
          {{ localCountryName(suggestion) }}
        </span>
      </li>
    </ul>
  </form>
</template>
<script lang="ts" setup>
import {
  countryName,
  findCountryByName,
  localCountryName,
  searchCountriesByName,
} from '~~/lib/country'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import CountryFlag from './CountryFlag.vue'

/**
 * The typed country guess box: live suggestions with local-language names,
 * forgiving name matching (case, diacritics, aliases, typos), keyboard and
 * pointer selection.
 */
const props = defineProps({
  placeholder: {
    type: String,
    default: 'Type a country…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** ISO codes to leave out of the suggestions (already guessed, endpoints…). */
  excluded: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
})

const emit = defineEmits<{ guess: [country: Country]; miss: [input: string] }>()

const query = ref('')
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()

const listId = useId()
const optionId = (country: Country) => `${listId}-${country.isoCode}`

const suggestions = computed(() => {
  if (props.disabled) return []
  return searchCountriesByName(query.value, 6, new Set(props.excluded))
})

/**
 * The highlight is anchored to a country, not a slot: when the list shifts
 * under the cursor (an `excluded` update lands, results reorder), the
 * selection stays on the same country instead of silently becoming another.
 * Typing clears the anchor, so the highlight returns to the best match.
 */
const chosenIso = ref<ISOCountryCode>()
watch(query, () => (chosenIso.value = undefined))

const highlightedIndex = computed(() => {
  const index = suggestions.value.findIndex(country => country.isoCode === chosenIso.value)
  return index === -1 ? 0 : index
})
const highlighted = computed<Country | undefined>(() => suggestions.value[highlightedIndex.value])

const moveHighlight = (delta: number) => {
  const options = suggestions.value
  if (!options.length) return
  const index = Math.max(0, Math.min(highlightedIndex.value + delta, options.length - 1))
  chosenIso.value = options[index].isoCode
}

// The list scrolls once it caps out at 40vh — keep the highlight in view
watch(highlightedIndex, index =>
  nextTick(() => list.value?.children[index]?.scrollIntoView({ block: 'nearest' }))
)

const pick = (country: Country) => {
  query.value = ''
  emit('guess', country)
}

const submitTyped = () => {
  if (!query.value.trim()) return
  const direct = findCountryByName(query.value)
  const country = direct ?? highlighted.value
  if (!country) {
    emit('miss', query.value)
    return
  }
  pick(country)
}

defineExpose({ focus: () => input.value?.focus() })
</script>
<style lang="scss" scoped>
.guess-form {
  width: 34rem;
  max-width: 84vw;
  position: relative;
  // Own stacking context above sibling chrome (timer tracks, footers) so the
  // downward-opening suggestions always paint on top rather than behind them.
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
  // On short screens the full list can still exceed the space below the input;
  // cap it and let it scroll rather than run off the bottom of the viewport.
  // dvh tracks the visual viewport when the software keyboard is up.
  max-height: min(32rem, 35vh);
  max-height: min(32rem, 35dvh);
  overflow-y: auto;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.94);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);

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

.suggestion-flag {
  width: 2.8rem;
  height: 1.9rem;
  flex-shrink: 0;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.suggestion-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.suggestion-local {
  opacity: 0.55;
  min-width: 0;
  overflow: hidden;
  font-size: 0.8em;
  margin-left: auto;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
