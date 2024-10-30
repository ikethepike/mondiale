import { resolve } from 'path'

export const GENERATOR_CONFIG = {
  paths: {
    isoCodesFile: resolve(__dirname, '../../data/iso-codes.gen.ts'),
    countriesFile: resolve(__dirname, '../../data/countries.gen.ts'),
    regionsFile: resolve(__dirname, '../../types/vendor/factbook/factbook-types.gen.ts'),
    linkMappingFile: resolve(__dirname, '../link-mapping.gen.ts'),
    flagsDirectory: resolve(__dirname, '../../data/static/flags'),
  },
  api: {
    factbook: {
      baseUrl: 'https://github.com/factbook/factbook.json/raw/master',
      maxRetries: 3,
      retryDelay: 1000,
    },
  },
  folders: [
    'africa',
    'central-asia',
    'east-n-southeast-asia',
    'europe',
    'middle-east',
    'south-america',
    'central-america-n-caribbean',
    'south-asia',
    'north-america',
    'australia-oceania',
  ] as const,
  templates: {
    isoCodesFile: (codes: string[]) => `
      export const ISOCountryCodes = ${JSON.stringify(codes)} as const;
    `,
    countriesFile: (countries: Record<string, unknown>) => `
      import type { ISOCountryCode, Country } from '../types/geography.types';
      
      export const COUNTRIES: { [key in ISOCountryCode]: Country } = ${JSON.stringify(
        countries,
        null,
        2
      )};
    `,
    regionsFile: (regions: string[]) => `
      export const factbookRegions = ${JSON.stringify(regions)} as const;
      export type FactbookRegion = typeof factbookRegions[number];
    `,
    linkMappingFile: (
      successfulCombinations: unknown[],
      failedCombinations: unknown[],
      nonSovereigns: unknown[]
    ) => `
      // This is a generated file, don't touch it.
      // Generated at: ${new Date().toISOString()}
      import type { ISOFipsMapping, LinkMapping } from './create-link-mapping';

      export const successfulCombinations: LinkMapping[] = ${JSON.stringify(
        successfulCombinations,
        null,
        2
      )};
      export const failedCombinations: ISOFipsMapping[] = ${JSON.stringify(
        failedCombinations,
        null,
        2
      )};
      export const possibleNonSovereigns: { isoCode: string; fipsCode: string; url: string }[] = ${JSON.stringify(
        nonSovereigns,
        null,
        2
      )};
    `,
  },
}
