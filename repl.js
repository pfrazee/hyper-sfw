#!/usr/bin/env node --experimental-repl-await

import repl from 'repl'
import ram from 'random-access-memory'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import crypto from 'hypercore-crypto'
import * as hsfw from './dist/index.js'

const swarmKeyPair = crypto.keyPair()
const swarm = new Hyperswarm({keyPair: swarmKeyPair})
const store = new Corestore(ram)
swarm.on('connection', connection => store.replicate(connection))
let ws = undefined

async function create () {
  ws = await hsfw.Workspace.createNew(store, swarmKeyPair)
  rinst.context.ws = ws
  swarm.join(ws.getOwner().core.discoveryKey)
  console.log('Workspace created.', ws)
}

async function load (key) {
  const swarmKeyPair = crypto.keyPair()
  swarm.join(crypto.discoveryKey(Buffer.from(key, 'hex')))
  ws = await hsfw.Workspace.load(store, swarmKeyPair, key)
  rinst.context.ws = ws
  console.log('Workspace loaded.', ws)
}

const rinst = repl.start('> ')
Object.assign(rinst.context, {
  hsfw,
  create,
  load
})