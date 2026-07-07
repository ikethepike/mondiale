import { CanvasTexture, SRGBColorSpace } from 'three'

export interface NumberAtlas {
  texture: CanvasTexture
  /** UV rect for a number, in [0,1] atlas space. */
  uvFor(value: number): { u: number; v: number; width: number; height: number }
}

const ATLAS_COLUMNS = 10
const CELL_SIZE = 96

/** One canvas with the digits 0..count-1 in Lusitana — one texture, one draw call. */
export const createNumberAtlas = (count: number, color: string): NumberAtlas => {
  const rows = Math.ceil(count / ATLAS_COLUMNS)
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLUMNS * CELL_SIZE
  canvas.height = rows * CELL_SIZE

  const context = canvas.getContext('2d')
  if (!context) throw new EvalError('Unable to acquire 2d context for number atlas')

  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `bold ${CELL_SIZE * 0.52}px Lusitana, serif`

  for (let value = 0; value < count; value++) {
    const column = value % ATLAS_COLUMNS
    const row = Math.floor(value / ATLAS_COLUMNS)
    context.fillText(
      String(value),
      column * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2
    )
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4

  return {
    texture,
    uvFor(value) {
      const column = value % ATLAS_COLUMNS
      const row = Math.floor(value / ATLAS_COLUMNS)
      return {
        u: column / ATLAS_COLUMNS,
        // Canvas rows count downward, UV space counts upward
        v: 1 - (row + 1) / rows,
        width: 1 / ATLAS_COLUMNS,
        height: 1 / rows,
      }
    },
  }
}

/** Rasterize an icon SVG (stroke/fill agnostic) into a solid-color texture. */
export const svgToTexture = async (
  svgMarkup: string,
  color: string,
  size = 128
): Promise<CanvasTexture> => {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new EvalError('Unable to rasterize icon svg'))
      image.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new EvalError('Unable to acquire 2d context for icon texture')

    context.drawImage(image, 0, 0, size, size)
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = color
    context.fillRect(0, 0, size, size)

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  } finally {
    URL.revokeObjectURL(url)
  }
}
