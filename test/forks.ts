import ava from 'ava'
import { setupTwo } from './util/util.js'
import * as sfw from '../src/index.js'

ava('conflicting and merging writes to individual file', async t => {
  const VALUES = [
    Buffer.from('writer1', 'utf-8'),
    Buffer.from('writer2', 'utf-8')
  ]

  const {sim, ws1, ws2, writer1, writer2} = await setupTwo(t)

  // conflicting writes

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  console.log('\nDISCONNECT\n')
  sim.disconnect(sim.stores[0], sim.stores[1])

  await ws1.writeFile('/test.txt', VALUES[0])
  await ws2.writeFile('/test.txt', VALUES[1])

  // not yet synced

  t.deepEqual(await ws1.readFile('/test.txt'), VALUES[0])
  t.deepEqual(await ws2.readFile('/test.txt'), VALUES[1])

  // synced but in conflict state

  console.log('\nCONNECT\n')
  sim.connect(sim.stores[0], sim.stores[1])

  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 1)
    }
  }

  // merging write

  await ws1.writeFile('/test.txt', VALUES[0])
  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 0) // no conflicts
    }
  }
})

ava('conflicting and merging writes & deletes to individual file', async t => {
  const VALUES = [
    Buffer.from('first write', 'utf-8'),
    Buffer.from('second write', 'utf-8'),
    Buffer.from('third write', 'utf-8')
  ]

  const {sim, ws1, ws2, writer1, writer2} = await setupTwo(t)

  // create a file

  await ws1.writeFile('/test.txt', VALUES[0])

  // conflicting write & delete

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  console.log('\nDISCONNECT\n')
  sim.disconnect(sim.stores[0], sim.stores[1])

  await ws1.deleteFile('/test.txt')
  await ws2.writeFile('/test.txt', VALUES[1])

  // not yet synced

  t.deepEqual(await ws1.readFile('/test.txt'), undefined)
  t.deepEqual(await ws2.readFile('/test.txt'), VALUES[1])

  // synced but in conflict state

  console.log('\nCONNECT\n')
  sim.connect(sim.stores[0], sim.stores[1])

  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 1)
    }
  }

  // file is still present in listing even though it may be in a "deleted" state
  t.is((await ws1.listFiles('/')).length, 1)
  t.is((await ws2.listFiles('/')).length, 1)

  // merging write

  await ws1.writeFile('/test.txt', VALUES[2])
  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 0) // no conflicts
    }
  }
})

ava('conflicting and merging writes & moves to individual file', async t => {
  const VALUES = [
    Buffer.from('first write', 'utf-8'),
    Buffer.from('second write', 'utf-8'),
    Buffer.from('third write', 'utf-8')
  ]

  const {sim, ws1, ws2, writer1, writer2} = await setupTwo(t)

  // create a file

  await ws1.writeFile('/test.txt', VALUES[0])

  // conflicting write & delete

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  console.log('\nDISCONNECT\n')
  sim.disconnect(sim.stores[0], sim.stores[1])

  await ws1.moveFile('/test.txt', '/test2.txt')
  await ws2.writeFile('/test.txt', VALUES[1])

  // not yet synced

  t.deepEqual(await ws1.readFile('/test.txt'), undefined)
  t.deepEqual(await ws1.readFile('/test2.txt'), VALUES[0])
  t.deepEqual(await ws2.readFile('/test.txt'), VALUES[1])

  // synced but in conflict state

  console.log('\nCONNECT\n')
  sim.connect(sim.stores[0], sim.stores[1])

  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 1)
    }
  }

  t.deepEqual(
    await ws1.readFile('/test2.txt'),
    await ws2.readFile('/test2.txt')
  )
  {
    const info1 = await ws1.statFile('/test2.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test2.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 0)
    }
  }

  // file is still present in listing even though it may be in a "deleted" state
  t.is((await ws1.listFiles('/')).length, 2)
  t.is((await ws2.listFiles('/')).length, 2)
})

ava('conflicting and merging writes & copies to individual file', async t => {
  const VALUES = [
    Buffer.from('first write', 'utf-8'),
    Buffer.from('second write', 'utf-8'),
    Buffer.from('third write', 'utf-8')
  ]

  const {sim, ws1, ws2, writer1, writer2} = await setupTwo(t)

  // create two file

  await ws1.writeFile('/test.txt', VALUES[0])
  await ws1.writeFile('/test2.txt', VALUES[1])

  // conflicting write & delete

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  console.log('\nDISCONNECT\n')
  sim.disconnect(sim.stores[0], sim.stores[1])

  await ws1.copyFile('/test2.txt', '/test.txt')
  await ws2.writeFile('/test.txt', VALUES[2])

  // not yet synced

  t.deepEqual(await ws1.readFile('/test.txt'), VALUES[1])
  t.deepEqual(await ws1.readFile('/test2.txt'), VALUES[1])
  t.deepEqual(await ws2.readFile('/test.txt'), VALUES[2])

  // synced but in conflict state

  console.log('\nCONNECT\n')
  sim.connect(sim.stores[0], sim.stores[1])

  t.deepEqual(
    await ws1.readFile('/test.txt'),
    await ws2.readFile('/test.txt')
  )
  {
    const info1 = await ws1.statFile('/test.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 1)
    }
  }

  t.deepEqual(
    await ws1.readFile('/test2.txt'),
    await ws2.readFile('/test2.txt')
  )
  {
    const info1 = await ws1.statFile('/test2.txt')
    t.truthy(info1)
    const info2 = await ws2.statFile('/test2.txt')
    t.truthy(info2)
    if (info1 && info2) {
      t.deepEqual(info1, info2)
    }
    if (info1){
      t.is(info1.conflicts?.length, 0)
    }
  }

  // file is still present in listing even though it may be in a "deleted" state
  t.is((await ws1.listFiles('/')).length, 2)
  t.is((await ws2.listFiles('/')).length, 2)
})