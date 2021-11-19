import { unpack, pack } from 'msgpackr'
// @ts-ignore no types available yet -prf
import crypto from 'hypercore-crypto'
// @ts-ignore no types available yet -prf
import Corestore from 'corestore'
import { BaseWorkspaceCore } from './base.js'
import * as struct from './structures.js'
import { toBuffer } from './lib/util.js'

export interface WorkspaceWriterOpts {
  isOwner?: boolean
  name?: string
  isAdmin?: boolean
  isFrozen?: boolean
}

export class WorkspaceWriter extends BaseWorkspaceCore {
  isOwner = false
  name = ''
  isAdmin = false
  isFrozen  =  false

  constructor (store: Corestore, publicKey: Buffer, secretKey: Buffer|undefined, opts?: WorkspaceWriterOpts) {
    super(store, publicKey, secretKey)
    this.isOwner = opts?.isOwner || false
    this.name = opts?.name || ''
    this.isAdmin = opts?.isAdmin || false
    this.isFrozen = opts?.isFrozen || false
  }

  static createNew (store: Corestore, opts?: WorkspaceWriterOpts) {
    const keyPair = crypto.keyPair()
    return new WorkspaceWriter(store, keyPair.publicKey, keyPair.secretKey, opts)
  }

  static load (store: Corestore, publicKey: string|Buffer, secretKey?: string|Buffer, opts?: WorkspaceWriterOpts) {
    return new WorkspaceWriter(
      store,
      toBuffer(publicKey),
      secretKey ? toBuffer(secretKey) : undefined,
      opts
    )
  }

  static packop (value: struct.DeclareOp|struct.ChangeOp|struct.BlobChunkOp) {
    validateOp(value)
    return pack(value)
  }

  static unpackop (buf: Buffer): struct.DeclareOp|struct.ChangeOp|struct.BlobChunkOp {
    const value = unpack(buf)
    validateOp(value)
    return value
  }
}

function validateOp (value: struct.DeclareOp|struct.ChangeOp|struct.BlobChunkOp) {
  switch (value.op) {
    case struct.OP_DECLARE:
      if (!struct.isDeclareOp(value)) throw new Error(`Invalid Declare operation`)
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