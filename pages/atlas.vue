<template>
  <div class="atlas-harness">
    <LazyGameMap class="atlas-map" :highlight-country="selected?.isoCode" :tints="tints" labels />

    <div v-if="!selected" class="hint">
      <p>Dynamic atlas — tap any country to explore its facts &amp; leader.</p>
    </div>

    <AtlasCard v-if="selected" :country="selected" @close="clear" @select="select" />
  </div>
</template>
<script lang="ts" setup>
import AtlasCard from '~/components/atlas/AtlasCard.vue'
import { getCountry } from '~~/lib/country'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import type { MapTint } from '~~/store/game.store'

// Standalone harness for the atlas view — no game needed. Mounts the real map
// and the AtlasCard, wired through the same `mapClick` document event the live
// atlas uses, so clicks + camera fly-in behave exactly as in-game.
const chosen = ref<ISOCountryCode>()
const selected = computed(() => (chosen.value ? getCountry(chosen.value) : undefined))

// Softly glow the currently-inspected country.
const tints = computed<{ [iso in ISOCountryCode]?: MapTint }>(() =>
  chosen.value ? { [chosen.value]: 'optimal' } : {}
)

const select = (iso: ISOCountryCode) => {
  chosen.value = iso
}
const clear = () => {
  chosen.value = undefined
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (isValidISOCode(event.detail.isoCode)) select(event.detail.isoCode)
}

onMounted(() => document.addEventListener('mapClick', onMapClick))
onBeforeUnmount(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
.atlas-harness {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--sour-milk, #fffaf5);
}

.atlas-map {
  width: 100%;
  height: 100%;
}

.hint {
  position: fixed;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.8rem 1.6rem;
  border-radius: 999px;
  background: hsla(0, 0%, 100%, 0.7);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.12);
  pointer-events: none;

  p {
    margin: 0;
    font-size: 1.4rem;
    color: var(--dark-blue);
  }
}
</style>
