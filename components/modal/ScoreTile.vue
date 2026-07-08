<template>
  <div v-if="country" class="score-tile">
    <!-- A fixed-height stage that fits ANY flag ratio (Finland's 18:11, Nepal's
         pennon, Switzerland's square): the flag is `contain`ed so it's never
         cropped, and a blurred, dimmed copy fills the letterbox gaps so the
         wide frame never looks empty. Mirrors the photo-stage pattern. -->
    <div class="flag-stage">
      <CountryFlag
        class="flag-backdrop"
        :country="country"
        mode="background"
        fit="cover"
        aria-hidden="true"
      />
      <CountryFlag class="flag" :country="country" mode="background" fit="contain" />
    </div>
    <strong class="country-name">{{ countryName(country) }}</strong>
    <p v-if="showAmount && amount">
      <span>{{ formatNumber(amount.amount) }}</span>
      <span>{{ ` ${amount.unit}` }}</span>
    </p>
  </div>
</template>
<script lang="ts" setup>
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { ISOCountryCode } from '~~/types/geography.types'

const { currentRound } = useClientEvents()

const props = defineProps({
  isoCode: {
    type: String as PropType<ISOCountryCode>,
    required: true,
  },
  showAmount: {
    type: Boolean,
    default: true,
  },
})

const amount = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  // Only ranking rounds carry a value accessor — every other round kind
  // (traversal, blitz, silhouette, hot-cold, sketch) renders a bare tile
  if (!challenge || !('id' in challenge)) return undefined

  return getValueByAccessorID(props.isoCode, challenge.id)
})

const country = computed(() => {
  return getCountry(props.isoCode)
})
</script>
<style lang="scss" scoped>
.score-tile {
  display: grid;
  justify-content: stretch;
  grid-template-rows: repeat(2, max-content);
}

// The stage owns the fixed 8rem frame and clips both layers to a box. A soft
// neutral base sits under the backdrop so the letterbox gaps never fall through
// to the page — and so a white-heavy flag (Malta, Japan, Nordic crosses) reads
// as clean negative space rather than a grey smear.
.flag-stage {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 8rem;
  border: 0.1rem solid var(--text-color);
  background: hsla(36, 30%, 90%, 1);
}

// Blurred cover copy that washes the letterbox gaps in the flag's own colours.
// Crucially NOT brightness-dimmed — dimming turned white flag fields into a
// dirty grey haze; a low opacity over the neutral base keeps the wash soft
// without muddying light flags.
.flag-backdrop {
  position: absolute;
  inset: -1.5rem;
  opacity: 0.5;
  filter: blur(1.6rem);
  transform: scale(1.15);
}

// The whole flag, undistorted and never cropped, centered on the stage.
.flag {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
