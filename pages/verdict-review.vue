<template>
  <div class="review">
    <header class="bar">
      <h1>Verdict review</h1>

      <div class="controls">
        <div class="toggle">
          <button :class="{ on: status === 'correct' }" @click="pick('status', 'correct')">
            correct
          </button>
          <button :class="{ on: status === 'incorrect' }" @click="pick('status', 'incorrect')">
            incorrect
          </button>
        </div>

        <div class="toggle">
          <button
            v-for="lessonMode in LESSON_MODES"
            :key="lessonMode"
            :class="{ on: lesson === lessonMode }"
            @click="pick('lesson', lessonMode)"
          >
            {{ lessonMode }}
          </button>
        </div>

        <label class="check">
          <input v-model="phone" type="checkbox" />
          phone width
        </label>

        <button class="replay" @click="replay">replay ⟳</button>
      </div>
    </header>

    <p class="preamble">
      Five treatments of the post-answer verdict on the wash the real map paints behind them (mint
      for a hit, hi-orange for a miss). The first is today's component, rendered for real as the
      baseline — everything below it is a mockup to choose between. Toggle the lesson length:
      several directions only show their weaknesses at full height.
    </p>

    <section v-for="direction in DIRECTIONS" :key="direction.id" class="group">
      <h2>
        {{ direction.title }}
        <span class="note">{{ direction.note }}</span>
      </h2>

      <div class="stage" :class="[status, { phone }]">
        <div :key="`${direction.id}-${renderKey}`" class="frame">
          <!-- Today's component, imported rather than reproduced: the baseline has
               to be the real thing or the comparison is worthless. -->
          <ChallengeResult
            v-if="direction.id === 'current'"
            :status="status"
            :leap-steps="2"
            :incorrect-message="MISS_LINE"
          >
            <LessonBody :mode="lesson" />
          </ChallengeResult>

          <!-- One stamped document: verdict head over a hairline, fact as its body,
               stamp riding the head row as ink rather than a corner badge. The card is
               a single block centred by margin, so the head, the body and the ripple
               all share one axis — the centring is computed on the card, not on a
               padding box the stamp gets to widen. -->
          <div v-else-if="direction.id === 'dossier'" class="verdict-dossier">
            <div class="head-zone">
              <ContourRipple v-if="status === 'correct'" class="ripple" :delay="0.45" />
              <div class="verdict">
                <h1 class="verdict-line">{{ message }}</h1>
                <VerdictStamp class="stamp" :status="status" />
              </div>
            </div>
            <div v-if="lesson !== 'none'" class="lesson">
              <LessonBody :mode="lesson" />
            </div>
          </div>

          <!-- The wash already says correct/incorrect at full-screen scale, so the
               stamp lands on the revealed country and the fact drops to the card
               that already slides up from the layout. -->
          <div v-else-if="direction.id === 'map-verdict'" class="map-verdict">
            <div class="pin">
              <ContourRipple v-if="status === 'correct'" class="ripple" :delay="0.3" />
              <VerdictStamp class="pin-stamp" :status="status" />
            </div>
            <div class="answer-card">
              <span class="eyebrow">{{ status === 'correct' ? 'Nailed it' : 'The answer' }}</span>
              <p class="answer-line">{{ message }}</p>
              <div v-if="lesson !== 'none'" class="answer-body">
                <LessonBody :mode="lesson" />
              </div>
            </div>
          </div>

          <!-- No pill, no badge: the verdict is display type over the map with a
               rule that draws itself, and the fact keeps the cream pill. -->
          <div v-else-if="direction.id === 'typographic'" class="typographic">
            <h1 class="big-verdict">{{ message }}</h1>
            <span class="rule" aria-hidden="true" />
            <div v-if="lesson !== 'none'" class="fact map-caption">
              <LessonBody :mode="lesson" />
            </div>
          </div>

          <!-- The stamp's asymmetry becomes structure: a perforated stub carries the
               glyph and the reward as a labelled number, the body carries the words. -->
          <div v-else class="pass">
            <div class="stub">
              <VerdictStamp class="stub-stamp" :status="status" />
              <span v-if="status === 'correct'" class="reward">
                <strong>+2</strong>
                <small>steps</small>
              </span>
            </div>
            <div class="pass-body">
              <h1 class="pass-verdict">{{ message }}</h1>
              <div v-if="lesson !== 'none'" class="pass-lesson">
                <LessonBody :mode="lesson" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { defineComponent, h, ref } from 'vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import VerdictStamp from '~/components/feedback/VerdictStamp.vue'

