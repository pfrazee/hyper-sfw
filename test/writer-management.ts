import ava from 'ava'
// @ts-ignore no types
import Hypercore from 'hypercore'
// @ts-ignore no types
import ram from 'random-access-memory'
// @ts-ignore no types
import Corestore from 'corestore'
// @ts-ignore no types
import crypto from 'hypercore-crypto'
import * as sfw from '../src/index.js'

function inst () {
  const swarmKeyPair = crypto.keyPair()
  const store = new Corestore(ram)
  return {swarmKeyPair, store}
}

function connect (inst1: any, inst2: any) {
  const s = inst1.store.replicate(Hypercore.createProtocolStream(true, {keyPair: inst1.swarmKeyPair}))
  s.pipe(inst2.store.replicate(Hypercore.createProtocolStream(false, {keyPair: inst2.swarmKeyPair}))).pipe(s)
}

ava('writer invite flow', async t => {
  const inst1 = inst()
  const inst2 = inst()
  connect(inst1, inst2)

  const ws1 = await sfw.Workspace.createNew(inst1.store, inst1.swarmKeyPair)
  const ws2 = await sfw.Workspace.load(inst2.store, inst2.swarmKeyPair, ws1.key)

  t.deepEqual(ws1.key, ws2.key)
  t.is(ws1.writers.length, 1)
  t.is(ws2.writers.length, 1)

  const invite = await ws1.createInvite('user two')
  await ws2.useInvite(invite)

  t.is(ws1.writers.length, 2)
  t.is(ws2.writers.length, 2)
  t.is(ws2.getMyWriter()?.name, 'user two')
})

ava('writer perms: admins can edit all, non-admins can only edit self and cant self-promote to admin', async t => {
  const inst1 = inst()
  const inst2 = inst()
  connect(inst1, inst2)

  const ws1 = await sfw.Workspace.createNew(inst1.store, inst1.swarmKeyPair)
  const ws2 = await sfw.Workspace.load(inst2.store, inst2.swarmKeyPair, ws1.key)

  t.deepEqual(ws1.key, ws2.key)
  t.is(ws1.writers.length, 1)
  t.is(ws2.writers.length, 1)

  const invite = await ws1.createInvite('user two')
  await ws2.useInvite(invite)

  t.is(ws1.writers.length, 2)
  t.is(ws2.writers.length, 2)

  const writer1 = ws1.getMyWriter()
  const writer2 = ws2.getMyWriter()

  t.truthy(writer1)
  t.truthy(writer2)

  if (writer1 && writer2) {
    await t.throwsAsync(ws2.putWriter(writer1.publicKey, {name: 'bob'}))
    await ws2.putWriter(writer2.publicKey, {name: 'bob'})
    await t.throwsAsync(ws2.putWriter(writer2.publicKey, {admin: true}))

    for (const ws of [ws1, ws2]) {
      const writers = await ws.listWriters()
      const w2 = writers.find(w => w.publicKey.equals(writer2.publicKey))
      t.truthy(w2)
      if (w2) {
        t.is(w2.name, 'bob')
        t.falsy(w2.isAdmin)
        t.falsy(w2.isFrozen)
      }
    }

    await ws1.putWriter(writer1.publicKey, {name: 'alice'})
    await ws1.putWriter(writer2.publicKey, {name: 'robert'})
    await ws1.putWriter(writer2.publicKey, {admin: true})

    for (const ws of [ws1, ws2]) {
      const writers = await ws.listWriters()
      const w1 = writers.find(w => w.publicKey.equals(writer1.publicKey))
      t.truthy(w1)
      if (w1) {
        t.is(w1.name, 'alice')
        t.truthy(w1.isAdmin)
        t.falsy(w1.isFrozen)
      }
      const w2 = writers.find(w => w.publicKey.equals(writer2.publicKey))
      t.truthy(w2)
      if (w2) {
        t.is(w2.name, 'robert')
        t.truthy(w2.isAdmin)
        t.falsy(w2.isFrozen)
      }
    }

    // writer2 is now admin
    await ws2.putWriter(writer1.publicKey, {name: 'ALICE'})
    await ws2.putWriter(writer2.publicKey, {name: 'ROBERT'})
    await ws2.putWriter(writer1.publicKey, {admin: false})

    for (const ws of [ws1, ws2]) {
      const writers = await ws.listWriters()
      const w1 = writers.find(w => w.publicKey.equals(writer1.publicKey))
      t.truthy(w1)
      if (w1) {
        t.is(w1.name, 'ALICE')
        t.falsy(w1.isAdmin)
        t.falsy(w1.isFrozen)
      }
      const w2 = writers.find(w => w.publicKey.equals(writer2.publicKey))
      t.truthy(w2)
      if (w2) {
        t.is(w2.name, 'ROBERT')
        t.truthy(w2.isAdmin)
        t.falsy(w2.isFrozen)
      }
    }

    // writer1 is no longer admin
    await t.throwsAsync(ws1.putWriter(writer2.publicKey, {name: 'bob'}))
    await ws2.putWriter(writer1.publicKey, {name: 'ALICIA'})
    await t.throwsAsync(ws1.putWriter(writer1.publicKey, {admin: true}))

    for (const ws of [ws1, ws2]) {
      const writers = await ws.listWriters()
      const w1 = writers.find(w => w.publicKey.equals(writer1.publicKey))
      t.truthy(w1)
      if (w1) {
        t.is(w1.name, 'ALICIA')
        t.falsy(w1.isAdmin)
        t.falsy(w1.isFrozen)
      }
      const w2 = writers.find(w => w.publicKey.equals(writer2.publicKey))
      t.truthy(w2)
      if (w2) {
        t.is(w2.name, 'ROBERT')
        t.truthy(w2.isAdmin)
        t.falsy(w2.isFrozen)
      }
    }
  }
})

ava('cant write without being a writer', async t => {
  const inst1 = inst()
  const inst2 = inst()
  connect(inst1, inst2)

  const ws1 = await sfw.Workspace.createNew(inst1.store, inst1.swarmKeyPair)
  const ws2 = await sfw.Workspace.load(inst2.store, inst2.swarmKeyPair, ws1.key)

  t.deepEqual(ws1.key, ws2.key)
  t.is(ws1.writers.length, 1)
  t.is(ws2.writers.length, 1)

  await t.throwsAsync(ws2.writeFile('/foo.txt', 'bar'), {message: 'Not a writer'})
})

ava('invalid invites', async t => {
  const inst1 = inst()
  const inst2 = inst()
  connect(inst1, inst2)

  const ws1 = await sfw.Workspace.createNew(inst1.store, inst1.swarmKeyPair)
  const ws2 = await sfw.Workspace.load(inst2.store, inst2.swarmKeyPair, ws1.key)

  t.deepEqual(ws1.key, ws2.key)
  t.is(ws1.writers.length, 1)
  t.is(ws2.writers.length, 1)

  const invite = await ws1.createInvite('user two')
  const [prefix, key, token] = invite.split(':')

  await t.throwsAsync(ws2.useInvite(`foo`), {message: 'Not an invite code'})
  await t.throwsAsync(ws2.useInvite(`${prefix}:${crypto.keyPair().publicKey.toString('hex')}:${token}`), {message: 'Can\'t find the user that created this invite. Are they online? (Are you?)'})
  await t.throwsAsync(ws2.useInvite(`${prefix}:${key}:12345`), {message: 'Invalid invite code (12345)'})
})