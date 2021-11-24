// @ts-ignore no types
import ram from 'random-access-memory'
// @ts-ignore no types
import Hypercore from 'hypercore'
// @ts-ignore no types
import Corestore from 'corestore'
// @ts-ignore no types
import crypto from 'hypercore-crypto'
import * as sfw from '../../src/index.js'

class Sim {
  stores: Corestore[] = []
  swarmKeyPairs: sfw.KeyPair[] = []
  workspaces: sfw.Workspace[] = []
  writers: sfw.WorkspaceWriter[] = []
  streams: Record<string, any> = {}

  addStore () {
    this.stores.push(new Corestore(ram))
    this.swarmKeyPairs.push(crypto.keyPair())
  }

  async createWorkspace (store: Corestore, swarmKeyPair: sfw.KeyPair) {
    const ws = await sfw.Workspace.createNew(store, swarmKeyPair)
    this.workspaces.push(ws)
    this.writers.push(ws.writers[0])
    return ws
  }

  async cloneWorkspace (store: Corestore, swarmKeyPair: sfw.KeyPair, ws1: sfw.Workspace) {
    const ws2 = await sfw.Workspace.load(store, swarmKeyPair, ws1.key.toString('hex'))
    
    // TODO: use invite flows once we solve the wire protocol bug
    const writer2 = await ws2._createWriter()
    await ws1.putWriter(writer2.publicKey, {name: 'second writer'})
    // const invite = await ws1.createInvite('Second writer')
    // const writer2 = await ws2.useInvite(invite)

    this.workspaces.push(ws2)
    this.writers.push(writer2)
    return ws2
  }

  connect (store1: Corestore, store2: Corestore) {
    let i1 = this.stores.indexOf(store1)
    let i2 = this.stores.indexOf(store2)
    const kp1 = this.swarmKeyPairs[i1]
    const kp2 = this.swarmKeyPairs[i2]
    if (i1 > i2) [i1, i2] = [i2, i1]
    if (!this.streams[`${i1}:${i2}`]) {
      const s = store1.replicate(Hypercore.createProtocolStream(true, {keyPair: kp1}))
      s.pipe(store2.replicate(Hypercore.createProtocolStream(false, {keyPair: kp2}))).pipe(s)
      this.streams[`${i1}:${i2}`] = s
    }
  }

  disconnect (store1: Corestore, store2: Corestore) {
    let i1 = this.stores.indexOf(store1)
    let i2 = this.stores.indexOf(store2)
    if (i1 > i2) [i1, i2] = [i2, i1]
    if (this.streams[`${i1}:${i2}`]) {
      this.streams[`${i1}:${i2}`].destroy()
      delete this.streams[`${i1}:${i2}`]
    }
  }
}

export async function setupOne (t: any) {
  const sim = new Sim()
  sim.addStore()

  const ws = await sim.createWorkspace(sim.stores[0], sim.swarmKeyPairs[0])
  t.truthy(ws.key)

  t.is(ws.writers.length, 1)

  return {sim, ws, writer: sim.writers[0]}
}

export async function setupTwo (t: any) {
  const sim = new Sim()
  sim.addStore()
  sim.addStore()
  sim.connect(sim.stores[0], sim.stores[1])

  const ws1 = await sim.createWorkspace(sim.stores[0], sim.swarmKeyPairs[0])
  t.truthy(ws1.key)
  const ws2 = await sim.cloneWorkspace(sim.stores[1], sim.swarmKeyPairs[1], sim.workspaces[0])
  t.truthy(ws2.key)
  t.deepEqual(ws1.key, ws2.key)

  t.is(ws1.writers.length, 2)
  t.is(ws2.writers.length, 2)

  return {sim, ws1, ws2, writer1: sim.writers[0], writer2: sim.writers[1]}
}