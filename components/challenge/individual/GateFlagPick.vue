<template>
  <!-- Which flag belongs to X? `flag-twins` is the same question with
       palette-identical decoys, so it shares this view and only changes the
       framing and the plate size. -->
  <h1 class="map-caption">
    {{
      twins
        ? `Which of these is ${countryName(challenge.country)}?`
        : `Which flag belongs to ${countryName(challenge.country)}?`
    }}
  </h1>
  <span v-if="twins" class="map-caption sub">They all share the same colours — look closely.</span>
  <div class="gate-options" :class="twins ? 'twin-options' : 'flag-options'">
    <button
      v-for="option in challenge.options"
      :key="option"
      class="gate-option"
      :class="twins ? 'twin-option' : 'flag-option'"
      type="button"
      @click="submitAnswer(option)"
    >
      <CountryFlag
        :class="twins ? 'twin-flag' : 'option-flag'"
        :country="getCountry(option)"
        :mode="twins ? 'inline' : 'background'"
      />
    </button>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

defineProps<{ challenge: IndividualChallenge }>()

const { variant, submitAnswer } = useGateChallenge()
const twins = computed(() => variant.value === 'flag-twins')
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The flag box derives its width from its 3:2 aspect-ratio + fixed height, so
// it's narrower than the card — center it rather than letting it sit left.
.flag-option {
  display: flex;
  align-items: center;
  justify-content: center;

  .option-flag {
    height: 11rem;
    border: 0.1rem solid ink(0.25);
  }
}

// Palette twins: large inline flags so the subtle differences (stripe order, a
// crescent, an emblem) are what the eye resolves.
.twin-options {
  grid-template-columns: repeat(2, minmax(18rem, 26rem));
}

.twin-option {
  padding: 0.8rem;

  .twin-flag {
    width: 100%;
    aspect-ratio: 3 / 2;
    border-radius: 0.4rem;
    box-shadow: 0 0 0 1px ink(0.2);
  }
}

@media (max-width: $tablet) {
  .twin-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .flag-option .option-flag {
    height: 9rem;
  }
}
</style>
