<template>
  <form class="guess-form map-caption" @submit.prevent="submitTyped">
    <input
      ref="input"
      v-model="query"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      :disabled="disabled"
      @keydown.down.prevent="
        highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1)
      "
      @keydown.up.prevent="highlightedIndex = Math.max(highlightedIndex - 1, 0)"
    />
    <ul v-if="suggestions.length" class="suggestions">
      <li
        v-for="(suggestion, index) in suggestions"
        :key="suggestion.isoCode"
        :class="{ highlighted: index === highlightedIndex }"
        @mousedown.prevent="pick(suggestion)"
      >
        <CountryFlag class="suggestion-flag" :country="suggestion" mode="background" />
        <span>{{ countryName(suggestion) }}</span>
      </li>
    </ul>
  </form>
</template>
<script lang="ts" setup>
import { countryName, findCountryByName, searchCountriesByName } from '~~/lib/country'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import CountryFlag from './CountryFlag.vue'

/**
 * The typed country guess box: live suggestions, forgiving name matching
 * (case, diacritics, aliases), keyboard and pointer selection.
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
const highlightedIndex = ref(0)
const input = ref<HTMLInputElement>()

const suggestions = computed(() => {
  if (props.disabled) return []
  const taken = new Set(props.excluded)
  return searchCountriesByName(query.value, 8)
    .filter(country => !taken.has(country.isoCode))
    .slice(0, 6)
})

watch(suggestions, () => (highlightedIndex.value = 0))

const pick = (country: Country) => {
  query.value = ''
  emit('guess', country)
}

const submitTyped = () => {
  const direct = findCountryByName(query.value)
  const highlighted = suggestions.value[highlightedIndex.value] ?? suggestions.value[0]
  const country = direct ?? highlighted
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
  max-height: 40vh;
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
    &:hover {
      background: hsla(197.6, 51.2%, 41.8%, 0.12);
    }
  }
}

.suggestion-flag {
  width: 2.8rem;
  height: 1.9rem;
  flex-shrink: 0;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}
</style>
