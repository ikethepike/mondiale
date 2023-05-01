

  export const factbookRegions = ["Asia","Europe","Africa","Central America and the Caribbean","South America","Oceania","Middle East","Southeast Asia","North America","<p><strong>metropolitan France:</strong> Europe; </p><p><strong>French Guiana:</strong> South America; </p><p><strong>Guadeloupe:</strong> Central America and the Caribbean; </p><p><strong>Martinique:</strong> Central America and the Caribbean; </p><p><strong>Mayotte:</strong> Africa; </p><p><strong>Reunion:</strong> World</p>","Arctic Region"] as const 
  export type FactbookRegion = typeof factbookRegions[number]
  