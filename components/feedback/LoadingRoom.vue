<template>
  <main class="loading-room">
    <h1 class="wordmark">
      <span class="mark" aria-hidden="true" />
      <span class="visually-hidden">Mondiale</span>
    </h1>
    <p class="status" role="status" aria-live="polite">
      <span class="pulse" aria-hidden="true" />
      Joining room…
    </p>
  </main>
</template>

<style lang="scss" scoped>
.loading-room {
  height: var(--viewport-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  padding: 0 calc(2rem + var(--safe-right)) 0 calc(2rem + var(--safe-left));
}

.wordmark {
  margin: 0;
  width: 100%;
  max-width: 32rem;
}

.mark {
  display: block;
  height: 3.2rem;
  background: var(--text-color);
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}

.status {
  gap: 0.6rem;
  margin: 0;
  display: flex;
  font-size: 1.4rem;
  align-items: center;
  color: var(--dark-blue);
  opacity: 0.75;
}
</style>
