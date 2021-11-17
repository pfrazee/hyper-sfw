import ava from 'ava'
// @ts-ignore no types
import ram from 'random-access-memory'
// @ts-ignore no types
import Corestore from 'corestore'
import * as sfw from '../src/index.js'

ava('single-writer individual file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8'),
    Buffer.from('Hello, universe', 'utf-8')
  ]

  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  t.deepEqual(await ws.listFiles('/'), [])
  t.falsy(await ws.statFile('/test.txt'))
  t.falsy(await ws.statFile('test.txt'))

  // first write

  await ws.writeFile('/test.txt', VALUES[0])
  t.deepEqual(await ws.readFile('/test.txt'), VALUES[0])

  {
    const info = await ws.statFile('/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
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
    t.is(history.length, 1)
    if (info) {
      t.is(history[0].id, info.change)
      t.is(history[0].parents.length, 0)
      t.truthy(history[0].writer.equals(ws.writers[0].publicKey))
      t.is(history[0].path, '/test.txt')
      t.deepEqual(history[0].timestamp, info.timestamp)
      t.is(history[0].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[0].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[0].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }

  // second write

  await ws.writeFile('/test.txt', VALUES[1])
  t.deepEqual(await ws.readFile('/test.txt'), VALUES[1])

  {
    const info = await ws.statFile('/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
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
    t.is(history.length, 2)
    if (info) {
      t.is(history[1].id, info.change)
      t.is(history[1].parents.length, 1)
      t.truthy(history[1].writer.equals(ws.writers[0].publicKey))
      t.is(history[1].path, '/test.txt')
      t.deepEqual(history[1].timestamp, info.timestamp)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[1].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }

  // delete

  await ws.deleteFile('/test.txt')
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
    t.is(history.length, 3)
    t.is(typeof history[2].id, 'string')
    t.is(history[2].parents.length, 1)
    t.truthy(history[2].writer.equals(ws.writers[0].publicKey))
    t.is(history[2].path, '/test.txt')
    t.truthy(history[2].timestamp instanceof Date)
    t.is(history[2].details.action, sfw.OP_CHANGE_ACT_DEL)
  }

  // third write

  await ws.writeFile('test.txt', VALUES[0])
  t.deepEqual(await ws.readFile('/test.txt'), VALUES[0])

  {
    const info = await ws.statFile('/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
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
    t.is(history.length, 4)
    if (info) {
      t.is(history[3].id, info.change)
      t.is(history[3].parents.length, 0)
      t.truthy(history[3].writer.equals(ws.writers[0].publicKey))
      t.is(history[3].path, '/test.txt')
      t.deepEqual(history[3].timestamp, info.timestamp)
      t.is(history[3].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[3].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[3].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }
})

ava('single-writer multiple files', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8'),
    Buffer.from('Hello, universe', 'utf-8')
  ]

  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  // first write

  await ws.writeFile('/test1.txt', VALUES[0])
  await ws.writeFile('test2.txt', VALUES[1])

  {
    const info = await ws.statFile('/test1.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/test1.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info.change === 'string')
      t.is(info.conflict, false)
      t.is(info.otherChanges?.length, 0)
      t.is(info.bytes, VALUES[0].length)
    }
    const info2 = await ws.statFile('test1.txt')
    t.deepEqual(info, info2)
  }
  {
    const info = await ws.statFile('/test2.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/test2.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info.change === 'string')
      t.is(info.conflict, false)
      t.is(info.otherChanges?.length, 0)
      t.is(info.bytes, VALUES[1].length)
    }
    const info2 = await ws.statFile('test2.txt')
    t.deepEqual(info, info2)
  }
  {
    const info1 = await ws.statFile('/test1.txt')
    t.truthy(info1)
    const info2 = await ws.statFile('/test2.txt')
    t.truthy(info2)
    const listing = await ws.listFiles('/')
    t.is(listing.length, 2)
    if (info1) {
      t.deepEqual(listing.find(i => i.path === '/test1.txt'), info1)
    }
    if (info2) {
      t.deepEqual(listing.find(i => i.path === '/test2.txt'), info2)
    }
  }
  {
    const info1 = await ws.statFile('/test1.txt')
    t.truthy(info1)
    const info2 = await ws.statFile('/test2.txt')
    t.truthy(info2)
    const history = await ws.listHistory()
    t.is(history.length, 2)
    if (info1) {
      t.is(history[0].id, info1.change)
      t.is(history[0].parents.length, 0)
      t.truthy(history[0].writer.equals(ws.writers[0].publicKey))
      t.is(history[0].path, '/test1.txt')
      t.deepEqual(history[0].timestamp, info1.timestamp)
      t.is(history[0].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[0].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[0].details as sfw.ChangeOpPut).bytes, info1.bytes)
    }
    if (info2) {
      t.is(history[1].id, info2.change)
      t.is(history[1].parents.length, 0)
      t.truthy(history[1].writer.equals(ws.writers[0].publicKey))
      t.is(history[1].path, '/test2.txt')
      t.deepEqual(history[1].timestamp, info2.timestamp)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[1].details as sfw.ChangeOpPut).bytes, info2.bytes)
    }
  }
})

