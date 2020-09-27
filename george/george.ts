/* eslint-disable camelcase */
/* eslint-disable no-console */
const fs = require('fs')

let unparsed
try {
  unparsed = fs.readFileSync('./world.json')
} catch (e) {
  console.error('failed to read world.json', e)
  throw new Error('Unable to read world.json')
}
const world: World = JSON.parse(String(unparsed))

export interface AgeDistribution {
  male: number
  total: number
  female: number
}

export interface LifeExpectancy {
  male: number
  female: number
}

export type Units =
  | 'kg'
  | 'km'
  | 'm'
  | 'c'
  | '%'
  | 'sq km'
  | 'nm'
  | 'deaths_per_1000_live_births'
  | 'males/female'
  | 'percent of population'
  | 'm m'
  | 'sq'
  | 'years'
  | 'USD'
  | string

export interface Value {
  value: number
  units: Units
  note?: string
  date?: string
}

export interface RankValue {
  rank: number
  value: number
}

const coteDivoire = world.countries["cote_d'_ivoire"]

const {
  afghanistan,
  albania,
  algeria,
  andorra,
  angola,
  antigua_and_barbuda,
  argentina,
  armenia,
  australia,
  austria,
  azerbaijan,
  bahamas_the,
  bahrain,
  bangladesh,
  barbados,
  belarus,
  belgium,
  belize,
  benin,
  bhutan,
  bolivia,
  bosnia_and_herzegovina,
  botswana,
  brazil,
  brunei,
  bulgaria,
  burkina_faso,
  burundi,
  cabo_verde,
  cambodia,
  cameroon,
  canada,
  central_african_republic,
  chad,
  chile,
  china,
  colombia,
  comoros,
  congo_democratic_republic_of_the,
  costa_rica,
  croatia,
  cuba,
  cyprus,
  czechia,
  denmark,
  djibouti,
  dominica,
  dominican_republic,
  ecuador,
  egypt,
  el_salvador,
  equatorial_guinea,
  eritrea,
  estonia,
  eswatini,
  ethiopia,
  fiji,
  finland,
  france,
  gabon,
  gambia_the,
  georgia,
  germany,
  ghana,
  greece,
  grenada,
  guatemala,
  guinea,
  guinea_bissau,
  guyana,
  haiti,
  holy_see_vatican_city,
  honduras,
  hungary,
  iceland,
  india,
  indonesia,
  iran,
  iraq,
  ireland,
  israel,
  italy,
  jamaica,
  japan,
  jordan,
  kazakhstan,
  kenya,
  kiribati,
  kuwait,
  kyrgyzstan,
  laos,
  latvia,
  lebanon,
  lesotho,
  liberia,
  libya,
  liechtenstein,
  lithuania,
  luxembourg,
  madagascar,
  malawi,
  malaysia,
  maldives,
  mali,
  malta,
  marshall_islands,
  mauritania,
  mauritius,
  mexico,
  micronesia_federated_states_of,
  moldova,
  monaco,
  mongolia,
  montenegro,
  morocco,
  mozambique,
  burma,
  namibia,
  nauru,
  nepal,
  netherlands,
  new_zealand,
  nicaragua,
  niger,
  nigeria,
  korea_north,
  korea_south,
  north_macedonia,
  norway,
  oman,
  pakistan,
  palau,
  panama,
  papua_new_guinea,
  paraguay,
  peru,
  philippines,
  poland,
  portugal,
  qatar,
  romania,
  russia,
  rwanda,
  saint_kitts_and_nevis,
  saint_lucia,
  saint_vincent_and_the_grenadines,
  samoa,
  san_marino,
  sao_tome_and_principe,
  saudi_arabia,
  senegal,
  serbia,
  seychelles,
  sierra_leone,
  singapore,
  slovakia,
  slovenia,
  solomon_islands,
  somalia,
  south_africa,
  south_sudan,
  spain,
  sri_lanka,
  sudan,
  suriname,
  sweden,
  switzerland,
  syria,
  tajikistan,
  tanzania,
  thailand,
  timor_leste,
  togo,
  tonga,
  trinidad_and_tobago,
  tunisia,
  turkey,
  turkmenistan,
  tuvalu,
  uganda,
  ukraine,
  united_arab_emirates,
  united_kingdom,
  united_states,
  uruguay,
  uzbekistan,
  vanuatu,
  venezuela,
  vietnam,
  yemen,
  zambia,
  zimbabwe,
} = world.countries

