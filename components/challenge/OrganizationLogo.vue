<template>
  <img
    v-if="src"
    class="organization-logo"
    :src="src"
    :alt="`${OrganizationVector[organization]} emblem`"
    draggable="false"
  />
</template>
<script lang="ts" setup>
import auLogo from '~/assets/logos/organizations/au.svg'
// Rasterized: the Commons vector is a 300-path, gradient-heavy 292KB file
// that makes the challenge view chug
import cstoLogo from '~/assets/logos/organizations/csto.webp'
import euLogo from '~/assets/logos/organizations/eu.svg'
import natoLogo from '~/assets/logos/organizations/nato.svg'
import oecdLogo from '~/assets/logos/organizations/oecd.svg'
import opecLogo from '~/assets/logos/organizations/opec.svg'
import { OrganizationVector } from '~~/types/organization.type'

/**
 * Official emblem for a membership-challenge organization, public-domain
 * SVGs from Wikimedia Commons. The Belt and Road Initiative has no official
 * emblem, so it renders nothing.
 */
const props = defineProps<{ organization: keyof typeof OrganizationVector }>()

const LOGOS: Partial<Record<keyof typeof OrganizationVector, string>> = {
  au: auLogo,
  csto: cstoLogo,
  eu: euLogo,
  nato: natoLogo,
  oecd: oecdLogo,
  opec: opecLogo,
}

const src = computed(() => LOGOS[props.organization])
</script>
<style lang="scss" scoped>
.organization-logo {
  height: 4.4rem;
  max-width: 16rem;
  display: block;
  object-fit: contain;
  border-radius: 0.3rem;
}
</style>
