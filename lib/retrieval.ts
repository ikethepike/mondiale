export const getRandomValue = (array: any[]) =>
  array[Math.floor(Math.random() * array.length)]

export const getRandomValues = (array: any[], values: number) => {
  const shuffled = array.sort(() => 0.5 - Math.random())
  return shuffled.slice(0, values)
}