const output = [
  afghanistan,
  albania,
  algeria,
  andorra,
  angola,
  antigua_and_barbuda,
  argentina,
  armenia,
  australia,
  austria,
  azerbaijan,
  bahamas_the,
  bahrain,
  bangladesh,
  barbados,
  belarus,
  belgium,
  belize,
  benin,
  bhutan,
  bolivia,
  bosnia_and_herzegovina,
  botswana,
  brazil,
  brunei,
  bulgaria,
  burkina_faso,
  burundi,
  cabo_verde,
  cambodia,
  cameroon,
  canada,
  central_african_republic,
  chad,
  chile,
  china,
  colombia,
  comoros,
  congo_democratic_republic_of_the,
  costa_rica,
  croatia,
  cuba,
  cyprus,
  czechia,
  denmark,
  djibouti,
  dominica,
  dominican_republic,
  ecuador,
  egypt,
  el_salvador,
  equatorial_guinea,
  eritrea,
  estonia,
  eswatini,
  ethiopia,
  fiji,
  finland,
  france,
  gabon,
  gambia_the,
  georgia,
  germany,
  ghana,
  greece,
  grenada,
  guatemala,
  guinea,
  guinea_bissau,
  guyana,
  haiti,
  holy_see_vatican_city,
  honduras,
  hungary,
  iceland,
  india,
  indonesia,
  iran,
  iraq,
  ireland,
  israel,
  italy,
  jamaica,
  japan,
  jordan,
  kazakhstan,
  kenya,
  kiribati,
  kuwait,
  kyrgyzstan,
  laos,
  latvia,
  lebanon,
  lesotho,
  liberia,
  libya,
  liechtenstein,
  lithuania,
  luxembourg,
  madagascar,
  malawi,
  malaysia,
  maldives,
  mali,
  malta,
  marshall_islands,
  mauritania,
  mauritius,
  mexico,
  micronesia_federated_states_of,
  moldova,
  monaco,
  mongolia,
  montenegro,
  morocco,
  mozambique,
  burma,
  namibia,
  nauru,
  nepal,
  netherlands,
  new_zealand,
  nicaragua,
  niger,
  nigeria,
  korea_north,
  korea_south,
  north_macedonia,
  norway,
  oman,
  pakistan,
  palau,
  panama,
  papua_new_guinea,
  paraguay,
  peru,
  philippines,
  poland,
  portugal,
  qatar,
  romania,
  russia,
  rwanda,
  saint_kitts_and_nevis,
  saint_lucia,
  saint_vincent_and_the_grenadines,
  samoa,
  san_marino,
  sao_tome_and_principe,
  saudi_arabia,
  senegal,
  serbia,
  seychelles,
  sierra_leone,
  singapore,
  slovakia,
  slovenia,
  solomon_islands,
  somalia,
  south_africa,
  south_sudan,
  spain,
  sri_lanka,
  sudan,
  suriname,
  sweden,
  switzerland,
  syria,
  tajikistan,
  tanzania,
  thailand,
  timor_leste,
  togo,
  tonga,
  trinidad_and_tobago,
  tunisia,
  turkey,
  turkmenistan,
  tuvalu,
  uganda,
  ukraine,
  united_arab_emirates,
  united_kingdom,
  united_states,
  uruguay,
  uzbekistan,
  vanuatu,
  venezuela,
  vietnam,
  yemen,
  zambia,
  zimbabwe,
  coteDivoire,
].map((countryObject) => {
  const country: GenericCountry = countryObject.data

  return {
    name: country.name,
    countryCode: country.communications.internet.country_code.slice(1),
    statistics: {
      geography: {
        landArea: country.geography.area.land,
        waterArea: country.geography.area.water,
        totalArea: country.geography.area.total,
        lowestPoint: country.geography.elevation.highest_point,
        highestPoint: country.geography.elevation.lowest_point,
        arableLand: country.geography.land_use.by_sector.arable_land,
      },
      unemployment: {
        youthPercentage: country.people.youth_unemployment?.total,
        totalPercentage: country.economy.unemployment_rate?.annual_values?.pop(),
      },
      infrastructure: {
        roadLength: country.transportation?.roadways?.total,
        railLength: country.transportation?.railways?.total,
        electricity: {
          populationWithoutAccess:
            country.energy?.electricity.access?.population_without_electricity,
        },
      },
    },
  }
})

