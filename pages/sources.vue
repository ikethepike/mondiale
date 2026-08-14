<template>
  <StaticPage>
    <h1>Sources</h1>
    <p class="lead">
      Mondiale is built on open data. The facts, maps and imagery in the game come from these
      sources — every figure in a round is traceable back to one of them.
    </p>

    <ul class="sources">
      <li v-for="source in sources" :key="source.id" class="source">
        <a class="logo-cell" :href="source.provider.url" target="_blank" rel="noopener">
          <img
            v-if="source.logo"
            :src="source.logo"
            :class="{ dim: source.provider.dimLogo }"
            :alt="`${source.provider.name} logo`"
          />
          <span v-else class="wordmark">{{ source.provider.name }}</span>
        </a>
        <div class="details">
          <a :href="source.provider.url" target="_blank" rel="noopener">
            {{ source.provider.name }}
          </a>
          <p>{{ source.provider.description }}</p>
          <p class="provenance">
            <span v-for="release in source.releases" :key="release" class="release">
              {{ release }}
            </span>
          </p>
          <p class="feeds">{{ source.feeds.join(' · ') }}</p>
        </div>
      </li>
    </ul>
  </StaticPage>
</template>
<script lang="ts" setup>
import {
  DATASETS,
  PROVIDERS,
  SOURCES,
  type DataSetId,
  type ProviderId,
  type SourceId,
} from '~~/lib/attribution'

// Logos live beside each other; the registry names the file, the bundler
// resolves it — so a new provider needs no edit here.
const logos = import.meta.glob('~/assets/logos/sources/*', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const logoFor = (file?: string): string | undefined => {
  if (!file) return undefined
  const path = Object.keys(logos).find(key => key.endsWith(`/${file}`))
  return path ? logos[path] : undefined
}

const sourceIds = Object.keys(SOURCES) as SourceId[]
const datasetIds = Object.keys(DATASETS) as DataSetId[]

const sources = (Object.keys(PROVIDERS) as ProviderId[])
  .map(id => {
    // `unlisted` releases are held back from the page — see the flag's note in
    // lib/attribution.ts. A provider with nothing left to list drops out below.
    const owned = sourceIds.filter(
      sourceId => SOURCES[sourceId].provider === id && !SOURCES[sourceId].unlisted
    )

    return {
      id,
      provider: PROVIDERS[id],
      logo: logoFor(PROVIDERS[id].logo),
      // Release + licence per dataset the provider publishes.
      releases: owned.map(sourceId => {
        const { title, edition, license } = SOURCES[sourceId]
        return [edition ? `${title} (${edition})` : title, license].filter(Boolean).join(' — ')
      }),
      // What it puts on the table.
      feeds: datasetIds
        .filter(datasetId =>
          DATASETS[datasetId].origins.some(origin => owned.includes(origin.source))
        )
        .map(datasetId => DATASETS[datasetId].label),
    }
  })
  .filter(source => source.releases.length)
</script>
<style lang="scss" scoped>
.lead {
  margin-bottom: 2.4rem;
}

.sources {
  margin: 0;
  padding: 0;
  list-style: none;
}

.source {
  gap: 2rem;
  display: flex;
  align-items: center;
  padding: 1.6rem 0;
  border-top: 0.1rem solid color-mix(in srgb, var(--text-color) 15%, transparent);

  &:last-child {
    border-bottom: 0.1rem solid color-mix(in srgb, var(--text-color) 15%, transparent);
  }
}

.logo-cell {
  flex: none;
  width: 8rem;
  height: 4rem;
  display: flex;
  align-items: center;
  text-decoration: none;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: grayscale(1);
    opacity: 0.8;
    transition:
      filter var(--motion-quick),
      opacity var(--motion-quick);

    // Pale logos vanish under plain grayscale — pull them toward mid-gray
    &.dim {
      filter: grayscale(1) brightness(0.45) contrast(1.6);
    }
  }
}

// Providers without a logo file stand as their own wordmark.
.wordmark {
  opacity: 0.6;
  font-size: 1.2rem;
  line-height: 1.2;
  text-align: center;
  letter-spacing: 0.02em;
  color: var(--text-color);
  text-decoration: none;
  transition: opacity var(--motion-quick);
}

.source:hover .wordmark {
  opacity: 1;
}

.source:hover .logo-cell img {
  filter: none;
  opacity: 1;
}

.details {
  a {
    color: var(--text-color);
    font-size: 1.6rem;
    text-underline-offset: 0.25em;
  }

  p {
    margin: 0.4rem 0 0;
    font-size: 1.35rem;
    opacity: 0.7;
  }

  .provenance {
    opacity: 0.55;
    display: flex;
    font-size: 1.2rem;
    flex-flow: column nowrap;
  }

  .feeds {
    opacity: 0.55;
    font-size: 1.2rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
}
</style>
