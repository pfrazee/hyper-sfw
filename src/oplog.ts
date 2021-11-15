import { unpack, pack } from 'msgpackr'
// @ts-ignore no types available yet -prf
import crypto from 'hypercore-crypto'
// @ts-ignore no types available yet -prf
import Corestore from 'corestore'
import { BaseWorkspaceCore } from './base.js'
import * as struct from './structures.js'

export class WorkspaceWriter extends BaseWorkspaceCore {
  static createNew (store: Corestore) {
    const keyPair = crypto.keyPair()
    return new WorkspaceWriter(store, keyPair.publicKey, keyPair.secretKey)
  }

  static load (store: Corestore, publicKey: string, secretKey?: string) {
    return new WorkspaceWriter(
      store,
      Buffer.from(publicKey, 'hex'),
      secretKey ? Buffer.from(secretKey, 'hex') : undefined
    )
  }

  static packop (value: struct.SetMetaOp|struct.ChangeOp|struct.BlobChunkOp) {
    validateOp(value)
    return pack(value)
  }

  static unpackop (buf: Buffer): struct.SetMetaOp|struct.ChangeOp|struct.BlobChunkOp {
    const value = unpack(buf)
    validateOp(value)
    return value
  }
}

function validateOp (value: struct.SetMetaOp|struct.ChangeOp|struct.BlobChunkOp) {
  switch (value.op) {
    case struct.OP_SET_META:
      if (!struct.isSetMetaOp(value)) throw new Error(`Invalid SetMeta operation`)
      break
    case struct.OP_CHANGE:
      if (!struct.isChangeOp(value)) throw new Error(`Invalid Change operation`)
      break
    case struct.OP_BLOB_CHUNK:
      if (!struct.isBlobChunkOp(value)) throw new Error(`Invalid BlobChunk operation`)
      break
    default:
      throw new Error(`Invalid op code: ${value.op}`)
  }
}