fs.writeFileSync('./compiled/world.json', JSON.stringify(output), 'utf-8')

export type Direction = 'N' | 'S' | 'W' | 'E'

export interface Coordinates {
  degrees: number
  minutes: number
  hemisphere: string
}

export interface GenericCountry {
  name: string
  introduction: {
    background: string
  }
  geography: {
    location: string
    geographic_coordinates: {
      latitude: Coordinates
      longitude: Coordinates
    }
    map_references: string
    area: {
      land?: OptionalUnitValue
      water?: OptionalUnitValue
      total?: OptionalUnitValue
      note?: string
      global_rank?: number
      comparative?: string
    }
    land_boundaries: {
      total: OptionalUnitValue
      border_countries?: BorderCountry[]
      note?: string
    }
    coastline?: {
      value: number
      units?: string
    }
    maritime_claims?: {
      territorial_sea: OptionalUnitValue
      exclusive_economic_zone?: OptionalUnitValue | string
      contiguous_zone?: OptionalUnitValue
      continental_shelf?:
        | {
            value: number
            units?: string
          }
        | string
    }
    climate: string
    terrain: string
    elevation: {
      mean_elevation?: Value
      lowest_point: ElevationPoint
      highest_point: ElevationPoint | string
      note?: string
    }
    note?: string
    natural_resources?: {
      resources: string[]
    }
    land_use: {
      by_sector: {
        agricultural_land_total: OptionalUnitValue
        arable_land: OptionalUnitValue
        permanent_crops: OptionalUnitValue
        permanent_pasture: OptionalUnitValue
        forest?: OptionalUnitValue
        other: OptionalUnitValue
      }
      note?: string
    }
    irrigated_land?: {
      value: number
      units?: 'sq km' | string
      date?: string
    }
    population_distribution?: string
    natural_hazards?: Hazard[] | null
    environment: {
      current_issues: string[]
      international_agreements?: {
        party_to: string[] | null
        signed_but_not_ratified: string[] | null
      }
    }
  }
  people: {
    population: {
      total: number
      global_rank?: number
      date?: string
    }
    nationality: {
      noun: string
      adjective: string
    }
    ethnic_groups: {
      ethnicity: Ethnicity[]
      note?: string
      date?: string
    }
    languages: {
      language: PeopleValue[]
      note?: string
      date?: string
    }
    religions: {
      religion: PeopleValue[]
      note?: string
      date?: string
    }
    age_structure?: {
      '0_to_14': AgeBreakdown
      '15_to_24': AgeBreakdown
      '25_to_54': AgeBreakdown
      '55_to_64': AgeBreakdown
      '65_and_over': AgeBreakdown
      date?: string
    }
    dependency_ratios?: {
      ratios: {
        total_dependency_ratio: Value
        youth_depdency_ratio?: Value
        elderly_dependency_ratio: Value
        potential_support_ratio?: Value
      }
      date?: string
    }
    median_age?: {
      total?: Value
      male: Value
      female: Value
      global_rank?: number
      date?: string
    }
    population_growth_rate: {
      growth_rate: number
      global_rank: number
      date?: string
    }
    birth_rate?: {
      births_per_1000_population: number
      global_rank: number
      date?: string
    }
    death_rate?: {
      deaths_per_1000_population: number
      global_rank: number
      date?: string
    }
    net_migration_rate?: {
      migrants_per_1000_population: number
      global_rank: number
      date?: string
    }
    population_distribution?: string
    urbanization: {
      urban_population: Value
      rate_of_urbanization: Value
    }
    major_urban_areas?: {
      places: {
        place: string
        population?: number
        is_capital?: boolean
      }[]
      date?: string
    }
    sex_ratio?: {
      by_age: {
        at_birth: Value
        '0_to_14_years': Value
        '15_to_24_years': Value
        '25_to_54_years': Value
        '55_to_64_years': Value
        '65_years_and_over': Value
      }
      total_population: Value
      date?: string
    }
    mothers_mean_age_at_first_birth?: {
      age: number
      date?: string
    }
    maternal_mortality_rate?: {
      deaths_per_100k_live_births: number
      global_rank: number
      date?: string
    }
    infant_mortality_rate?: {
      total?: Value
      male: Value
      female: Value
      global_rank?: number
      date?: string
    }
    life_expectancy_at_birth?: {
      total_population?: Value
      male: Value
      female: Value
      global_rank?: number
      date?: string
    }
    total_fertility_rate?: {
      children_born_per_woman: number
      global_rank: number
      date?: string
    }
    contraceptive_prevalence_rate?: Value
    physicians_density?: {
      physicians_per_1000_population: number
      date?: string
    }
    hospital_bed_density?: {
      beds_per_1000_population: number
      date?: string
    }
    drinking_water_source?: {
      improved: {
        urban?: Value
        rural?: Value
        total?: Value
      }
      unimproved: {
        urban?: Value
        rural?: Value
        total?: Value
      }
      date?: string
    }
    sanitation_facility_access?: {
      improved: {
        urban: Value
        rural?: Value
        total?: Value
      }
      unimproved: {
        urban: Value
        rural?: Value
        total?: Value
      }
      date?: string
    }
    adult_obesity?: {
      percent_of_adults: number
      global_rank: number
      date?: string
    }
    underweight_children?: {
      percent_of_children_under_the_age_of_five: number
      global_rank: number
      date?: string
    }
    education_expenditures?: {
      percent_of_gdp: number
      global_rank: number
      date?: string
    }
    school_life_expectancy?: {
      total?: OptionalUnitValue
      male?: OptionalUnitValue
      female?: OptionalUnitValue
      date?: string
    }
    youth_unemployment?: {
      total?: Value
      male?: OptionalUnitValue
      female?: OptionalUnitValue
      global_rank?: number
      date?: string
    }
  }
  government: {
    country_name: {
      conventional_long_form: string
      conventional_short_form: string
      abbreviation?: string
      etymology?: string
      former?: string
      local_long_form?: string
      local_short_form?: string
    }
    government_type: string
    capital: {
      name: string
      geographic_coordinates?: {
        latitude: Coordinates
        longitude: Coordinates
      }
      time_difference:
        | {
            timezone: number
            note?: string
          }
        | string
      daylight_saving_time?: string
      note?: string
      etymology?: string
    }
    administrative_divisions?: {
      name: string
      type: string
    }[]
    dependent_areas?: {
      areas: string[]
      note?: string
    }
    independence?: {
      date?: string
      note?: string
    }
    national_holidays?: { name: string; day: string; original_year?: string }[]
    constitution: {
      history: string
      amendments?: string
    }
    legal_system?: string
    international_law_organization_participation?: string[]
    citizenship?: {
      citizenship_by_birth?: string
      citizenship_by_descent_only?: string
      dual_citizenship_recognized?: string
      residency_requirement_for_naturalization?: string
    }
    executive_branch: {
      chief_of_state?: string
      head_of_government: string
      cabinet?: string
      elections_appointments: string
      election_results?: string
    }
    legislative_branch: {
      description: string
      elections?: string
      election_results?: string
      note?: string
    }
    judicial_branch?: {
      highest_courts?: string
      judge_selection_and_term_of_office?: string
      subordinate_courts?: string
      note?: string
    }
    political_parties_and_leaders: {
      parties?: { name: string; leaders?: string[] }[]
      international_organization_participation?: {
        organization: string
        note?: string
      }[]
      note?: string
    }
    flag_description: {
      description: string
      note?: string
    }
    national_anthem: {
      name?: string
      lyrics_music?: string
      note?: string
      audio_url?: string
    }
  }
  economy: {
    overview: string
    gdp: {
      purchasing_power_parity: {
        annual_values?: Value[]
        global_rank?: number
        note?: string
      }
      official_exchange_rate?: {
        USD: number
        date?: string
      }
      real_growth_rate?: {
        annual_values: Value[]
        global_rank: number
        note?: string
      }
      per_capita_purchasing_power_parity?: {
        annual_values: Value[]
        global_rank: number
        note?: string
      }
      composition?: {
        by_end_use?: {
          end_uses: {
            household_consumption?: Value
            government_consumption?: Value
            investment_in_inventories?: Value
            investment_in_fixed_capital?: Value
            exports_of_goods_and_services: Value
            imports_of_goods_and_services: Value
          }
          date?: string
        }
        by_sector_of_origin?: {
          sectors: {
            industry: Value
            services: Value
            agriculture: Value
          }
          date?: string
        }
      }
    }
    gross_national_saving?: {
      annual_values?: Value[]
      global_rank?: number
      note?: string
    }
    agriculture_products?: {
      products: string[]
    }
    industries?: {
      industries: String[]
      note?: string
    }
    industrial_production_growth_rate?: {
      annual_percentage_increase: number
      global_rank: number
      date?: string
    }
    labor_force?: {
      total_size?: {
        total_people: number
        global_rank: number
        date?: string
      }
      by_occupation?: {
        industry?: string
        services?: string
        agriculture?: string
        occupation?: {
          agriculture?: Value
          industry?: Value
          services?: OptionalUnitValue
          tourism?: Value
          industry_and_services?: Value
          manufacturing?: Value
          farming_forestry_and_fishing?: Value
          manufacturing_extraction_transportation_and_crafts?: Value
          managerial_professional_and_technical?: Value
          sales_and_office?: Value
          other_services?: Value
          note?: string
        }
        note?: string
        date?: string
      }
    }
    unemployment_rate?: {
      annual_values?: Value[]
      global_rank?: number
      note?: string
    }
    population_below_poverty_line?: Value
    household_income_by_percentage_share?: {
      lowest_ten_percent?: Value
      highest_ten_percent?: Value
      date?: string
    }
    budget: {
      revenues: OptionalUnitValue
      expenditures: OptionalUnitValue
      note?: string
      date?: string
    }
    taxes_and_other_revenues?: {
      percent_of_gdp: number
      global_rank: number
      date?: string
    }
    budget_surplus_or_deficit?: {
      percent_of_gdp: number
      global_rank: number
      date?: string
    }
    public_debt?: {
      annual_values: Value[]
      global_rank: number
      note?: string
    }
    exchange_rates: {
      annual_values?: Value[]
      note?: string
    }
    fiscal_year?: {
      start: string
      end: string
    }
    inflation_rate?: {
      annual_values?: Value[]
      global_rank?: number
      note?: string
    }
    current_account_balance?: {
      annual_values: Value[]
      global_rank: number
    }
    exports?: {
      total_value: {
        annual_values: Value[]
        global_rank: number
      }
      commodities?: {
        by_commodity: string[]
        date?: string
      }
      partners?: {
        by_country: {
          name: string
          percent?: number
        }[]
      }
      imports?: {
        total_value: {
          annual_values: Value[]
          global_rank: string
        }
        commodities: {
          by_commodity: string[]
          date?: string
        }
        partners: {
          by_country: { name: string; percent: number }[]
          date?: string
        }
        reserves_of_foreign_exchange_and_gold: {
          annual_values: Value[]
          global_rank: number
        }
        external_debt: {
          annual_values: Value[]
          global_rank: number
          note?: string
        }
        exchange_rates?: {
          note?: string
        }
      }
    }
  }
  energy?: {
    electricity: {
      access?: {
        population_without_electricity?: OptionalUnitValue
        total_electrification: OptionalUnitValue
        urban_electrification?: OptionalUnitValue
        rural_electrification?: OptionalUnitValue
        date?: string
        note?: string
      }
      production?: EnergyValue
      consumption?: EnergyValue
      exports?: EnergyValue
      imports?: EnergyValue
      installed_generating_capacity?: EnergyValue
      by_source?: {
        fossil_fuels: FuelValue
        nuclear_fuels: FuelValue
        hydroelectric_plants: FuelValue
        other_renewable_sources?: FuelValue
      }
    }
    crude_oil?: {
      production?: OilValue
      exports: OilValue
      imports: OilValue
    }
    refined_petroleum_products?: {
      production?: OilValue
      consumption?: OilValue
      exports?: OilValue
      imports?: OilValue
      proved_reserves?: OilValue
    }
    natural_gas?: {
      production: {
        cubic_metres: number
        global_rank: number
        date?: string
      }
      consumption?: {
        cubic_metres: number
        global_rank: number
        date?: string
      }
      exports?: {
        cubic_metres: number
        global_rank: number
        date?: string
      }
      imports?: {
        cubic_metres: number
        global_rank: number
        date?: string
      }
      proved_reserves?: {
        cubic_metres: number
        global_rank: number
        date?: string
      }
    }
    carbon_dioxide_emissions_from_consumption_of_energy?: {
      megatonnes: number
      global_rank: number
      date?: string
    }
  }
  communications: {
    telephones: {
      fixed_lines?: SubscriptionValue
      mobile_cellular?: SubscriptionValue
      system: {
        general_assessment: string
        domestic: string
        international: string
        overseas_departments?: string
      }
    }
    broadcast_media?: string
    internet: {
      country_code: string
      users?: {
        total: number
        percent_of_population?: number
        global_rank?: number
        date?: string
      }
    }
    note?: string
  }
  transportation?: {
    air_transport: {
      national_system?: {
        number_of_registered_air_carriers?: number
        inventory_of_registered_aircraft_operated_by_air_carriers?: number
        annual_passenger_traffic_on_registered_air_carriers?: number
        annual_freight_traffic_on_registered_air_carriers?: number | string
        date?: string
      }
      civil_aircraft_registration_country_code_prefix?: {
        prefix: string
        date?: string
      }
      airports?: {
        total: {
          airports: number
          global_rank: number
          date?: string
        }
        paved?: any
        unpaved?: any
      }
      heliports?: {
        total: number
        date?: string
      }
    }
    pipelines?: {
      by_type: {
        type: string
        length: number
        units: string
      }[]
      date?: string
    }
    railways?: {
      total?: {
        length: number
        units: string
      }
      narrow_gauge?: {
        length: number | number
        electrified?: number | number
        units: string
        gauge?: string
      }
      standard_gauge?: {
        length: number | number
        electrified?: number | number
        units: string
        gauge?: string
      }
      broad_gauge?: {
        length: number | number
        electrified?: number | number
        units: string
        gauge?: string
      }
      other?: {
        length?: number
        units?: string
      }
      note?: any
      global_rank?: number
      date?: string
    }
    roadways?: {
      total?: OptionalUnitValue
      paved?: OptionalUnitValue
      unpaved?: OptionalUnitValue
      global_rank?: number
      date?: string
      note?: string
    }
    waterways?: {
      value: number
      units?: string
      note?: string
      global_rank?: number
      date?: string
    }
    merchant_marine?: {
      total: number
      by_type?: {
        type: string
        count: number
      }[]
      global_rank?: number
      date?: string
    }
    ports_and_terminals?: {
      lake_ports?: string[]
      oil_terminals?: string[]
      river_ports?: string[]
      container_ports?: {
        place: string
        twenty_foot_equivalent_units: number
      }[]
      major_seaports?: string[]
    }
    liquid_natural_gas_terminals_export?: string[]
    liquid_natural_gas_terminals_import?: string[]
    cargo_ports?: string
    cruise_departure_ports_passengers?: string
    date?: string
  }
  military_and_security?: {
    expenditures?: {
      annual_values: Value[]
      global_rank: number
    }
    service_age_and_obligation?: {
      years_of_age?: number
      note?: string
      date?: string
    }
    note?: string
  }
  transnational_issues: {
    disputes: string[]
    refugees_and_iternally_displaced_persons?: {
      refugees?: {
        by_country: {
          people: number | string
          country_of_origin?: number | string
        }[]
      }
      internally_displaced_persons?: {
        people?: number
        note?: string
        date?: string
      }
      stateless_persons?: {
        people?: number
        date?: string
      }
      note?: string
    }
    illicit_drugs?: {
      note?: string
    }
  }
}