/**
 * Design-review page for the post-answer verdict (components/feedback/ChallengeResult.vue).
 * Renders today's component beside four candidate redesigns on the wash the real map
 * paints behind them, so the call can be made on pixels instead of description.
 *
 *   /verdict-review
 *
 * The four candidates are deliberately mockups in this one file, not components:
 * three of them get deleted once a direction wins.
 */
const LESSON_MODES = ['none', 'short', 'long'] as const
type LessonMode = (typeof LESSON_MODES)[number]

const DIRECTIONS = [
  {
    id: 'current',
    title: 'Today',
    note: 'two cream pills, stamp on the corner, step dots — the baseline',
  },
  {
    id: 'dossier',
    title: 'Stamped dossier',
    note: 'one card: verdict head, hairline, fact body, stamp in the head row',
  },
  {
    id: 'map-verdict',
    title: 'The map is the verdict',
    note: 'stamp lands on the country, fact drops to the reveal card',
  },
  {
    id: 'typographic',
    title: 'Verdict rule',
    note: 'display type + self-drawing rule, no pill and no badge',
  },
  {
    id: 'stub',
    title: 'Boarding-pass stub',
    note: 'perforated stub carries the glyph and a labelled reward',
  },
] as const

// Realistic copy: a find gate's miss line names the answer, which is why the
// verdict and the fact below it read as redundant today.
const MISS_LINE = 'It was Norway'
const SHORT_LESSON = 'Norway — capital Oslo · Northern Europe · 5.4M'

// A stand-in for the tall reveals (MinMaxReveal, MadeReveal) that ride the shared
// .ranked-bars template — the case where a verdict surface has to hold real height.
const BARS = [
  { name: 'Russia', value: '17.1M km²', width: 100 },
  { name: 'Canada', value: '9.98M km²', width: 58 },
  { name: 'China', value: '9.6M km²', width: 56 },
  { name: 'Norway', value: '385k km²', width: 12, mine: true },
  { name: 'Denmark', value: '43k km²', width: 5 },
]

/**
 * Spans throughout, and on purpose: today's lesson is a `<p>`, so every real reveal
 * is built from phrasing content to survive it. Keeping that here means the baseline
 * renders honestly instead of having its markup hoisted out of the paragraph.
 *
 * Built with h() rather than a template so it can sit inside all five mockups once —
 * the classes it leans on (.ranked-bars and friends) are global templates, so they
 * style fine without a scope attribute.
 */
const LessonBody = defineComponent({
  name: 'LessonBody',
  props: {
    mode: { type: String as PropType<LessonMode>, required: true },
  },
  setup(props) {
    return () => {
      if (props.mode === 'none') return null
      if (props.mode === 'short') return h('span', SHORT_LESSON)

      return h('span', { class: 'ranked-bars review-bars' }, [
        h(
          'span',
          { class: 'rows' },
          BARS.map((bar, index) =>
            h('span', { class: 'row', style: { '--i': index } }, [
              h('span', { class: 'bar-name' }, bar.name),
              h('span', { class: 'bar' }, [
                h('span', {
                  class: 'fill',
                  style: {
                    width: `${bar.width}%`,
                    background: bar.mine ? 'var(--soft-blue)' : 'hsla(216, 40%, 25%, 0.35)',
                  },
                }),
              ]),
              h('span', { class: 'bar-value' }, bar.value),
            ])
          )
        ),
      ])
    }
  },
})

const status = ref<'correct' | 'incorrect'>('correct')
const lesson = ref<LessonMode>('short')
const phone = ref(false)

// Everything here is choreographed, so a control change has to remount the stages
// or you only ever see the settled frame.
const renderKey = ref(0)
const replay = () => renderKey.value++

const pick = (which: 'status' | 'lesson', value: string) => {
  if (which === 'status') status.value = value as 'correct' | 'incorrect'
  else lesson.value = value as LessonMode
  replay()
}

const message = computed(() => (status.value === 'correct' ? 'Correct!' : MISS_LINE))

definePageMeta({ layout: false })
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

// Matches $paneBorderRadius in templates/_pane.scss. Inlined rather than @use'd:
// importing that file into a scoped block would duplicate the whole .pane recipe.
$cardRadius: 1.9rem;

.review {
  min-height: 100vh;
  padding: 1rem 1.6rem 8rem;
  color: var(--dark-blue);
  background: hsl(36, 56%, 92%);
}