ava('single-writer individual file in a folder', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8'),
    Buffer.from('Hello, universe', 'utf-8')
  ]

  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  t.deepEqual(await ws.listFiles('/folder'), [])
  t.falsy(await ws.statFile('/folder/test.txt'))
  t.falsy(await ws.statFile('folder/test.txt'))

  // first write

  await ws.writeFile('/folder/test.txt', VALUES[0])
  t.deepEqual(await ws.readFile('/folder/test.txt'), VALUES[0])

  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/folder/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info.change === 'string')
      t.is(info.conflict, false)
      t.is(info.otherChanges?.length, 0)
      t.is(info.bytes, VALUES[0].length)
    }
    const info2 = await ws.statFile('folder/test.txt')
    t.deepEqual(info, info2)
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const listing = await ws.listFiles('/folder')
    t.is(listing.length, 1)
    if (info) {
      t.deepEqual(info, listing[0])
    }
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const history = await ws.listHistory()
    t.is(history.length, 1)
    if (info) {
      t.is(history[0].id, info.change)
      t.is(history[0].parents.length, 0)
      t.truthy(history[0].writer.equals(ws.writers[0].publicKey))
      t.is(history[0].path, '/folder/test.txt')
      t.deepEqual(history[0].timestamp, info.timestamp)
      t.is(history[0].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[0].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[0].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }

  // second write

  await ws.writeFile('/folder/test.txt', VALUES[1])
  t.deepEqual(await ws.readFile('/folder/test.txt'), VALUES[1])

  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/folder/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info.change === 'string')
      t.is(info.conflict, false)
      t.is(info.otherChanges?.length, 0)
      t.is(info.bytes, VALUES[1].length)
    }
    const info2 = await ws.statFile('folder/test.txt')
    t.deepEqual(info, info2)
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const listing = await ws.listFiles('/folder/')
    t.is(listing.length, 1)
    if (info) {
      t.deepEqual(info, listing[0])
    }
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const history = await ws.listHistory()
    t.is(history.length, 2)
    if (info) {
      t.is(history[1].id, info.change)
      t.is(history[1].parents.length, 1)
      t.truthy(history[1].writer.equals(ws.writers[0].publicKey))
      t.is(history[1].path, '/folder/test.txt')
      t.deepEqual(history[1].timestamp, info.timestamp)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[1].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[1].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }

  // delete

  await ws.deleteFile('/folder/test.txt')
  t.deepEqual(await ws.readFile('/folder/test.txt'), undefined)

  {
    const info = await ws.statFile('/folder/test.txt')
    t.falsy(info)
    const info2 = await ws.statFile('folder/test.txt')
    t.falsy(info2)
  }
  {
    const listing = await ws.listFiles('/folder/')
    t.is(listing.length, 0)
  }
  {
    const history = await ws.listHistory()
    t.is(history.length, 3)
    t.is(typeof history[2].id, 'string')
    t.is(history[2].parents.length, 1)
    t.truthy(history[2].writer.equals(ws.writers[0].publicKey))
    t.is(history[2].path, '/folder/test.txt')
    t.truthy(history[2].timestamp instanceof Date)
    t.is(history[2].details.action, sfw.OP_CHANGE_ACT_DEL)
  }

  // third write

  await ws.writeFile('folder/test.txt', VALUES[0])
  t.deepEqual(await ws.readFile('/folder/test.txt'), VALUES[0])

  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    if (info) {
      t.is(info.path, '/folder/test.txt')
      t.truthy(info.timestamp instanceof Date)
      t.truthy(info.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info.change === 'string')
      t.is(info.conflict, false)
      t.is(info.otherChanges?.length, 0)
      t.is(info.bytes, VALUES[0].length)
    }
    const info2 = await ws.statFile('folder/test.txt')
    t.deepEqual(info, info2)
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const listing = await ws.listFiles('/folder/')
    t.is(listing.length, 1)
    if (info) {
      t.deepEqual(info, listing[0])
    }
  }
  {
    const info = await ws.statFile('/folder/test.txt')
    t.truthy(info)
    const history = await ws.listHistory()
    t.is(history.length, 4)
    if (info) {
      t.is(history[3].id, info.change)
      t.is(history[3].parents.length, 0)
      t.truthy(history[3].writer.equals(ws.writers[0].publicKey))
      t.is(history[3].path, '/folder/test.txt')
      t.deepEqual(history[3].timestamp, info.timestamp)
      t.is(history[3].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[3].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[3].details as sfw.ChangeOpPut).bytes, info.bytes)
    }
  }
})

