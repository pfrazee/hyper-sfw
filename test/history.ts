import ava from 'ava'
// @ts-ignore no types
import ram from 'random-access-memory'
// @ts-ignore no types
import Corestore from 'corestore'
import * as sfw from '../src/index.js'

ava('listHistory filters', async t => {
  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  for (let i = 0; i < 4; i++) {
    await ws.writeFile('/test.txt', Buffer.from(''+i, 'utf8'))
    for (let j = 0; j < 10; j++) {
      await ws.writeFile(`/folder/test${j}.txt`, Buffer.from(''+i, 'utf8'))
      await ws.writeFile(`/sub/folder/test${j}.txt`, Buffer.from(''+i, 'utf8'))
    }
  }

  t.is((await ws.listHistory()).length, 84)
  t.is((await ws.listHistory({path: '/test.txt'})).length, 4)
  t.is((await ws.listHistory({path: '/folder/test0.txt'})).length, 4)
  t.is((await ws.listHistory({path: '/sub/folder/test0.txt'})).length, 4)
  t.is((await ws.listHistory({path: '/folder/*.txt'})).length, 40)
  t.is((await ws.listHistory({path: '/sub/folder/*'})).length, 40)
  t.is((await ws.listHistory({path: '/sub/**'})).length, 40)
})

ava('read historic values', async t => {
  const store = new Corestore(ram)
  const ws = await sfw.Workspace.createNew(store)
  t.truthy(ws.key)

  for (let i = 0; i < 10; i++) {
    await ws.writeFile('/test.txt', Buffer.from(''+i, 'utf8'))
  }

  const history = await ws.listHistory()
  t.is(history.length, 10)
  for (let i = 0; i < history.length; i++) {
    const v = await ws.readFile('/test.txt', {change: history[i].id, encoding: 'utf8'})
    t.is(v, `${i}`)
  }
})