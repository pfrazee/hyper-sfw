import bytes from 'bytes'

export const OP_SET_META = 1
export const OP_CHANGE = 2
export const OP_BLOB_CHUNK = 3

export const OP_CHANGE_ACT_PUT = 1
export const OP_CHANGE_ACT_COPY = 2
export const OP_CHANGE_ACT_DEL = 3

export const BLOB_CHUNK_BYTE_LENGTH = bytes('4mb')

/*

Index bee's structure:

/_meta = Meta
/files/{...path: string} = IndexedFile
/changes/{id: string} = IndexedChange
/history/{mlts: string} = string // mlts is a monotonic lexicographic timestamp
/blobs/{id: string} = {}
/blobchunks/{id: string}/{chunk: number} = Buffer

*/

// ops
// =

export interface Op {
  op: number
}

export interface SetMetaOp extends Op {
  schema: string
  writerKeys: Buffer[]
}

export interface BlobChunkOp extends Op {
  blob: string // blob id
  chunk: number // chunk number
  value: Buffer
}

export interface ChangeOpPut {
  action: number // OP_CHANGE_ACT_PUT
  blob: string // ID of blob to create
  bytes: number // number of bytes in this blob
  chunks: number // number of chunks in the blob (will follow this op)
}

export interface ChangeOpCopy {
  action: number // OP_CHANGE_ACT_COPY
  blob: string // ID of blob to copy
  bytes: number // number of bytes in this blob
}

export interface ChangeOpDel {
  action: number // OP_CHANGE_ACT_DEL
}

export interface ChangeOp extends Op {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  
  path: string // path of file being changed
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel
}

export function isSetMetaOp (v: any): v is SetMetaOp {
  if (!v) return false
  return v.op === OP_SET_META // TODO validation
}

export function isBlobChunkOp (v: any): v is BlobChunkOp {
  if (!v) return false
  return v.op === OP_BLOB_CHUNK && Buffer.isBuffer(v.value)
}

export function isChangeOp (v: any): v is ChangeOp {
  if (!v) return false
  return v.op === OP_CHANGE // TODO validation
}

// indexed data
// =

export interface IndexedChange {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  writer: Buffer // key of the core that authored the change
  
  path: string // path of file being changed
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel
}

export interface IndexedFile {
  path: string // path of the file in the tree
  timestamp: Date // local clock time of change
  bytes: number // number of bytes in this blob (0 if delete or move)

  writer: Buffer // key of the core that authored the change
  blob: string|undefined // blob ID

  change: string // last change id
  conflicts: string[] // change ids currently in conflict
}

export function isIndexedChange (v: any): v is IndexedChange {
  if (!v) return false
  // TODO validation
  return true
}

export function isIndexedFile (v: any): v is IndexedFile {
  if (!v) return false
  // TODO validation
  return true
}

// api structures
// =

export interface FileInfo {
  path: string // path of the file in the tree
  timestamp: Date // local clock time of change
  bytes: number // number of bytes in this blob (0 if delete or move)
  writer: Buffer // key of the core that authored the change

  change: string // last change ids
  conflicts?: FileInfo[] // conflicting file infos
}