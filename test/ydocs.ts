import ava from 'ava'
import { setupOne, setupTwo } from './util/util.js'
import * as Y from 'yjs'

ava('ydoc read/write', async t => {
  const {ws} = await setupOne(t)

  const ydoc1 = new Y.Doc()

  const readFile = async (path: string) => {
    const ydoc2 = new Y.Doc()
    const state = await ws.readAllFileStates(path)
    for (const item of state) {
      Y.applyUpdate(ydoc2, item.data)
    }
    return String(ydoc2.getText())
  }

  // write 1

  ydoc1.getText().insert(0, 'Hello, world!')
  await ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(ydoc1)), {noMerge: true})
  t.deepEqual(await readFile('/test.txt'), 'Hello, world!')

  // write 2

  ydoc1.getText().delete(7, 13)
  ydoc1.getText().insert(7, 'universe!')
  await ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(ydoc1)), {noMerge: true})
  t.deepEqual(await readFile('/test.txt'), 'Hello, universe!')
})

ava('ydoc read/write two writers', async t => {
  const {ws1, ws2} = await setupTwo(t)

  const writer1 = {ws: ws1, ydoc: new Y.Doc()}
  const writer2 = {ws: ws2, ydoc: new Y.Doc()}

  // write 1

  writer1.ydoc.getText().insert(0, 'Hello, world!')
  await writer1.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer1.ydoc)), {noMerge: true})

  for (const writer of [writer1, writer2]) {
    const state = await writer.ws.readAllFileStates('/test.txt')
    for (const item of state) {
      Y.applyUpdate(writer.ydoc, item.data)
    }
    t.deepEqual(String(writer.ydoc.getText()), 'Hello, world!')
  }

  // write 2

  writer2.ydoc.getText().delete(7, 13)
  writer2.ydoc.getText().insert(7, 'universe!')
  await writer2.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer2.ydoc)), {noMerge: true})

  for (const writer of [writer1, writer2]) {
    const state = await writer.ws.readAllFileStates('/test.txt')
    for (const item of state) {
      Y.applyUpdate(writer.ydoc, item.data)
    }
    t.deepEqual(String(writer.ydoc.getText()), 'Hello, universe!')
  }

  // write 3

  writer2.ydoc.getText().delete(7, 13)
  writer2.ydoc.getText().insert(7, 'UNIVERSE!')
  await writer2.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer2.ydoc)), {noMerge: true})

  for (const writer of [writer1, writer2]) {
    const state = await writer.ws.readAllFileStates('/test.txt')
    for (const item of state) {
      Y.applyUpdate(writer.ydoc, item.data)
    }
    t.deepEqual(String(writer.ydoc.getText()), 'Hello, UNIVERSE!')
  }

  // file noted as "noMerge" rather than "in conflict"

  for (const writer of [writer1, writer2]) {
    const info = await writer.ws.statFile('/test.txt')
    t.is(info?.conflict, false)
    t.is(info?.noMerge, true)
    t.is(info?.otherChanges?.length, 1)
  }
})

ava('conflicted copies and moves not allowed', async t => {
  const {ws1, ws2} = await setupTwo(t)

  const writer1 = {ws: ws1, ydoc: new Y.Doc()}
  const writer2 = {ws: ws2, ydoc: new Y.Doc()}

  // write

  writer1.ydoc.getText().insert(0, 'Hello, world!')
  await writer1.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer1.ydoc)), {noMerge: true})
  writer2.ydoc.getText().insert(0, 'Hello, world!')
  await writer2.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer2.ydoc)), {noMerge: true})

  // copy & write fail

  await t.throwsAsync(() => writer1.ws.moveFile('/test.txt', '/test2.txt'))
  await t.throwsAsync(() => writer1.ws.copyFile('/test.txt', '/test2.txt'))
  await t.throwsAsync(() => writer2.ws.moveFile('/test.txt', '/test2.txt'))
  await t.throwsAsync(() => writer2.ws.copyFile('/test.txt', '/test2.txt'))
})

ava('ydoc read/write during a fork', async t => {
  const {sim, ws1, ws2} = await setupTwo(t)

  const writer1 = {ws: ws1, ydoc: new Y.Doc()}
  const writer2 = {ws: ws2, ydoc: new Y.Doc()}

  const readFile = async (writer: any, path: string) => {
    const state = await writer.ws.readAllFileStates(path)
    for (const item of state) {
      Y.applyUpdate(writer.ydoc, item.data)
    }
    return String(writer.ydoc.getText())
  }

  // forked writes

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  sim.disconnect(sim.stores[0], sim.stores[1])

  writer1.ydoc.getText().insert(0, 'writer1')
  await writer1.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer1.ydoc)), {noMerge: true})
  writer2.ydoc.getText().insert(0, 'writer2')
  await writer2.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer2.ydoc)), {noMerge: true})

  t.deepEqual(await readFile(writer1, 'test.txt'), 'writer1')
  t.deepEqual(await readFile(writer2, 'test.txt'), 'writer2')

  // merge

  sim.connect(sim.stores[0], sim.stores[1])
  t.deepEqual(await readFile(writer1, 'test.txt'), await readFile(writer2, 'test.txt'))

  // forked writes 2

  // HACK sync state prior to disconnect, works around https://github.com/hypercore-protocol/autobase/issues/7
  await ws1.listFiles()
  await ws2.listFiles()

  sim.disconnect(sim.stores[0], sim.stores[1])

  const orgValue = (await readFile(writer1, 'test.txt'))
  writer1.ydoc.getText().delete(0, orgValue.length)
  await writer1.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer1.ydoc)), {noMerge: true})
  writer2.ydoc.getText().insert(orgValue.length, ' and more text')
  await writer2.ws.writeFile('/test.txt', Buffer.from(Y.encodeStateAsUpdate(writer2.ydoc)), {noMerge: true})

  t.deepEqual(await readFile(writer1, 'test.txt'), '')
  t.deepEqual(await readFile(writer2, 'test.txt'), `${orgValue} and more text`)

  // merge

  sim.connect(sim.stores[0], sim.stores[1])
  t.deepEqual(await readFile(writer1, 'test.txt'), ' and more text')
  t.deepEqual(await readFile(writer2, 'test.txt'), ' and more text')
})
