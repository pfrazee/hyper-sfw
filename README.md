# SFW (Synced Files Workspace)

A p2p filestructure built on [Hypercore's new multiwriter Autobase](https://github.com/hypercore-protocol/autobase).

## TODOs

- [ ] Files
  - [ ] Blobs
  - [ ] Conflict states
  - [ ] History
- [ ] Events / reactive APIs
- [ ] Implement indexer _apply
- [ ] Tests
  - [ ] All operations
  - [ ] Conflict resolution
- [ ] Optimizations
  - [ ] Determine whether the perf & reliability of copying blobs to the index is preferable to the reduced storage cost of leaving them in the input cores
  - [ ] Determine how operations on large filesets perform, e.g. renaming a folder with lots of files in it, and consider whether we should change the filetree to optimize these ops

## Implementation notes

### Hypercore schemas

The repo is an Autobase which uses oplog inputs and a Hyperbee for the index. All data is encoded using msgpack.

The Hyperbee index uses the following layout:

```
/_meta = Meta
/files/{path: string} = IndexedFile
/history/{num: string} = IndexedChange  // num is a sequential lexicographic number, not the change id
/blobs/{hash: string} = IndexedBlob

Meta {
  schema: 'sfw',
  writerKeys: Buffer[]
}
IndexedFile {
  path: string // path of the file in the tree
  blob: string // hash ref
  change: string // last change number (not id)
  conflicts: string[] // change numbers (not ids) currently in conflict
}
IndexedChange {
  id: string, // random generated ID
  parents: string[] // IDs of changes which preceded this change
  writer: Buffer, // key of the core that authored the change
  timestamp: DateTime // local clock time of change
  path: string // path of file being changed
  hash: string // blob hash ref (undefined on delete)
  bytes: number // number of bytes in this blob (0 if delete or move)
  length: number // number of chunks in this blob (0 if delete or move)
}
IndexedBlob {
  writer: Buffer // key of the input core which contains this blob
  bytes: number // number of bytes in this blob
  start: number // starting seq number
  end: number // ending seq number
}
```

The oplogs include one of the following message types:

```
SetMeta {
  op: 1
  writerKeys: Buffer[]
}
Change {
  op: 2
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  timestamp: DateTime // local clock time of change
  path: string // path of file being changed
  hash: string // blob hash ref (undefined on delete)
  bytes: number // number of bytes in this blob (0 if delete or move)
  length: number // number of chunks in this blob (0 if delete or move)
}
BlobChunk {
  op: 3
  value: Buffer // content
}
```

### Managing writers

Only the creator of the Repo maintains the Hyperbee index as a hypercore. The owner updates the `/_meta` entry to determine the current writers.

This is a temporary design until Autoboot lands.

### Change indexing

Autobase creates a lineariazed local view of all input cores. SFW takes advantage of that to create a linear change log.

Consequently, indexed changes are assigned a monotonically increasing number which is used within the index as its identifier.

### Change / blob ops

The oplogs write changes as `Change` messages. This can include some specific behaviors:

- When writing a new blob, the `hash` will be defined `bytes` and `length` will be non-zero. The `Change` will be followed by `BlobChunk` messages which include the file data.
- When writing a pre-existing blob, the `hash` will be defined and `bytes` and `length` will be zero.
- When deleting a file, the `hash` will be undefined and `bytes` and `length` will be zero.

A "move" operation will include two `Change` messages - a delete followed by a write.

### Folder behaviors

Folders are created automatically based on paths. SFW does not prohibit files from being created which conflict with a folder name.

Changes to a folder (renames, moves, deletes) must be written as individual `Change` messages for each file.

### Detecting conflicts in changes

All change operations have a random ID and list the parent changes by their ID. When the indexer handles a change, it compares the listed parents to the current file's "head changes." If one of the head changes is not included in the list of parents, the file is put in conflict state. Conflict state is tracked by a list of change numbers in the file entry.