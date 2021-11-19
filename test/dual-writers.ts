import ava from 'ava'
import { setupTwo } from './util/util.js'
import * as sfw from '../src/index.js'

ava('dual-writers individual file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8'),
    Buffer.from('Hello, universe', 'utf-8')
  ]

   const {ws1, ws2, writer1, writer2} = await setupTwo(t)

  t.deepEqual(await ws1.listFiles('/'), [])
  t.falsy(await ws1.statFile('/test.txt'))
  t.falsy(await ws1.statFile('test.txt'))
  t.deepEqual(await ws2.listFiles('/'), [])
  t.falsy(await ws2.statFile('/test.txt'))
  t.falsy(await ws2.statFile('test.txt'))

  // first write

  await ws1.writeFile('/test.txt', VALUES[0])

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test.txt'), VALUES[0])
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      if (info) {
        t.is(info.path, '/test.txt')
        t.truthy(info.timestamp instanceof Date)
        t.truthy(info.writer.equals(writer1.publicKey))
        t.truthy(typeof info.change === 'string')
        t.is(info.conflict, false)
        t.is(info.otherChanges?.length, 0)
        t.is(info.bytes, VALUES[0].length)
      }
      const info2 = await ws.statFile('test.txt')
      t.deepEqual(info, info2)
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const listing = await ws.listFiles('/')
      t.is(listing.length, 1)
      if (info) {
        t.deepEqual(info, listing[0])
      }
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const history = await ws.listHistory()
      t.is(history.length, 2)
      if (info) {
        t.is(history[1].id, info.change)
        t.is(history[1].parents.length, 0)
        t.truthy(history[1].writer.equals(writer1.publicKey))
        t.deepEqual(history[1].timestamp, info.timestamp)
        t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
        t.is((history[1].details as sfw.ChangeOpPut).path, '/test.txt')
        t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
        t.is((history[1].details as sfw.ChangeOpPut).bytes, info.bytes)
      }
    }
  }

  // second write

  await ws2.writeFile('/test.txt', VALUES[1])

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test.txt'), VALUES[1])
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      if (info) {
        t.is(info.path, '/test.txt')
        t.truthy(info.timestamp instanceof Date)
        t.truthy(info.writer.equals(writer2.publicKey))
        t.truthy(typeof info.change === 'string')
        t.is(info.conflict, false)
        t.is(info.otherChanges?.length, 0)
        t.is(info.bytes, VALUES[1].length)
      }
      const info2 = await ws.statFile('test.txt')
      t.deepEqual(info, info2)
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const listing = await ws.listFiles('/')
      t.is(listing.length, 1)
      if (info) {
        t.deepEqual(info, listing[0])
      }
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const history = await ws.listHistory()
      t.is(history.length, 3)
      if (info) {
        t.is(history[2].id, info.change)
        t.is(history[2].parents.length, 1)
        t.truthy(history[2].writer.equals(writer2.publicKey))
        t.deepEqual(history[2].timestamp, info.timestamp)
        t.is(history[2].details.action, sfw.OP_CHANGE_ACT_PUT)
        t.is((history[2].details as sfw.ChangeOpPut).path, '/test.txt')
        t.is(typeof (history[2].details as sfw.ChangeOpPut).blob, 'string')
        t.is((history[2].details as sfw.ChangeOpPut).bytes, info.bytes)
      }
    }
  }

  // delete

  await ws1.deleteFile('/test.txt')

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test.txt'), undefined)
    {
      const info = await ws.statFile('/test.txt')
      t.falsy(info)
      const info2 = await ws.statFile('test.txt')
      t.falsy(info2)
    }
    {
      const listing = await ws.listFiles('/')
      t.is(listing.length, 0)
    }
    {
      const history = await ws.listHistory()
      t.is(history.length, 4)
      t.is(typeof history[3].id, 'string')
      t.is(history[3].parents.length, 1)
      t.truthy(history[3].writer.equals(writer1.publicKey))
      t.truthy(history[3].timestamp instanceof Date)
      t.is(history[3].details.action, sfw.OP_CHANGE_ACT_DEL)
      t.is((history[3].details as sfw.ChangeOpDel).path, '/test.txt')
    }
  }

  // third write

  await ws2.writeFile('test.txt', VALUES[0])

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test.txt'), VALUES[0])
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      if (info) {
        t.is(info.path, '/test.txt')
        t.truthy(info.timestamp instanceof Date)
        t.truthy(info.writer.equals(writer2.publicKey))
        t.truthy(typeof info.change === 'string')
        t.is(info.conflict, false)
        t.is(info.otherChanges?.length, 0)
        t.is(info.bytes, VALUES[0].length)
      }
      const info2 = await ws.statFile('test.txt')
      t.deepEqual(info, info2)
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const listing = await ws.listFiles('/')
      t.is(listing.length, 1)
      if (info) {
        t.deepEqual(info, listing[0])
      }
    }
    {
      const info = await ws.statFile('/test.txt')
      t.truthy(info)
      const history = await ws.listHistory()
      t.is(history.length, 5)
      if (info) {
        t.is(history[4].id, info.change)
        t.is(history[4].parents.length, 0)
        t.truthy(history[4].writer.equals(writer2.publicKey))
        t.deepEqual(history[4].timestamp, info.timestamp)
        t.is(history[4].details.action, sfw.OP_CHANGE_ACT_PUT)
        t.is((history[4].details as sfw.ChangeOpPut).path, '/test.txt')
        t.is(typeof (history[4].details as sfw.ChangeOpPut).blob, 'string')
        t.is((history[4].details as sfw.ChangeOpPut).bytes, info.bytes)
      }
    }
  }
})