interface PeopleValue {
  name?: string
  percent?: number
  note?: string
  breakdown?: {
    name: string
    percent?: number
  }[]
}

interface SubscriptionValue {
  total_subscriptions?: number
  subscriptions_per_one_hundred_inhabitants?: number
  global_rank?: number
  date?: string
}

interface OilValue {
  bbl_per_day?: number
  global_rank: number
  date?: string
}

interface AgeBreakdown {
  percent: number
  males: number
  females: number
}

interface FuelValue {
  percent: number
  global_rank: number
  date?: string
}

interface EnergyValue {
  kWh?: number
  global_rank: number
  date?: string
}

interface BorderCountry {
  country: string
  border_length: Value
  note?: string
}
export interface Ethnicity {
  name?: string
  percent?: number
  note?: string
  breakdown?: {
    name: string
    percent?: number
  }[]
}

export interface Hazard {
  description: string
  type: 'hazard' | 'volcanism' | string
}

export interface ElevationPoint {
  name: string
  elevation: OptionalUnitValue
  note?: string
}

interface World {
  countries: {
    world: CountryObject
    afghanistan: CountryObject
    akrotiri: CountryObject
    albania: CountryObject
    algeria: CountryObject
    american_samoa: CountryObject
    andorra: CountryObject
    angola: CountryObject
    anguilla: CountryObject
    antarctica: CountryObject
    antigua_and_barbuda: CountryObject
    arctic_ocean: CountryObject
    argentina: CountryObject
    armenia: CountryObject
    aruba: CountryObject
    ashmore_and_cartier_islands: CountryObject
    atlantic_ocean: CountryObject
    australia: CountryObject
    austria: CountryObject
    azerbaijan: CountryObject
    bahamas_the: CountryObject
    bahrain: CountryObject
    bangladesh: CountryObject
    barbados: CountryObject
    belarus: CountryObject
    belgium: CountryObject
    belize: CountryObject
    benin: CountryObject
    bermuda: CountryObject
    bhutan: CountryObject
    bolivia: CountryObject
    bosnia_and_herzegovina: CountryObject
    botswana: CountryObject
    bouvet_island: CountryObject
    brazil: CountryObject
    british_indian_ocean_territory: CountryObject
    british_virgin_islands: CountryObject
    brunei: CountryObject
    bulgaria: CountryObject
    burkina_faso: CountryObject
    burma: CountryObject
    burundi: CountryObject
    cabo_verde: CountryObject
    cambodia: CountryObject
    cameroon: CountryObject
    canada: CountryObject
    cayman_islands: CountryObject
    central_african_republic: CountryObject
    chad: CountryObject
    chile: CountryObject
    china: CountryObject
    christmas_island: CountryObject
    clipperton_island: CountryObject
    cocos_keeling_islands: CountryObject
    colombia: CountryObject
    comoros: CountryObject
    congo_democratic_republic_of_the: CountryObject
    congo_republic_of_the: CountryObject
    cook_islands: CountryObject
    coral_sea_islands: CountryObject
    costa_rica: CountryObject
    "cote_d'_ivoire": CountryObject
    croatia: CountryObject
    cuba: CountryObject
    curacao: CountryObject
    cyprus: CountryObject
    czechia: CountryObject
    denmark: CountryObject
    dhekelia: CountryObject
    djibouti: CountryObject
    dominica: CountryObject
    dominican_republic: CountryObject
    ecuador: CountryObject
    egypt: CountryObject
    el_salvador: CountryObject
    equatorial_guinea: CountryObject
    eritrea: CountryObject
    estonia: CountryObject
    eswatini: CountryObject
    ethiopia: CountryObject
    falkland_islands_islas_malvinas: CountryObject
    faroe_islands: CountryObject
    fiji: CountryObject
    finland: CountryObject
    france: CountryObject
    french_polynesia: CountryObject
    gabon: CountryObject
    gambia_the: CountryObject
    gaza_strip: CountryObject
    georgia: CountryObject
    germany: CountryObject
    ghana: CountryObject
    gibraltar: CountryObject
    greece: CountryObject
    greenland: CountryObject
    grenada: CountryObject
    guam: CountryObject
    guatemala: CountryObject
    guernsey: CountryObject
    guinea: CountryObject
    guinea_bissau: CountryObject
    guyana: CountryObject
    haiti: CountryObject
    heard_island_and_mcdonald_islands: CountryObject
    holy_see_vatican_city: CountryObject
    honduras: CountryObject
    hong_kong: CountryObject
    hungary: CountryObject
    iceland: CountryObject
    india: CountryObject
    indian_ocean: CountryObject
    indonesia: CountryObject
    iran: CountryObject
    iraq: CountryObject
    ireland: CountryObject
    isle_of_man: CountryObject
    israel: CountryObject
    italy: CountryObject
    jamaica: CountryObject
    jan_mayen: CountryObject
    japan: CountryObject
    jersey: CountryObject
    jordan: CountryObject
    kazakhstan: CountryObject
    kenya: CountryObject
    kiribati: CountryObject
    korea_north: CountryObject
    korea_south: CountryObject
    kosovo: CountryObject
    kuwait: CountryObject
    kyrgyzstan: CountryObject
    laos: CountryObject
    latvia: CountryObject
    lebanon: CountryObject
    lesotho: CountryObject
    liberia: CountryObject
    libya: CountryObject
    liechtenstein: CountryObject
    lithuania: CountryObject
    luxembourg: CountryObject
    macau: CountryObject
    madagascar: CountryObject
    malawi: CountryObject
    malaysia: CountryObject
    maldives: CountryObject
    mali: CountryObject
    malta: CountryObject
    marshall_islands: CountryObject
    mauritania: CountryObject
    mauritius: CountryObject
    mexico: CountryObject
    micronesia_federated_states_of: CountryObject
    moldova: CountryObject
    monaco: CountryObject
    mongolia: CountryObject
    montenegro: CountryObject
    montserrat: CountryObject
    morocco: CountryObject
    mozambique: CountryObject
    namibia: CountryObject
    nauru: CountryObject
    navassa_island: CountryObject
    nepal: CountryObject
    netherlands: CountryObject
    new_caledonia: CountryObject
    new_zealand: CountryObject
    nicaragua: CountryObject
    niger: CountryObject
    nigeria: CountryObject
    niue: CountryObject
    norfolk_island: CountryObject
    north_macedonia: CountryObject
    northern_mariana_islands: CountryObject
    norway: CountryObject
    oman: CountryObject
    pacific_ocean: CountryObject
    pakistan: CountryObject
    palau: CountryObject
    panama: CountryObject
    papua_new_guinea: CountryObject
    paracel_islands: CountryObject
    paraguay: CountryObject
    peru: CountryObject
    philippines: CountryObject
    pitcairn_islands: CountryObject
    poland: CountryObject
    portugal: CountryObject
    puerto_rico: CountryObject
    qatar: CountryObject
    romania: CountryObject
    russia: CountryObject
    rwanda: CountryObject
    saint_barthelemy: CountryObject
    saint_helena_ascension_and_tristan_da_cunha: CountryObject
    saint_kitts_and_nevis: CountryObject
    saint_lucia: CountryObject
    saint_martin: CountryObject
    saint_pierre_and_miquelon: CountryObject
    saint_vincent_and_the_grenadines: CountryObject
    samoa: CountryObject
    san_marino: CountryObject
    sao_tome_and_principe: CountryObject
    saudi_arabia: CountryObject
    senegal: CountryObject
    serbia: CountryObject
    seychelles: CountryObject
    sierra_leone: CountryObject
    singapore: CountryObject
    sint_maarten: CountryObject
    slovakia: CountryObject
    slovenia: CountryObject
    solomon_islands: CountryObject
    somalia: CountryObject
    south_africa: CountryObject
    south_georgia_and_south_sandwich_islands: CountryObject
    south_sudan: CountryObject
    southern_ocean: CountryObject
    spain: CountryObject
    spratly_islands: CountryObject
    sri_lanka: CountryObject
    sudan: CountryObject
    suriname: CountryObject
    svalbard: CountryObject
    sweden: CountryObject
    switzerland: CountryObject
    syria: CountryObject
    taiwan: CountryObject
    tajikistan: CountryObject
    tanzania: CountryObject
    thailand: CountryObject
    timor_leste: CountryObject
    togo: CountryObject
    tokelau: CountryObject
    tonga: CountryObject
    trinidad_and_tobago: CountryObject
    tunisia: CountryObject
    turkey: CountryObject
    turkmenistan: CountryObject
    turks_and_caicos_islands: CountryObject
    tuvalu: CountryObject
    uganda: CountryObject
    ukraine: CountryObject
    united_arab_emirates: CountryObject
    united_kingdom: CountryObject
    united_states: CountryObject
    uruguay: CountryObject
    uzbekistan: CountryObject
    vanuatu: CountryObject
    venezuela: CountryObject
    vietnam: CountryObject
    virgin_islands: CountryObject
    wake_island: CountryObject
    wallis_and_futuna: CountryObject
    west_bank: CountryObject
    western_sahara: CountryObject
    yemen: CountryObject
    zambia: CountryObject
    zimbabwe: CountryObject
    european_union: CountryObject
  }
  metadata: {
    date: string
    parser_version: string
    parsed_time: string
  }
}

interface CountryObject {
  data: GenericCountry
  metadata: {
    date: string
    source: string
    nearby_dates: string
  }
}
interface OptionalUnitValue {
  value: number
  units?: string
}
