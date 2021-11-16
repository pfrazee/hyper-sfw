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
  const check = new TypeCheck()
  check.is(v.op, OP_SET_META)
  check.type(v.schema, 'string')
  if (v.writerKeys) {
    check.arrayIs(v.writerKeys, (item: any) => Buffer.isBuffer(item))
  }
  return check.valid
}

export function isBlobChunkOp (v: any): v is BlobChunkOp {
  if (!v) return false
  const check = new TypeCheck()
  check.is(v.op, OP_BLOB_CHUNK)
  check.type(v.blob, 'string')
  check.type(v.chunk, 'number')
  check.is(Buffer.isBuffer(v.value), true)
  return check.valid
}

export function isChangeOp (v: any): v is ChangeOp {
  if (!v) return false
  const check = new TypeCheck()
  check.is(v.op, OP_CHANGE)
  check.type(v.id, 'string')
  check.arrayType(v.parents, 'string')
  check.type(v.path, 'string')
  check.is(v.timestamp instanceof Date, true)
  check.type(v.details, 'object')
  if (v.details) {
    check.type(v.details.action, 'number')
    if (v.details.action === OP_CHANGE_ACT_PUT) {
      check.type(v.details.blob, 'string')
      check.type(v.details.bytes, 'number')
      check.type(v.details.chunks, 'number')
    } else if (v.details.action === OP_CHANGE_ACT_COPY) {
      check.type(v.details.blob, 'string')
      check.type(v.details.bytes, 'number')    
    }
  }
  return check.valid
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
  const check = new TypeCheck()
  check.type(v.id, 'string')
  check.arrayType(v.parents, 'string')
  check.is(Buffer.isBuffer(v.writer), true)
  check.type(v.path, 'string')
  check.is(v.timestamp instanceof Date, true)
  check.type(v.details, 'object')
  if (v.details) {
    check.type(v.details.action, 'number')
    if (v.details.action === OP_CHANGE_ACT_PUT) {
      check.type(v.details.blob, 'string')
      check.type(v.details.bytes, 'number')
      check.type(v.details.chunks, 'number')
    } else if (v.details.action === OP_CHANGE_ACT_COPY) {
      check.type(v.details.blob, 'string')
      check.type(v.details.bytes, 'number')    
    }
  }
  return check.valid
}

export function isIndexedFile (v: any): v is IndexedFile {
  if (!v) return false
  const check = new TypeCheck()
  check.type(v.path, 'string')
  check.is(v.timestamp instanceof Date, true)
  check.type(v.bytes, 'number')
  check.is(Buffer.isBuffer(v.writer), true)
  if (v.blob) check.type(v.blob, 'string')
  check.type(v.change, 'string')
  check.arrayType(v.conflicts, 'string')
  return check.valid
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

class TypeCheck {
  valid = true
  
  is (v: any, expected: any) {
    if (v !== expected) {
      this.valid = false
    }
  }
  type (v: any, t: string) {
    if (typeof v !== t) {
      this.valid = false
    }
  }
  arrayIs (v: any, test: (item: any) => boolean) {
    if (!Array.isArray(v)) {
      this.valid = false
    } else if (!v.reduce((acc, item) => acc && test(item), true)) {
      this.valid = false
    }
  }
  arrayType (v: any, t: string) {
    if (!Array.isArray(v)) {
      this.valid = false
    } else if (!v.reduce((acc, item) => acc && typeof item === t, true)) {
      this.valid = false
    }
  }
}