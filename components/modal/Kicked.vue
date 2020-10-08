<template>
  <div class="modal-wrapper">
    <a role="button" class="modal-background" @click="closeModal" />

    <article class="modal theme-highlight-background theme-color slide-block">
      <div class="form-content">
        <h1>Sorry bud</h1>
        <p>
          Looks like you were kicked from that game. Try hosting your own or
          joining another game.
        </p>
      </div>

      <button class="line-button" @click="closeModal">Save</button>
    </article>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@nuxtjs/composition-api'

export default defineComponent({
  setup(_, { emit }) {
    const closeModal = () => {
      emit('close')
    }
    return {
      closeModal,
    }
  },
})
</script>
