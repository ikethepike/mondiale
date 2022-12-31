<template>
  <main>
    <article class="intro pane tr tl decorator-bottom">
      <form :action="`/room/${roomName}`">
        <header>
          <a class="logo" />
          <p>A world of facts and figures.</p>
        </header>

        <VariantPicker />

        <nav>
          <ButtonLine>Configure</ButtonLine>
          <ButtonFilled>Start Game →</ButtonFilled>
        </nav>
      </form>
    </article>
  </main>
</template>
<script lang="ts" setup>
import randomWords from 'random-words'

const roomName = ref(randomWords({ exactly: 3, join: '-' }))
</script>
<style lang="scss" scoped>
main {
  display: flex;
  min-height: 100vh;
}
.intro {
  width: 40rem;
  margin: auto;
  max-width: 100%;
}
.logo {
  width: 100%;
  height: 4rem;
  display: block;
  background: black;
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}
</style>
