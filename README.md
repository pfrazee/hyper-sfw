# Synced Files Workspace

A p2p collaborative filestructure built on [Hypercore's new multiwriter Autobase](https://github.com/hypercore-protocol/autobase).

**not yet published to npm**

## TODOs

- [ ] Writer management (waiting on autoboot)
- [ ] Events / reactive APIs
- [ ] Issues
  - [ ] In multiple cases, I needed to read the current state to ensure sync between writers (look for HACKs in code)
- [ ] Various
  - [ ] Track currently-used (and no-longer-used) blobs and delete them from the blobstore
  - [ ] Uncache old index core entries when no longer needed
  - [ ] Blobs are currently given random IDs rather than hash IDs. Would the hashing time be worth the additional dedup?
  - [ ] Determine whether the perf & reliability of copying blobs to the index is preferable to the reduced storage cost of leaving them in the input cores
  - [ ] Determine how operations on large filesets perform, e.g. renaming a folder with lots of files in it, and consider whether we should change the filetree to optimize these ops
  - [ ] Look into an "external blobs" mode which would allow blobs to be uncached after syncing them to a local FS location

## API

```typescript
import { Workspace } from 'hyper-sfw'

const ws = await Workspace.createNew(corestore)
const ws = await Workspace.load(corestore, workspacePublicKey)

ws.key // Buffer
ws.writable // boolean
ws.isOwner // boolean

await ws.createWriter() // => WorkspaceWriter
await ws.addWriter(publicKey: string) // => WorkspaceWriter
await ws.removeWriter(publicKey: string) 

await ws.listFiles(path?: string, opts?: any) // => FileInfo[]
await ws.statFile(path: string) // => FileInfo | undefined
await ws.readFile(path: string) // => Buffer | undefined
await ws.writeFile(path: string, blob: Buffer)
await ws.moveFile(srcPath: string, dstPath: string)
await ws.copyFile(srcPath: string, dstPath: string)
await ws.deleteFile(path: string)
await ws.getChange(changeId: string) // => IndexedChange | undefined
await ws.listHistory(opts?: any) // => IndexedChange[]
```

## Implementation notes

### Hypercore schemas

The repo is an Autobase which uses oplog inputs and a Hyperbee for the index. All data is encoded using msgpack.

The Hyperbee index uses the following layout:

```
/_meta = Meta
/files/{...path: string} = IndexedFile
/changes/{id: string} = IndexedChange
/history/{mlts: string} = string // mlts is a monotonic lexicographic timestamp
/blobs/{id: string} = {}
/blobchunks/{id: string}/{chunk: number} = Buffer

IndexedChange {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  writer: Buffer // key of the core that authored the change
  
  path: string // path of file being changed
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel
}

IndexedFile {
  path: string // path of the file in the tree
  timestamp: Date // local clock time of change
  bytes: number // number of bytes in this blob (0 if delete or move)

  writer: Buffer // key of the core that authored the change
  blob: string|undefined // blob ID

  change: string // last change id
  conflicts: string[] // change ids currently in conflict
}
```

The oplogs include one of the following message types:

```
SetMetaOp {
  op: 1
  schema: string
  writerKeys: Buffer[]
}

ChangeOp {
  op: 2
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  path: string // path of file being changed
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel

  ChangeOpPut {
    action: number // OP_CHANGE_ACT_PUT
    blob: string // ID of blob to create
    bytes: number // number of bytes in this blob
    chunks: number // number of chunks in the blob (will follow this op)
  }

  ChangeOpCopy {
    action: number // OP_CHANGE_ACT_COPY
    blob: string // ID of blob to copy
    bytes: number // number of bytes in this blob
  }

  ChangeOpDel {
    action: number // OP_CHANGE_ACT_DEL
  }
}

BlobChunkOp {
  op: 3
  blob: string // blob id
  chunk: number // chunk number
  value: Buffer
}
```

### Folder behaviors

Folders are created automatically based on paths. SFW does not prohibit files from being created which conflict with a folder name.

Changes to a folder (renames, moves, deletes) must be written as individual `Change` messages for each file.

### Detecting conflicts in changes

All change operations have a random ID and list the parent changes by their ID. When the indexer handles a change, it compares the listed parents to the current file's "head changes." If one of the head changes is not included in the list of parents, the file is put in conflict state. Conflict state is tracked by a list of change numbers in the file entry.