<template>
  <main>
    <article class="page pane tr tl decorator-bottom">
      <div class="pane-content">
        <!-- The same wordmark-as-home-link the /version route carries, so a
             standalone page always has a way back that is not the foot of it. -->
        <NuxtLink to="/" class="wordmark" aria-label="Mondiale — back to the start" />

        <slot />

        <nav>
          <ButtonLine element="NuxtLink" to="/" class="back-button">
            <div class="button-content">
              <img src="~/assets/icons/arrow-left.svg" alt="" />
              <span>Back to start</span>
            </div>
          </ButtonLine>
        </nav>
      </div>
    </article>
  </main>
</template>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

main {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  min-height: var(--viewport-height);
  position: relative;
  background: transparent;
}

.page {
  width: 46rem;
  max-width: 100%;
  margin: auto;

  @media screen and (min-width: $tablet) {
    margin: 6rem auto;
  }
}

// Masked rather than an <img>: the mark then takes the page's ink colour and
// needs no second asset for a light or dark ground.
.wordmark {
  width: 100%;
  height: 3.2rem;
  display: block;
  opacity: 0.85;
  background: var(--text-color);
  margin-bottom: 2.4rem;
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
  transition: opacity var(--motion-quick);

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
}

nav {
  margin-top: 3rem;
}

.back-button {
  width: 100%;
}
.back-button .button-content {
  width: 100%;
  gap: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