.bar {
  gap: 2rem;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  position: sticky;
  align-items: baseline;
  padding: 0.8rem 0;
  background: inherit;
  border-bottom: 0.1rem solid ink(0.2);

  h1 {
    margin: 0;
    font-size: 1.8rem;
  }
}

.controls {
  gap: 1.2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.toggle {
  display: flex;
  overflow: hidden;
  border-radius: 0.8rem;
  border: 0.1rem solid ink(0.25);

  button {
    border: 0;
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0.4rem 1rem;
    color: var(--dark-blue);
    background: transparent;
    font-family: inherit;

    &.on {
      color: milk();
      background: ink(0.85);
    }
  }
}

.check {
  gap: 0.4rem;
  display: flex;
  font-size: 1.2rem;
  align-items: center;
}

.replay {
  cursor: pointer;
  font-size: 1.2rem;
  font-family: inherit;
  padding: 0.4rem 1rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  background: transparent;
  border: 0.1rem solid ink(0.25);
}

.preamble {
  max-width: 78ch;
  font-size: 1.3rem;
  line-height: 1.6;
  opacity: 0.75;
  margin: 1.2rem 0 0;
}

.group {
  h2 {
    gap: 0.8rem;
    display: flex;
    flex-wrap: wrap;
    font-size: 1.5rem;
    align-items: baseline;
    margin: 3.2rem 0 1rem;
  }

  .note {
    opacity: 0.55;
    font-weight: normal;
    font-size: 1.2rem;
  }
}

// The wash the real map paints under the verdict: GameMap fills every
// non-highlighted country with these two tokens, and cream-on-wash contrast is
// the main thing being judged here — a white page would flatter all five equally.
.stage {
  display: flex;
  position: relative;
  padding: 3.2rem 2rem;
  border-radius: 1.2rem;
  justify-content: center;
  border: 0.1rem solid ink(0.18);
  // ChallengePrompt centres its whole column, so every treatment has to be judged
  // with that inherited — otherwise the page flatters whichever one happens to
  // want the page default.
  text-align: center;

  &.correct {
    background: var(--soft-mint);
  }

  &.incorrect {
    background: var(--hior-ange);
  }

  &.phone {
    max-width: 39rem;
    padding: 2rem 1.6rem;
  }

  // A centring gauge: the dotted line is the stage's true centre, so a treatment
  // whose body drifts off it (today's does, thanks to the stamp's asymmetric
  // padding) shows the drift instead of being taken on trust.
  &::before {
    top: 0;
    left: 50%;
    bottom: 0;
    content: '';
    position: absolute;
    border-left: 0.1rem dashed ink(0.3);
  }
}

.frame {
  width: 100%;
}

// ---------------------------------------------------------------- dossier
.verdict-dossier {
  display: block;
  width: max-content;
  max-width: min(60rem, 100%);
  margin-inline: auto;
  pointer-events: auto;
  border-radius: $cardRadius;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);
  // The one treatment that sets its own alignment: a document reads ragged-right,
  // and the whole direction is "this is a stamped page, not a shouted verdict".
  // The consequence is real and deliberate — it left-aligns the reveal bodies too.
  text-align: left;
}

// Exists so the ripple gets a box that is exactly the head's box: the flourish
// belongs to the verdict, not to the middle of a dossier that may be tall.
.head-zone {
  position: relative;
}

// The stamp rides the head as a real flex item rather than an absolute overlay.
// That is the whole fix: nothing is positioned out of flow, so the ink cannot
// collide with the words (today's does, at phone width), cannot need a clip, and
// cannot drag the verdict off centre — the card centres as a block via margin.
.verdict {
  gap: 2rem;
  display: flex;
  position: relative;
  align-items: center;
  padding: 1rem 2.2rem;
  justify-content: space-between;
}

.verdict-line {
  margin: 0;
  min-width: 0;
  font-size: var(--caption-display, clamp(1.8rem, 1rem + 1.8vw, 3.2rem));

  .stage.incorrect & {
    color: var(--hior-ange);
  }
}

// Ink rather than badge: knocked back so it reads as something pressed onto the
// page, and flex: none so a long verdict squeezes the words, never the stamp.
.stamp {
  flex: none;
  width: 4.8rem;
  height: 4.8rem;
  opacity: 0.55;
}

.verdict-dossier .lesson {
  font-size: 1.7rem;
  line-height: 1.5;
  padding: 0.9rem 2.2rem 1.1rem;
  border-top: 0.1rem solid $hairline;
}

