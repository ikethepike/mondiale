/* eslint-disable no-console */
import * as fs from 'fs'
import { World } from './types/imports'

let unparsed
try {
  unparsed = fs.readFileSync('./world.json')
} catch (e) {
  console.error('failed to read world.json', e)
}
const world: World = JSON.parse(unparsed)
