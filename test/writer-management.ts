import ava from 'ava'
import { setupTwo } from './util/util.js'
import * as sfw from '../src/index.js'

ava.skip('writer invite flow', async t => {
  // const {ws1, ws2, writer1, writer2} = await setupTwo(t)

  // t.deepEqual(await ws1.listFiles('/'), [])
  // t.falsy(await ws1.statFile('/test.txt'))
  // t.falsy(await ws1.statFile('test.txt'))
  // t.deepEqual(await ws2.listFiles('/'), [])
  // t.falsy(await ws2.statFile('/test.txt'))
  // t.falsy(await ws2.statFile('test.txt'))

  // const p = new Promise(r => {
  //   ws1.indexes[0].extensions.writerCtrl?.on('add-writer', r)
  // })

  // const invite = ws1.createInvite()
  // if (invite) ws2.useInvite(invite.code)

  // const newWriter: any = await p
  // t.deepEqual(newWriter?.writerKey, ws2.writers.find(w => w.core.writable)?.core?.key)
})
