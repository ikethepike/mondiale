import { strFromU8, unzipSync } from 'fflate'

/** Minimal RFC 4180 CSV parser (handles quoted fields with commas/newlines). */
export const parseCSV = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter(cells => cells.some(cell => cell.length))
}

/** Downloads a ZIP, extracts its first CSV entry and parses it. */
export const fetchZippedCsv = async (url: string): Promise<string[][]> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download dataset (${response.status}): ${url}`)
  }

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const csvEntry = Object.keys(archive).find(name => name.toLowerCase().endsWith('.csv'))
  if (!csvEntry) throw new Error(`No CSV file found in archive: ${url}`)

  return parseCSV(strFromU8(archive[csvEntry]))
}

/** Header lookup that fails the build loudly when a dataset's schema drifts. */
export const columnLookup = (header: string[], source: string) => (name: string) => {
  const index = header.indexOf(name)
  if (index === -1) throw new Error(`Column "${name}" missing from ${source} CSV`)
  return index
}
