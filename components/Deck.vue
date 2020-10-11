<template>
  <footer v-if="codes.length" id="player-drawer">
    <button @click="submit">Submit</button>
    <draggable v-model="countries" group="people" class="list">
      <div
        v-for="country in countries"
        :key="country.countryCode"
        :data-country="country.name"
        class="country"
      >
        <div class="flag" v-html="country.flag"></div>
      </div>
    </draggable>
  </footer>
</template>
<script lang="ts">
import draggable from 'vuedraggable'
import { defineComponent } from '@nuxtjs/composition-api'
import { Country, CountryCode } from '~/types/geography'
import { update } from '~/lib/CSE'
import { ExcludesUndefined } from '~/types/generics'

export default defineComponent({
  props: {
    codes: {
      type: Array,
      required: true,
    },
  },
  components: {
    draggable,
  },
  data: (): { countries: Country[] } => ({
    countries: [],
  }),
  watch: {
    codes() {
      const countries: Country[] = this.$store.state.countries
      this.countries = countries.filter((country) =>
        this.codes.includes(country.countryCode)
      )
    },
  },
  methods: {
    submit() {
      update({
        event: 'submit-country-order',
        order: this.countries
          .map((country) => country.countryCode as CountryCode)
          .filter((Boolean as any) as ExcludesUndefined),
      })
    },
  },
})
</script>
<style scoped>
#player-drawer {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 20vh;
  position: fixed;
  max-height: 20rem;
}
.list {
  width: 100%;
  height: 20rem;
  display: flex;
  align-items: stretch;
}
.country {
  width: 20%;
  overflow: hidden;
  position: relative;
}
.flag {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  position: absolute;
}
</style>
