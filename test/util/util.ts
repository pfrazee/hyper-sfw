// @ts-ignore no types
import ram from 'random-access-memory'
// @ts-ignore no types
import Corestore from 'corestore'
import * as sfw from '../../src/index.js'

class Sim {
  stores: Corestore[] = []
  workspaces: sfw.Workspace[] = []
  writers: sfw.WorkspaceWriter[] = []
  streams: Record<string, any> = {}

  addStore () {
    this.stores.push(new Corestore(ram))
  }

  async createWorkspace (store: Corestore) {
    const ws = await sfw.Workspace.createNew(store)
    this.workspaces.push(ws)
    this.writers.push(ws.writers[0])
    return ws
  }

  async cloneWorkspace (store: Corestore, ws1: sfw.Workspace) {
    const ws2 = await sfw.Workspace.load(store, ws1.key.toString('hex'))
    for (const w of this.writers) {
      ws2.addWriter(w.publicKey.toString('hex'))
    }
    const writer2 = await ws2.createWriter()
    await ws1.addWriter(writer2.publicKey.toString('hex'))
    await ws2._loadMeta()
    this.workspaces.push(ws2)
    this.writers.push(writer2)
    return ws2
  }

  connect (store1: Corestore, store2: Corestore) {
    let i1 = this.stores.indexOf(store1)
    let i2 = this.stores.indexOf(store2)
    if (i1 > i2) [i1, i2] = [i2, i1]
    if (!this.streams[`${i1}:${i2}`]) {
      const s = store1.replicate(true)
      s.pipe(store2.replicate(false)).pipe(s)
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

export async function setupTwo (t: any) {
  const sim = new Sim()
  sim.addStore()
  sim.addStore()
  sim.connect(sim.stores[0], sim.stores[1])

  const ws1 = await sim.createWorkspace(sim.stores[0])
  t.truthy(ws1.key)
  const ws2 = await sim.cloneWorkspace(sim.stores[1], sim.workspaces[0])
  t.truthy(ws2.key)

  t.is(ws1.writers.length, 2)
  t.is(ws2.writers.length, 2)

  return {sim, ws1, ws2, writer1: sim.writers[0], writer2: sim.writers[1]}
}