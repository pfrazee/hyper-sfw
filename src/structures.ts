import bytes from 'bytes'

export const OP_DECLARE = 1
export const OP_CHANGE = 2
export const OP_BLOB_CHUNK = 3

export const OP_CHANGE_ACT_PUT = 1
export const OP_CHANGE_ACT_COPY = 2
export const OP_CHANGE_ACT_DEL = 3
export const OP_CHANGE_ACT_PUT_WRITER = 4

export const BLOB_CHUNK_BYTE_LENGTH = bytes('4mb')

/*

Index bee's structure:

/_meta = IndexedMeta
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

export interface DeclareOp extends Op {
  index: Buffer // key of the owner's index bee
  timestamp: Date // local clock time of declaration
}

export interface BlobChunkOp extends Op {
  blob: string // blob id
  chunk: number // chunk number
  value: Buffer
}

export interface ChangeOpFilesAct {
  path: string // path of file being changed
}

export interface ChangeOpPut extends ChangeOpFilesAct {
  action: number // OP_CHANGE_ACT_PUT
  blob: string // ID of blob to create
  bytes: number // number of bytes in this blob
  chunks: number // number of chunks in the blob (will follow this op)
  noMerge: boolean // is this a "no merge" put?
}

export interface ChangeOpCopy extends ChangeOpFilesAct {
  action: number // OP_CHANGE_ACT_COPY
  blob: string // ID of blob to copy
  bytes: number // number of bytes in this blob
}

export interface ChangeOpDel extends ChangeOpFilesAct {
  action: number // OP_CHANGE_ACT_DEL
}

export interface ChangeOpPutWriter {
  action: number // OP_CHANGE_ACT_PUT_WRITER
  key: Buffer // writer's key
  name?: string // writer's name
  admin?: boolean // is admin?
  frozen?: boolean // is frozen?
}

export interface ChangeOp extends Op {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel|ChangeOpPutWriter
}

export function isDeclareOp (v: any): v is DeclareOp {
  if (!v) return false
  const check = new TypeCheck()
  check.is(v.op, OP_DECLARE)
  check.is(Buffer.isBuffer(v.index), true)
  check.is(v.timestamp instanceof Date, true)
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
  check.is(v.timestamp instanceof Date, true)
  check.type(v.details, 'object')
  if (v.details) {
    validateChangeAction(check, v)
  }
  return check.valid
}

export function isChangeOpFileAct (op: ChangeOp): boolean {
  return (
    op.details.action === OP_CHANGE_ACT_PUT
    || op.details.action === OP_CHANGE_ACT_COPY
    || op.details.action === OP_CHANGE_ACT_DEL
  )
}

export function isChangeOpMetaAct (op: ChangeOp): boolean {
  return (
    op.details.action === OP_CHANGE_ACT_PUT_WRITER
  )
}

// indexed data
// =

export interface IndexedMetaWriter {
  key: Buffer // writer key
  name: string // user-facing user name
  admin: boolean // can assign other writers?
  frozen: boolean // are further updates disabled?
}

export interface IndexedMeta {
  owner: Buffer // owner key
  ownerIndex: Buffer // owner's index key
  writers: IndexedMetaWriter[]
  timestamp: Date // local clock time of last change
  change: string // last change id
}

export interface IndexedChange {
  id: string // random generated ID
  parents: string[] // IDs of changes which preceded this change
  writer: Buffer // key of the core that authored the change
  timestamp: Date // local clock time of change
  details: ChangeOpPut|ChangeOpCopy|ChangeOpDel|ChangeOpPutWriter
}

export interface IndexedFile {
  path: string // path of the file in the tree
  timestamp: Date // local clock time of last change
  bytes: number // number of bytes in this blob (0 if delete or move)

  writer: Buffer // key of the core that authored the change
  blob: string|undefined // blob ID

  change: string // last change id
  noMerge: boolean // in no-merge mode?
  otherChanges: string[] // other current change ids
}

export function isIndexedMeta (v: any): v is IndexedMeta {
  if (!v) return false
  const check = new TypeCheck()
  check.is(Buffer.isBuffer(v.owner), true)
  check.is(Buffer.isBuffer(v.ownerIndex), true)
  check.arrayIs(v.writers, (w: any) => Buffer.isBuffer(w.key) && typeof w.name === 'string' && typeof w.admin === 'boolean' && typeof w.frozen === 'boolean')
  check.is(v.timestamp instanceof Date, true)
  check.type(v.change, 'string')
  return check.valid
}

export function isIndexedChange (v: any): v is IndexedChange {
  if (!v) return false
  const check = new TypeCheck()
  check.type(v.id, 'string')
  check.arrayType(v.parents, 'string')
  check.is(Buffer.isBuffer(v.writer), true)
  check.is(v.timestamp instanceof Date, true)
  check.type(v.details, 'object')
  if (v.details) {
    validateChangeAction(check, v)
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
  check.type(v.noMerge, 'boolean')
  check.arrayType(v.otherChanges, 'string')
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
  conflict?: boolean // in conflict?
  noMerge?: boolean // in no-merge mode?
  otherChanges?: FileInfo[] // conflicting file infos
}

// internal methods
// =

function validateChangeAction (check: TypeCheck, v: any) {
  check.type(v.details.action, 'number')
  if (v.details.action === OP_CHANGE_ACT_PUT) {
    check.type(v.details.path, 'string')
    check.type(v.details.blob, 'string')
    check.type(v.details.bytes, 'number')
    check.type(v.details.chunks, 'number')
    check.type(v.details.noMerge, 'boolean')
  } else if (v.details.action === OP_CHANGE_ACT_COPY) {
    check.type(v.details.path, 'string')
    check.type(v.details.blob, 'string')
    check.type(v.details.bytes, 'number')
  } else if (v.details.action === OP_CHANGE_ACT_DEL) {
    check.type(v.details.path, 'string')
  } else if (v.details.action === OP_CHANGE_ACT_PUT_WRITER) {
    check.is(Buffer.isBuffer(v.details.key), true)
    if (typeof v.details.name !== 'undefined') check.type(v.details.name, 'string')
    if (typeof v.details.admin !== 'undefined') check.type(v.details.admin, 'boolean')
    if (typeof v.details.frozen !== 'undefined') check.type(v.details.frozen, 'boolean')
  }
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