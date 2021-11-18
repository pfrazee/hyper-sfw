import ava from 'ava'
import { setupTwo } from './util/util.js'
import * as sfw from '../src/index.js'

ava('writer invite flow', async t => {
  const {ws1, ws2, writer1, writer2} = await setupTwo(t)

  t.deepEqual(await ws1.listFiles('/'), [])
  t.falsy(await ws1.statFile('/test.txt'))
  t.falsy(await ws1.statFile('test.txt'))
  t.deepEqual(await ws2.listFiles('/'), [])
  t.falsy(await ws2.statFile('/test.txt'))
  t.falsy(await ws2.statFile('test.txt'))

  const p = new Promise(r => {
    ws1.indexes[0].extensions.writerCtrl?.on('add-writer', r)
  })

  const invite = ws1.createInvite()
  if (invite) ws2.useInvite(invite.code)

  const newWriter: any = await p
  t.deepEqual(newWriter?.writerKey, ws2.writers.find(w => w.core.writable)?.core?.key)
})

// writer state: name, isAdmin
// oplog to: add/modify/remove writers
// .... convergence rules on meta changes
// .... writer change perms enforcement
// .... include writer changes in history
// api: createInvite(), useInvite(), listInvites(), destroyInvite()
// api: writable, listWriters(), putWriter(), delWriter()
// api: isAdmin, listAdmins()
// api: isOwner, getOwner()

/*
TODOs
- [ ] Change "primary key" to be the creator writer's key
- [ ] Write DECLARE on create
- [ ] Read DECLARE on load
- [ ] Index DECLARE
- [ ] Index writer change ops
- [ ] Implement writer APIs
- [ ] Implement invite wire protocol

Convergence Rules:

putWriter(key, name, isAdmin)
delWriter(key)

putWriter(key, name1, isAdmin1) + putWriter(key, name2, isAdmin2) = putWriter(key, name1, isAdmin1 || isAdmin2)
delWriter(key) + delWriter(key) = delWriter(key)
putWriter(key, name, isAdmin) + delWriter(key) = delWriter(key)

Permissions Rules:

√ nonAdminWriter(key1).putWriter(key1)
√ nonAdminWriter(key1).delWriter(key1)
ø nonAdminWriter(key1).putWriter(key2)
ø nonAdminWriter(key1).delWriter(key2)

√ adminWriter(key1).putWriter(key1)
√ adminWriter(key1).delWriter(key1)
√ adminWriter(key1).putWriter(key2)
√ adminWriter(key1).delWriter(key2)

ø owner(ownerKey).delWriter(ownerKey)
ø adminWriter(ownerKey).delWriter(ownerKey)
ø nonAdminWriter(ownerKey).delWriter(ownerKey)
*/