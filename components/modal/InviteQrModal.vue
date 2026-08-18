<template>
  <ModalWrapper class="qr-overlay" @click.self="$emit('close')">
    <article class="pane tl decorator-bottom qr-card">
      <header class="pane-content qr-header">
        <div>
          <span class="eyebrow config-label">Invite</span>
          <h2>Scan to join</h2>
        </div>
        <button
          type="button"
          class="qr-close"
          aria-label="Close invite code"
          title="Close"
          @click="$emit('close')"
        ></button>
      </header>

      <div class="pane-content qr-body">
        <!-- The code is the point, so it gets the whole stage. Rendered as SVG
             rather than a canvas: it stays sharp at any size, prints, and the
             branded M can sit in the middle as real markup. -->
        <div class="qr-frame">
          <svg
            :viewBox="`0 0 ${moduleCount} ${moduleCount}`"
            class="qr-code"
            role="img"
            :aria-label="`QR code to join the game at ${url}`"
            shape-rendering="crispEdges"
          >
            <rect :width="moduleCount" :height="moduleCount" fill="var(--background-color)" />
            <path :d="modulePath" fill="var(--black)" />
          </svg>

          <!-- The M sits over the code's centre. Error correction level H
               tolerates ~30% occlusion, and the badge covers far less. -->
          <span class="qr-badge" aria-hidden="true">
            <svg viewBox="0 0 100 100" class="qr-badge-mark">
              <path :d="MONDIALE_M" transform="translate(17.881 18.206) scale(1.65)" />
            </svg>
          </span>
        </div>

        <p class="qr-hint">
          Point a camera at the code, or join at <strong>{{ prettyUrl }}</strong>
        </p>
      </div>
    </article>
  </ModalWrapper>
</template>

<script lang="ts" setup>
import qrcode from 'qrcode-generator'
import ModalWrapper from '~/components/modal/ModalWrapper.vue'

const props = defineProps({
  url: { type: String, required: true },
})

defineEmits(['close'])

/** The wordmark's M, lifted from public/favicon.svg so the badge and the
 *  app icon can never drift apart. */
const MONDIALE_M =
  'M0.65625 37C1.4375 34.3906 2.49219 28.6094 3.82031 19.6562C4.47656 15.2344 5.00781 11.1094 5.41406 7.28125C4.61719 5.78125 3.875 4.58594 3.1875 3.69531C4.125 3.58594 5.07812 3.36719 6.04688 3.03906C7.46875 2.55469 8.48438 2.07031 9.09375 1.58594V1.63281L9.14062 1.58594L9.11719 1.63281C9.58594 3.53906 11.2891 9.15625 14.2266 18.4844C16.3516 25.2031 17.8281 29.0547 18.6562 30.0391C19.5156 28.8047 21.1875 24.8203 23.6719 18.0859C26.0156 11.7266 27.4688 7.46875 28.0312 5.3125C27.9531 5.09375 27.8047 4.78125 27.5859 4.375L27.1875 3.625C29.0781 3.40625 30.9922 2.74219 32.9297 1.63281L33.0938 1.53906V1.5625V1.58594C33.0938 6.60156 33.5391 12.1562 34.4297 18.25C35.5078 25.5938 36.6484 30.8438 37.8516 34C38.0547 34.5312 38.1953 34.8125 38.2734 34.8438C37.2109 34.9688 36.2578 35.1875 35.4141 35.5C34.0547 36 33.0391 36.5 32.3672 37C32.3984 36.7031 32.4141 36.3359 32.4141 35.8984C32.3828 32.9453 31.8359 27.1875 30.7734 18.625C30.3359 15.0781 29.8516 12.1016 29.3203 9.69531L25.8281 18.2266C23.375 24.4453 21.8516 29.6953 21.2578 33.9766C21.1953 34.4297 21.1562 34.6641 21.1406 34.6797L21.1641 34.9141C19.2734 35.1328 17.3594 35.7969 15.4219 36.9062L15.2578 37C14.7578 32.2812 13.1719 26.3438 10.5 19.1875C9.23438 15.7969 8.0625 12.9141 6.98438 10.5391C6.54688 13.1484 6.08594 16.2188 5.60156 19.75C4.85156 25.125 4.38281 30 4.19531 34.375L4.17188 34.9141C2.98438 35.1484 1.84375 35.8125 0.75 36.9062L0.65625 37Z'

/** Level H (~30% recoverable) so the centre badge can never make the code
 *  unreadable; type 0 lets the encoder pick the smallest version that fits. */
const code = computed(() => {
  const qr = qrcode(0, 'H')
  qr.addData(props.url)
  qr.make()
  return qr
})

const moduleCount = computed(() => code.value.getModuleCount())

/** ONE path for every dark module — thousands of <rect> nodes is a lot of DOM
 *  for a picture that never changes. */
const modulePath = computed(() => {
  const qr = code.value
  const count = qr.getModuleCount()
  let path = ''
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (qr.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`
    }
  }
  return path
})

const prettyUrl = computed(() => props.url.replace(/^https?:\/\//, ''))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.modal-wrapper.qr-overlay {
  inset: 0;
  z-index: 4;
  position: fixed;
  display: flex;
  align-items: center;
  background: ink(0.35);
  backdrop-filter: blur(0.3rem);
  padding: calc(var(--safe-top) + 1.6rem) calc(var(--safe-right) + 1.2rem)
    calc(var(--safe-bottom) + 1.6rem) calc(var(--safe-left) + 1.2rem);
}

.qr-card {
  width: 100%;
  margin: auto;
  max-width: 40rem;
  max-height: 100%;
  overflow-y: auto;
}

.qr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.2rem;
  padding-top: 2rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid $hairline;

  h2 {
    margin: 0.2rem 0 0;
    font-size: 2.4rem;
    color: var(--dark-blue);
  }
}

// Same masked-cross language as every other dismiss in the lobby.
.qr-close {
  width: 4.4rem;
  height: 4.4rem;
  padding: 0;
  border: none;
  flex-shrink: 0;
  cursor: pointer;
  background: none;
  opacity: 0.45;
  transition: opacity var(--motion-quick, 0.15s) ease;

  &::before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background: var(--black);
    mask: url('~/assets/icons/cross.svg') no-repeat center / 1.4rem;
  }

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
}

.qr-body {
  gap: 1.6rem;
  display: flex;
  align-items: center;
  padding-bottom: 2.4rem;
  flex-flow: column nowrap;
}

.qr-frame {
  width: 100%;
  display: grid;
  max-width: 28rem;
  place-items: center;
  aspect-ratio: 1;
  position: relative;
  // A quiet margin so a phone camera can find the code's edges against the
  // pane — a QR printed flush to its container reads slowly.
  padding: 1.2rem;
  border-radius: 0.8rem;
  background: var(--background-color);
  border: 0.1rem solid $hairline;
}

.qr-code {
  width: 100%;
  height: 100%;
  display: block;
}

.qr-badge {
  position: absolute;
  display: grid;
  place-items: center;
  width: 22%;
  aspect-ratio: 1;
  border-radius: 0.6rem;
  background: var(--background-color);
  // The quiet ring keeps the badge from touching live modules, which is what
  // makes a centre logo scan reliably rather than sometimes.
  box-shadow: 0 0 0 0.4rem var(--background-color);
}

.qr-badge-mark {
  width: 78%;
  height: 78%;
  display: block;
  fill: var(--dark-blue);
}

.qr-hint {
  margin: 0;
  text-align: center;
  font-size: 1.5rem;
  opacity: 0.75;
}
</style>
