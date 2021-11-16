import tmp from 'tmp'
import Corestore from 'corestore'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import * as sfw from '../dist/index.js'

const NUM_FILES = 1e3
const NUM_READS = 100
const FILE_SIZE = 1e3
const VALUE = randomBytes(FILE_SIZE)
tmp.setGracefulCleanup()

const dir = tmp.dirSync()
const store = new Corestore(dir.name)
const ws = await sfw.Workspace.createNew(store)

console.log('SFW')
console.log('===')

console.log('')
console.log(`Writing ${NUM_FILES} files of ${FILE_SIZE} bytes each`)
await bench(NUM_FILES, async () => {
  for (let i = 0; i < NUM_FILES; i++) {
    await ws.writeFile(`/file${i}`, VALUE)
  }
})

console.log('')
console.log(`Listing all files ${NUM_READS} times`)
await bench(NUM_READS, async () => {
  for (let i = 0; i < NUM_READS; i++) {
    await ws.listFiles()
  }
})

// console.log('')
// console.log(`Listing all history ${NUM_READS} times`)
// await bench(NUM_READS, async () => {
//   for (let i = 0; i < NUM_READS; i++) {
//     await ws.listHistory()
//   }
// })

console.log('')
console.log(`Reading a file ${NUM_READS} times`)
await bench(NUM_READS, async () => {
  for (let i = 0; i < NUM_READS; i++) {
    await ws.readFile('/file0')
  }
})

console.log('')
console.log('Normal FS')
console.log('=========')

const dir2 = tmp.dirSync()
console.log('')
console.log(`Writing ${NUM_FILES} files of ${FILE_SIZE} bytes each`)
await bench(NUM_FILES, async () => {
  for (let i = 0; i < NUM_FILES; i++) {
    await fs.writeFile(`${dir2.name}/file${i}`, VALUE)
  }
})

console.log('')
console.log(`Listing all files ${NUM_READS} times`)
await bench(NUM_READS, async () => {
  for (let i = 0; i < NUM_READS; i++) {
    await fs.readdir(dir2.name)
  }
})

console.log('')
console.log(`Reading a file ${NUM_READS} times`)
await bench(NUM_READS, async () => {
  for (let i = 0; i < NUM_READS; i++) {
    await fs.readFile(`${dir2.name}/file0`)
  }
})

async function bench (numOps, fn) {
  const start = Date.now()
  await fn()
  const total = Date.now() - start
  console.log(`=> ${total}ms (${numOps / (total / 1000)} ops/s average)`)
}