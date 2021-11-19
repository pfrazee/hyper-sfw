# HSFW: Hyper Synced Files Workspace

Dropbox-like p2p file syncing built on [Hypercore's new multiwriter Autobase](https://github.com/hypercore-protocol/autobase).

**Not yet published to npm**

## TODOs

- [Externalizing blobs to a separate storage and transfer protocol](https://github.com/pfrazee/hyper-sfw/issues/1)
- [Decaching old core messages](https://github.com/pfrazee/hyper-sfw/issues/2)
- Events / reactive APIs
- Unique codes on each error
- BUG: In multiple cases, I needed to read the current state to ensure sync between writers (look for HACKs in code)

## Example usage

```typescript
import crypto from 'hypercore-crypto'
import { Workspace } from 'hsfw'

const mySwarmKeypair = crypto.keyPair()
const ws = await Workspace.createNew(corestore, mySwarmKeypair)
const ws = await Workspace.load(corestore, mySwarmKeypair, workspacePublicKey)

// general metadata
// =

ws.key // the key that identifies this HSFW

// basic file ops
// =

await ws.writeFile('/file.txt', 'Hello, world!')
await ws.statFile('/file.txt') /* => {
  path: '/file.txt',
  timestamp: Date(January 1, 1969),
  bytes: 13,
  writer: Buffer<...>,
  change: 'b3c316fdc136bde5',
  conflict: false,
  noMerge: false
  otherChanges: []
} */
await ws.listFiles() // => [{...}]
await ws.readFile('/file.txt', 'utf-8') // => 'Hello, world!'

await ws.copyFile('/file.txt', '/file2.txt')
await ws.moveFile('/file2.txt', '/file3.txt')
await ws.deleteFile('/file3.txt')

// history
// =

await ws.listHistory()
await ws.listHistory({path: '/directory/*'})
await ws.listHistory({path: '/file.txt'})

// writer management
// =

await ws.listWriters() // fetch and list the current writers
ws.getWriter(pubkey) /* get one of the writers (from the current cache)
=> WorkspaceWriter {
  core: Hypercore
  publicKey: Buffer
  secretKey?: Buffer
  isOwner: boolean
  name: string
  isAdmin: boolean
  isFrozen: boolean
}*/
ws.getOwner() // get the "owner" writer of this HSFW
ws.isOwner // am I the "owner" of this HSFW?
ws.getMyWriter() // get my writer instance, if I am one
ws.writable // am I a writer?
ws.isAdmin // am I an admin writer? (able to change other writers)
await ws.putWriter(key, {name: 'Bob', admin: false}) // create/update a writer

const invite = await ws.createInvite(recipientName: string) // create a writer invite
await ws.useInvite(invite) // use the invite to become a writer
```

## Implementation notes

### Hypercore schemas

The repo is an Autobase which uses oplog inputs and a Hyperbee for the index. All data is encoded using msgpack.

The Hyperbee index uses the following layout:

```
/_meta = IndexedMeta
/files/{...path: string} = IndexedFile
/changes/{id: string} = IndexedChange
/history/{mlts: string} = string // mlts is a monotonic lexicographic timestamp
/blobs/{hash: string} = {}
/blobchunks/{hash: string}/{chunk: number} = Buffer

IndexedMeta {
  owner: Buffer // owner key
  ownerIndex: Buffer // owner's index key
  writers: IndexedMetaWriter[]
  timestamp: Date // local clock time of last change
  change: string // last change id

  IndexedMetaWriter {
    key: Buffer // writer key
    name: string // user-facing user name
    admin: boolean // can assign other writers?
    frozen: boolean // are further updates disabled?
  }
}

IndexedChange {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  writer: Buffer // key of the core that authored the change
  
  path: string // path of file being changed
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel|ChangeOpPutWriter
}

IndexedFile {
  path: string // path of the file in the tree
  timestamp: Date // local clock time of change
  bytes: number // number of bytes in this blob (0 if delete or move)

  writer: Buffer // key of the core that authored the change
  blob: string|undefined // blob sha256 hash

  change: string // last change id
  noMerge: boolean // in no-merge mode?
  otherChanges: string[] // other current change ids
}
```

The oplogs include one of the following message types:

```
DeclareOp {
  op: 1
  index: Buffer // key of the owner's index bee
  timestamp: Date // local clock time of declaration
}

ChangeOp {
  op: 2
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel|ChangeOpPutWriter

  ChangeOpPut {
    action: number // OP_CHANGE_ACT_PUT
    path: string // path of file being changed
    blob: string // sha256 hash of blob to create
    bytes: number // number of bytes in this blob
    chunks: number // number of chunks in the blob (will follow this op)
    noMerge: boolean // is this a "no merge" put?
  }

  ChangeOpCopy {
    action: number // OP_CHANGE_ACT_COPY
    path: string // path of file being changed
    blob: string // sha256 hash of blob to copy
    bytes: number // number of bytes in this blob
  }

  ChangeOpDel {
    action: number // OP_CHANGE_ACT_DEL
    path: string // path of file being changed
  }

  ChangeOpPutWriter {
    action: number // OP_CHANGE_ACT_PUT_WRITER
    key: Buffer // writer's key
    name?: string // writer's name
    admin?: boolean // is admin?
    frozen?: boolean // is frozen?
  }
}

BlobChunkOp {
  op: 3
  blob: string // sha256 hash of blob
  chunk: number // chunk number
  value: Buffer
}
```

### Writer management

The Hypercore team is planning to create "Autoboot," a toolkit for managing writers. In the meantime, HSFW has implemented its own form of writer management.

The basics are pretty straight-forward: to add a writer, create an "invite" with `createInvite()` and send that invite to the other user. That user then calls `useInvite()` and they will be added as a writer. (Note: The creator of the invite has to be online when it runs.)

```js
// on the existing writer's side
const inviteCode = await workspace.createInvite('Bob') // bob will be the name assigned to the new writer

// on the joining user's side
await workspace.useInvite(inviteCode)
```

You can modify existiing writers with `putWriter()` to change their name or give them admin powers. You must be an admin to add new writers or modify other writers.

```js
// on the admin's device
if (workspace.isAdmin) {
  await workspace.putWriter(bob.key, {name: 'Robert', admin: true})
}
```

### Folder behaviors

Folders are created automatically based on paths. SFW does not prohibit files from being created which conflict with a folder name.

Changes to a folder (renames, moves, deletes) must be written as individual `Change` messages for each file.

### Detecting conflicts in changes

All change operations have a random ID and list the parent changes by their ID. When the indexer handles a change, it compares the listed parents to the current file's "head changes." If one of the head changes is not included in the list of parents, the file is put in conflict state. Conflict state is tracked by a list of change numbers in the file entry.

### No-merge writes

You can write a file with the `noMerge` option set to true. This circumvents the merging behavior, essentially causing the file to go into "conflict" on purpose. (SFW notes that it is a `noMerge` write and accordingly doesn't indicate the write as a conflict.)

Non-merged files essentially maintain separate copies for each writer. You can fetch each writer's copy using `readAllFileStates()`.

This is particularly useful for [Y.js](https://yjs.dev), as each writer's state updates can be written separately and then merged on read.

```js
import * as Y from 'yjs'

const ydoc = new Y.Doc()
ydoc.getText().insert(0, 'Hello, world!')

// write the state update in "no merge" mode
await ws.writeFile('/ydoc.txt', Buffer.from(Y.encodeStateAsUpdate(ydoc)), {noMerge: true})

// now create another ydoc instance and read each writer's updates into it
const ydoc2 = new Y.Doc()
const state = await ws.readAllFileStates('/ydoc.txt')
for (const item of state) Y.applyUpdate(ydoc2, item.data)
String(ydoc2.getText()) // 'Hello, world!'
```