ava('dual-writers copy file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8')
  ]

  const {ws1, ws2, writer1, writer2} = await setupTwo(t)

  await ws1.writeFile('/test1.txt', VALUES[0])
  await ws2.copyFile('/test1.txt', '/test2.txt')

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test1.txt'), VALUES[0])
    t.deepEqual(await ws.readFile('/test2.txt'), VALUES[0])
    {
      const info1 = await ws.statFile('/test1.txt')
      t.truthy(info1)
      if (info1) {
        t.is(info1.path, '/test1.txt')
        t.truthy(info1.timestamp instanceof Date)
        t.truthy(info1.writer.equals(writer1.publicKey))
        t.truthy(typeof info1.change === 'string')
        t.is(info1.otherChanges?.length, 0)
        t.is(info1.bytes, VALUES[0].length)
      }
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      if (info2) {
        t.is(info2.path, '/test2.txt')
        t.truthy(info2.timestamp instanceof Date)
        t.truthy(info2.writer.equals(writer2.publicKey))
        t.truthy(typeof info2.change === 'string')
        t.is(info2.otherChanges?.length, 0)
        t.is(info2.bytes, VALUES[0].length)
      }
    }
    {
      const info1 = await ws.statFile('/test1.txt')
      t.truthy(info1)
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      const listing = await ws.listFiles('/')
      t.is(listing.length, 2)
      if (info1) {
        t.deepEqual(info1, listing.find(i => i.path === '/test1.txt'))
      }
      if (info2) {
        t.deepEqual(info2, listing.find(i => i.path === '/test2.txt'))
      }
    }
    {
      const info1 = await ws.statFile('/test1.txt')
      t.truthy(info1)
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      const history = await ws.listHistory()
      t.is(history.length, 3)
      if (info1) {
        t.is(history[1].id, info1.change)
        t.is(history[1].parents.length, 0)
        t.truthy(history[1].writer.equals(writer1.publicKey))
        t.deepEqual(history[1].timestamp, info1.timestamp)
        t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
        t.is((history[1].details as sfw.ChangeOpPut).path, '/test1.txt')
        t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
        t.is((history[1].details as sfw.ChangeOpPut).bytes, info1.bytes)
      }
      if (info2) {
        t.is(history[2].id, info2.change)
        t.is(history[2].parents.length, 0)
        t.truthy(history[2].writer.equals(writer2.publicKey))
        t.deepEqual(history[2].timestamp, info2.timestamp)
        t.is(history[2].details.action, sfw.OP_CHANGE_ACT_COPY)
        t.is((history[2].details as sfw.ChangeOpCopy).path, '/test2.txt')
        t.is(typeof (history[2].details as sfw.ChangeOpCopy).blob, 'string')
        t.is((history[2].details as sfw.ChangeOpCopy).bytes, info2.bytes)
      }
    }
  }
})

ava('dual-writers move file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8')
  ]

  const {ws1, ws2, writer1, writer2} = await setupTwo(t)

  await ws1.writeFile('/test1.txt', VALUES[0])
  await ws2.moveFile('/test1.txt', '/test2.txt')

  for (const ws of [ws1, ws2]) {
    t.deepEqual(await ws.readFile('/test1.txt'), undefined)
    t.deepEqual(await ws.readFile('/test2.txt'), VALUES[0])
    {
      const info1 = await ws.statFile('/test1.txt')
      t.falsy(info1)
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      if (info2) {
        t.is(info2.path, '/test2.txt')
        t.truthy(info2.timestamp instanceof Date)
        t.truthy(info2.writer.equals(writer2.publicKey))
        t.truthy(typeof info2.change === 'string')
        t.is(info2.otherChanges?.length, 0)
        t.is(info2.bytes, VALUES[0].length)
      }
    }
    {
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      const listing = await ws.listFiles('/')
      t.is(listing.length, 1)
      if (info2) {
        t.deepEqual(info2, listing.find(i => i.path === '/test2.txt'))
      }
    }
    {
      const info2 = await ws.statFile('/test2.txt')
      t.truthy(info2)
      const history = await ws.listHistory()
      t.is(history.length, 4)
      
      t.is(typeof history[1].id, 'string')
      t.is(history[1].parents.length, 0)
      t.truthy(history[1].writer.equals(writer1.publicKey))
      t.truthy(history[1].timestamp instanceof Date)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is((history[1].details as sfw.ChangeOpPut).path, '/test1.txt')
      t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
      if (info2) {
        t.is((history[1].details as sfw.ChangeOpPut).bytes, info2.bytes)
      }

      if (info2) {
        t.is(history[2].id, info2.change)
        t.is(history[2].parents.length, 0)
        t.truthy(history[2].writer.equals(writer2.publicKey))
        t.deepEqual(history[2].timestamp, info2.timestamp)
        t.is(history[2].details.action, sfw.OP_CHANGE_ACT_COPY)
        t.is((history[2].details as sfw.ChangeOpCopy).path, '/test2.txt')
        t.is(typeof (history[2].details as sfw.ChangeOpCopy).blob, 'string')
        t.is((history[2].details as sfw.ChangeOpCopy).bytes, info2.bytes)
      }

      t.is(typeof history[3].id, 'string')
      t.is(history[3].parents.length, 1)
      t.truthy(history[3].writer.equals(writer2.publicKey))
      t.truthy(history[3].timestamp instanceof Date)
      t.is(history[3].details.action, sfw.OP_CHANGE_ACT_DEL)
      t.is((history[3].details as sfw.ChangeOpDel).path, '/test1.txt')
    }
  }
})