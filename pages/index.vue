<template>
  <main>
    <article class="intro pane tr tl decorator-bottom">
      <form @submit.prevent="onSubmit" :action="`/room/${roomName}`">
        <header class="pane-content">
          <a class="logo" />
          <p>A world of facts and figures.</p>
        </header>

        <VariantPicker />

        <nav class="pane-content">
          <ButtonLine element="NuxtLink" :to="`/about`" class="about-button">About</ButtonLine>
          <ButtonFilled class="start-button">
            <div class="button-content">
              <span>Create Game</span>
              <img src="~/assets/icons/arrow-right.svg" />
            </div>
          </ButtonFilled>
        </nav>
      </form>
    </article>
  </main>
</template>
<script lang="ts" setup>
import randomWords from 'random-words'
const roomName = ref(randomWords({ exactly: 3, join: '-' }))
const router = useRouter()

definePageMeta({
  pageTransition: {
    name: 'start',
  },
})

const onSubmit = (event: Event) => {
  const target = event.target as HTMLFormElement

  let url = new URL(target.action)
  const data = new FormData(target)
  for (const [key, value] of data.entries()) {
    url.searchParams.append(key, value.toString())
  }

  router.push(url.pathname + url.search)
}
</script>
<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';

main {
  width: 100%;
  display: flex;
  min-height: 100vh;
  position: relative;
  background: transparent;
}
.start-leave-active {
  transition: all 1s;
}
.start-leave-to {
  opacity: 0;
  transform: translateY(-100vh);
}

header {
  text-align: center;
}
.intro {
  width: 40rem;
  max-width: 100%;
}
.logo {
  width: 100%;
  height: 4rem;
  display: block;
  background: black;
  margin-bottom: 1rem;
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}

nav {
  gap: 2rem;
  display: flex;
}
.start-button {
  width: 100%;
}
.start-button .button-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
}
.start-button img {
  filter: invert(1);
}

@media screen and (min-width: $laptop) {
  .intro {
    margin: auto;
  }
}
</style>