ava('single-writer copy file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8')
  ]

  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  await ws.writeFile('/test1.txt', VALUES[0])
  await ws.copyFile('/test1.txt', '/test2.txt')
  t.deepEqual(await ws.readFile('/test1.txt'), VALUES[0])
  t.deepEqual(await ws.readFile('/test2.txt'), VALUES[0])

  {
    const info1 = await ws.statFile('/test1.txt')
    t.truthy(info1)
    if (info1) {
      t.is(info1.path, '/test1.txt')
      t.truthy(info1.timestamp instanceof Date)
      t.truthy(info1.writer.equals(ws.writers[0].publicKey))
      t.truthy(typeof info1.change === 'string')
      t.is(info1.otherChanges?.length, 0)
      t.is(info1.bytes, VALUES[0].length)
    }
    const info2 = await ws.statFile('/test2.txt')
    t.truthy(info2)
    if (info2) {
      t.is(info2.path, '/test2.txt')
      t.truthy(info2.timestamp instanceof Date)
      t.truthy(info2.writer.equals(ws.writers[0].publicKey))
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
    t.is(history.length, 2)
    if (info1) {
      t.is(history[0].id, info1.change)
      t.is(history[0].parents.length, 0)
      t.truthy(history[0].writer.equals(ws.writers[0].publicKey))
      t.is(history[0].path, '/test1.txt')
      t.deepEqual(history[0].timestamp, info1.timestamp)
      t.is(history[0].details.action, sfw.OP_CHANGE_ACT_PUT)
      t.is(typeof (history[0].details as sfw.ChangeOpPut).blob, 'string')
      t.is((history[0].details as sfw.ChangeOpPut).bytes, info1.bytes)
    }
    if (info2) {
      t.is(history[1].id, info2.change)
      t.is(history[1].parents.length, 0)
      t.truthy(history[1].writer.equals(ws.writers[0].publicKey))
      t.is(history[1].path, '/test2.txt')
      t.deepEqual(history[1].timestamp, info2.timestamp)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_COPY)
      t.is(typeof (history[1].details as sfw.ChangeOpCopy).blob, 'string')
      t.is((history[1].details as sfw.ChangeOpCopy).bytes, info2.bytes)
    }
  }
})

ava('single-writer move file', async t => {
  const VALUES = [
    Buffer.from('Hello, world', 'utf-8')
  ]

  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  await ws.writeFile('/test1.txt', VALUES[0])
  await ws.moveFile('/test1.txt', '/test2.txt')
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
      t.truthy(info2.writer.equals(ws.writers[0].publicKey))
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
    t.is(history.length, 3)
    
    t.is(typeof history[0].id, 'string')
    t.is(history[0].parents.length, 0)
    t.truthy(history[0].writer.equals(ws.writers[0].publicKey))
    t.is(history[0].path, '/test1.txt')
    t.truthy(history[0].timestamp instanceof Date)
    t.is(history[0].details.action, sfw.OP_CHANGE_ACT_PUT)
    t.is(typeof (history[0].details as sfw.ChangeOpPut).blob, 'string')
    if (info2) {
      t.is((history[0].details as sfw.ChangeOpPut).bytes, info2.bytes)
    }

    if (info2) {
      t.is(history[1].id, info2.change)
      t.is(history[1].parents.length, 0)
      t.truthy(history[1].writer.equals(ws.writers[0].publicKey))
      t.is(history[1].path, '/test2.txt')
      t.deepEqual(history[1].timestamp, info2.timestamp)
      t.is(history[1].details.action, sfw.OP_CHANGE_ACT_COPY)
      t.is(typeof (history[1].details as sfw.ChangeOpCopy).blob, 'string')
      t.is((history[1].details as sfw.ChangeOpCopy).bytes, info2.bytes)
    }

    t.is(typeof history[2].id, 'string')
    t.is(history[2].parents.length, 1)
    t.truthy(history[2].writer.equals(ws.writers[0].publicKey))
    t.is(history[2].path, '/test1.txt')
    t.truthy(history[2].timestamp instanceof Date)
    t.is(history[2].details.action, sfw.OP_CHANGE_ACT_DEL)
  }
})