.ripple {
  top: 50%;
  left: 50%;
  width: 22rem;
  height: 22rem;
  position: absolute;
  transform: translate(-50%, -50%);
}

// ---------------------------------------------------------------- map verdict
.map-verdict {
  gap: 4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.pin {
  position: relative;

  .pin-stamp {
    width: 9rem;
    height: 9rem;
  }

  .ripple {
    width: 26rem;
    height: 26rem;
  }
}

.answer-card {
  width: 100%;
  max-width: 46rem;
  text-align: center;
  padding: 1.4rem 2.2rem 1.6rem;
  border-radius: $cardRadius;
  backdrop-filter: blur(0.5rem);
  background: milk(0.9);
  border: 0.1rem solid ink(0.2);

  .eyebrow {
    margin-bottom: 0.4rem;
  }

  .answer-line {
    margin: 0;
    font-weight: bold;
    font-size: 2.1rem;
  }

  .answer-body {
    font-size: 1.6rem;
    line-height: 1.5;
    margin-top: 0.8rem;
    opacity: 0.8;
  }
}

// ---------------------------------------------------------------- typographic
.typographic {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .big-verdict {
    margin: 0;
    line-height: 1.05;
    text-align: center;
    font-size: clamp(3.2rem, 2rem + 4vw, 5.6rem);
    color: var(--dark-blue);
  }

  .rule {
    width: 16rem;
    height: 0.3rem;
    border-radius: 0.2rem;
    background: var(--dark-blue);
    transform-origin: left center;
    animation: bar-grow 0.5s var(--ease-out-expressive) 0.2s backwards;
  }

  .fact {
    font-size: 1.7rem;
    line-height: 1.5;
    margin-top: 1.2rem;
    max-width: min(60rem, 100%);
  }

  // No status colour here, deliberately. Bare type over the map cannot use the
  // verdict hue: the miss wash IS hi-orange, so hi-orange type on it is invisible
  // (which is what .map-caption's cream scrim exists to prevent). This direction
  // therefore has to let the wash alone carry correct-vs-incorrect and keep its
  // type dark-blue on both — a real constraint of dropping the pill, not a bug.
}

// ---------------------------------------------------------------- stub
.pass {
  display: flex;
  overflow: hidden;
  text-align: left;
  width: max-content;
  max-width: min(64rem, 100%);
  margin-inline: auto;
  border-radius: $cardRadius;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);
}

.stub {
  gap: 0.8rem;
  flex: none;
  display: flex;
  align-items: center;
  padding: 1.4rem 1.6rem;
  flex-flow: column nowrap;
  justify-content: center;
  border-right: 0.2rem dashed ink(0.3);

  .stub-stamp {
    width: 4.4rem;
    height: 4.4rem;
  }

  .reward {
    display: flex;
    line-height: 1;
    align-items: center;
    flex-flow: column nowrap;

    strong {
      font-size: 2.4rem;
      font-variant-numeric: tabular-nums;
    }

    small {
      opacity: 0.6;
      font-size: 1.1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  }
}

.pass-body {
  min-width: 0;
  padding: 1.4rem 2.2rem 1.6rem;

  .pass-verdict {
    margin: 0;
    font-size: 2.4rem;

    .stage.incorrect & {
      color: var(--hior-ange);
    }
  }

  .pass-lesson {
    font-size: 1.6rem;
    line-height: 1.5;
    margin-top: 0.6rem;
    opacity: 0.85;
  }
}

@media screen and (max-width: $tablet) {
  .pass {
    flex-flow: column nowrap;
  }

  .stub {
    flex-flow: row nowrap;
    border-right: 0;
    justify-content: flex-start;
    border-bottom: 0.2rem dashed ink(0.3);
  }
}
</style>

<style lang="scss">
// Unscoped: the bar rows are built with h(), so they carry no scope attribute.
// They ride the shared .ranked-bars template for geometry and choreography —
// this only supplies the row content widths the template leaves to its skins.
.review-bars {
  min-width: min(34rem, 100%);
  max-height: none;
  text-align: left;

  // flex-basis 0 contributes nothing to a max-content-sized card, so without a
  // floor the track collapses to zero width and the bars vanish entirely — the
  // same trap MinMaxReveal's own comment warns about.
  .bar {
    min-width: 12rem;
  }

  .bar-name {
    flex: none;
    width: 7rem;
    font-weight: bold;
  }

  .bar-value {
    flex: none;
    opacity: 0.6;
    text-align: right;
    min-width: 7.5rem;
    font-variant-numeric: tabular-nums;
  }
}
</style>
