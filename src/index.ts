// @ts-ignore no types available yet -prf
import crypto from 'hypercore-crypto'
// @ts-ignore no types available yet -prf
import Corestore from 'corestore'
// @ts-ignore no types available yet -prf
import Hypercore from 'hypercore'
// @ts-ignore no types available yet -prf
import Autobase from 'autobase'
// @ts-ignore no types available yet -prf
import Hyperbee from 'hyperbee'
// @ts-ignore no types available yet -prf
import HyperbeeMessages from 'hyperbee/lib/messages.js'
// @ts-ignore no types available yet -prf
import MonotonicLexicographicTimestamp from 'monotonic-lexicographic-timestamp'
import pump from 'pump'
import concat from 'concat-stream'
import through from 'through2'
import * as msgpackr from 'msgpackr'
import match from 'micromatch'
import { BaseWorkspaceCore } from './base.js'
import { WorkspaceWriter } from './oplog.js'
import * as structs from './structures.js'
import { WriterCtrlExtension } from './wire-extensions/hsfw-writerctrl.js'
import { genId, hash } from './lib/crypto.js'
import lock from './lib/lock.js'
import { toBuffer, toHex } from './lib/util.js'

export * from './base.js'
export * from './oplog.js'
export * from './structures.js'

const mlts = MonotonicLexicographicTimestamp()

export interface KeyPair {
  publicKey: Buffer
  secretKey?: Buffer
}

export interface WorkspaceOpts {
  store: Corestore
  swarmKeyPair: KeyPair
  writers?: WorkspaceWriter[]
  indexes: WorkspaceIndex[]
}

export interface ReadFileOpts {
  change?: string
  encoding?: string
}

export interface WriteFileOpts {
  encoding?: string
  noMerge?: boolean
}

export interface WriteOpts {
  writer?: Buffer|Hypercore
  prefix?: string
}

export interface WorkspaceWireExtensions {
  writerCtrl?: WriterCtrlExtension
}

export interface WorkspaceInvite {
  token: string
  creatorSwarmPublicKey: Buffer
  recipientName: string
}

export class WorkspaceIndex extends BaseWorkspaceCore {
  constructor (public store: Corestore, public publicKey: Buffer, public secretKey: Buffer|undefined, public isOwnerIndex: boolean) {
    super(store, publicKey, secretKey)
  }

  static createNew (store: Corestore, isOwnerIndex: boolean) {
    const keyPair = crypto.keyPair()
    return new WorkspaceIndex(store, keyPair.publicKey, keyPair.secretKey, isOwnerIndex)
  }

  static load (store: Corestore, publicKey: string|Buffer, secretKey: string|Buffer|undefined, isOwnerIndex: boolean) {
    return new WorkspaceIndex(
      store,
      toBuffer(publicKey),
      secretKey ? toBuffer(secretKey) : undefined,
      isOwnerIndex
    )
  }
}

let _debugIdCounter = 1
export class Workspace {
  debugId = `Workspace${_debugIdCounter++}`
  autobase: Autobase
  indexBee: Hyperbee
  store: Corestore

  writers: WorkspaceWriter[]
  indexes: WorkspaceIndex[]

  swarmKeyPair: KeyPair
  wireExt: WorkspaceWireExtensions = {}
  invites: WorkspaceInvite[] = []
  constructor ({store, writers, indexes, swarmKeyPair}: WorkspaceOpts) {
    this.store = store
    this.writers = writers || []
    this.indexes = indexes
    this.swarmKeyPair = swarmKeyPair
    const inputs = this.writers.map(w => w.core)
    const defaultInput = inputs.find(core => core.writable)

    this.autobase = new Autobase(inputs, {indexes: indexes.map(idx => idx.core), input: defaultInput})

    const indexCore = this.autobase.createRebasedIndex({
      unwrap: true,
      apply: this._apply.bind(this)
    })
    this.indexBee = new Hyperbee(indexCore, {
      extension: false,
      keyEncoding: 'utf-8',
      valueEncoding: {
        encode: (v: any) => msgpackr.pack(v),
        encodingLength: (v: any) => msgpackr.pack(v).length,
        decode: (v: any) => msgpackr.unpack(v)
      }
    })

    this._setupWireExtensions()
  }

  _setupWireExtensions () {
    if (this.wireExt.writerCtrl) return
    const ownerIdx = this.indexes.find(idx => idx.isOwnerIndex)
    if (ownerIdx) {
      this.wireExt.writerCtrl = new WriterCtrlExtension(this, ownerIdx.core)
    }
  }

  [Symbol.for('nodejs.util.inspect.custom')] (depth: number, opts: any) {
    let indent = ''
    if (typeof opts.indentationLvl === 'number') {
      while (indent.length < opts.indentationLvl) indent += ' '
    }

    const inspectWsWriter = (w: WorkspaceWriter) => {
      return (
        indent + '    {\n' +
        indent + '      key: ' + opts.stylize(toHex(w.publicKey), 'string') + '\n' +
        indent + '      name: ' + opts.stylize(w.name, 'string') + '\n' +
        indent + '      admin: ' + opts.stylize(w.isAdmin, 'boolean') + '\n' +
        indent + '      owner: ' + opts.stylize(w.isOwner, 'boolean') + '\n' +
        indent + '      writable: ' + opts.stylize(w.core.writable, 'boolean') + '\n' +
        indent + '    }\n'
      )
    }
    const inspectWsIndex = (idx: WorkspaceIndex) => {
      return (
        indent + '    {\n' +
        indent + '      key: ' + opts.stylize(toHex(idx.publicKey), 'string') + '\n' +
        indent + '      writable: ' + opts.stylize(idx.core.writable, 'boolean') + '\n' +
        indent + '    }\n'
      )
    }

    return this.constructor.name + '(\n' +
      indent + '  key: ' + opts.stylize((toHex(this.key)), 'string') + '\n' +
      indent + '  writable: ' + opts.stylize(this.writable, 'boolean') + '\n' +
      indent + '  admin: ' + opts.stylize(this.isAdmin, 'boolean') + '\n' +
      indent + '  owner: ' + opts.stylize(this.isOwner, 'boolean') + '\n' +
      indent + '  swarmPubKey: ' + opts.stylize(toHex(this.swarmKeyPair.publicKey), 'string') + '\n' +
      indent + '  writers: [\n' + this.writers.map(inspectWsWriter).join('') + '  ]\n' +
      indent + '  indexes: [\n' + this.indexes.map(inspectWsIndex).join('') + '  ]\n' +
      indent + ')'
  }

  static async createNew (store: Corestore, swarmKeyPair: KeyPair) {
    const writer = await WorkspaceWriter.createNew(store, {isOwner: true, isAdmin: true})
    await writer.core.ready()
    const index = WorkspaceIndex.createNew(store, true)
    await index.core.ready()
    const workspace = new Workspace({
      store,
      swarmKeyPair,
      writers: [writer],
      indexes: [index]
    })
    await workspace.ready()
    await workspace._writeDeclaration()
    return workspace
  }

  static async load (store: Corestore, swarmKeyPair: KeyPair, publicKey: Buffer|string) {
    publicKey = toBuffer(publicKey)
    const ownerWriter = await WorkspaceWriter.load(store, publicKey, undefined, {isOwner: true, isAdmin: true})
    await ownerWriter.core.ready()
    const localIndex = WorkspaceIndex.createNew(store, false)
    await localIndex.core.ready()
    const workspace = new Workspace({
      store,
      swarmKeyPair,
      writers: [ownerWriter],
      indexes: [localIndex]
    })
    await workspace.ready()
    await workspace._loadFromDeclaration(ownerWriter.core)
    await workspace._loadFromMeta()
    return workspace
  }

  async ready () {
    await this.autobase.ready()
    await this.indexBee.ready()
  }

  get key () {
    const owner = this.getOwner()
    if (owner) return owner.publicKey
    throw new Error('No owner writer set')
  }

  serialize () {
    return {
      key: this.key.toString('hex'),
      writers: this.writers.map(w => w.serialize()),
      indexes: this.indexes.map(idx => idx.serialize())
    }
  }

  toJSON () {
    return {
      key: this.key.toString('hex'),
      writable: this.writable,
      writers: this.writers.map(w => w.toJSON())
    }
  }

  // writers
  // =

  getOwner () {
    return this.writers.find(w => w.isOwner)
  }

  get isOwner () {
    return Boolean(this.getOwner()?.core.writable)
  }

  getOwnerIndex () {
    return this.writers.find(w => w.isOwner)
  }

  getMyWriter (): WorkspaceWriter|undefined {
    return this.writers.find(w => w.core.writable)
  }

  getMyWriterCore (): Hypercore {
    const writer = this.getMyWriter()
    if (writer) return writer.core
    throw new Error('Not a writer')
  }

  getWriter (publicKey: string|Buffer): WorkspaceWriter|undefined {
    const publicKeyBuf = toBuffer(publicKey)
    return this.writers.find(w => w.publicKey.equals(publicKeyBuf))
  }

  get writable () {
    return Boolean(this.getMyWriter())
  }

  get isAdmin () {
    return Boolean(this.getMyWriter()?.isAdmin)
  }

  async listWriters () {
    await this._loadFromMeta() // ensure writers are fresh
    return this.writers
  }

  async putWriter (key: Buffer, {name, admin, frozen}: {name?: string, admin?: boolean, frozen?: boolean} = {}) {
    await this._loadFromMeta() // ensure writers are fresh

    const writer = this.getMyWriter()
    if (!writer) throw new Error(`Can't modify writers: not a writer`)
    if (!writer.isAdmin && !writer.publicKey.equals(key)) throw new Error(`Can't modify other writers: not an admin`)
    if (!writer.isAdmin && admin) throw new Error(`Can't modify admin settings: not an admin`)
    if (!writer.isAdmin && frozen) throw new Error(`Can't modify frozen settings: not an admin`)
    await this.autobase.append(WorkspaceWriter.packop({
      op: structs.OP_CHANGE,
      id: genId(),
      parents: [],
      timestamp: new Date(),
      details: {
        action: structs.OP_CHANGE_ACT_PUT_WRITER,
        key,
        name,
        admin,
        frozen
      }
    }), null, writer.core)
    await this._loadFromMeta()
  }

  async createInvite (recipientName = '') {
    await this._loadFromMeta() // ensure writers are fresh
    if (!this.isAdmin) throw new Error(`Can't create invites: not an admin`)
    const invite: WorkspaceInvite = {
      token: genId(),
      creatorSwarmPublicKey: this.swarmKeyPair.publicKey,
      recipientName
    }
    this.invites.push(invite)
    return `invite:${toHex(invite.creatorSwarmPublicKey)}:${invite.token}`
  }

  listInvites () {
    return this.invites
  }

  getInvite (token: string) {
    return this.invites.find(inv => inv.token === token)
  }

  delInvite (token: string) {
    const i = this.invites.findIndex(inv => inv.token === token)
    if (i !== -1) this.invites.splice(i, 1)
  }

  async useInvite (invite: string) {
    if (!this.wireExt.writerCtrl) throw new Error(`Unable to access invite protocol. Is the owner index loaded?`)
    if (this.getMyWriter()) throw new Error(`Can't use invite: already a writer`)

    const writer = await WorkspaceWriter.createNew(this.store, {isOwner: false, isAdmin: false})
    await writer.core.ready()
    await this.wireExt.writerCtrl.useInvite(invite, writer.publicKey) // throws if unsuccessful

    this.writers.push(writer)
    await this.autobase.addInput(writer.core)
    await this._loadFromMeta()

    return writer
  }

  // files
  // =

  _filepathTraverse (pathp: string[]) {
    let sub = this.indexBee.sub('files')
    for (const part of pathp) {
      sub = sub.sub(part)
    }
    return sub
  }

  async _getIndexedFile (path: string): Promise<structs.IndexedFile|undefined> {
    const pathp = path.split('/').filter(Boolean)
    if (pathp.length === 0) return undefined
    const sub = this._filepathTraverse(pathp.slice(0, -1))
    const indexedFile = await sub.get(pathp[pathp.length - 1])
    if (structs.isIndexedFile(indexedFile?.value)) return indexedFile.value
  }

  _gatherIndexedFileChangeParents (indexedFile: structs.IndexedFile|undefined) {
    let parents: string[] = []
    if (indexedFile) {
      parents.push(indexedFile.change)
      if (indexedFile.otherChanges?.length) {
        parents = parents.concat(indexedFile.otherChanges)
      }
    }
    return parents
  }

  async _getIndexedChangeParents (path: string): Promise<string[]> {
    return this._gatherIndexedFileChangeParents(await this._getIndexedFile(path))
  }

  async _getIndexedNomergeParents (path: string, writer: Buffer): Promise<string[]> {
    const indexedFile = await this._getIndexedFile(path)
    if (!indexedFile) return []

    const parents = []
    if (indexedFile.writer.equals(writer)) parents.push(indexedFile.change)
    for (const changeId of indexedFile.otherChanges) {
      const change = await this.getChange(changeId)
      if (change && change.writer.equals(writer)) parents.push(change.id)
    }
    return parents
  }

  async _getFileInfo (indexedFile: structs.IndexedFile): Promise<structs.FileInfo> {
    // @ts-ignore typescript isn't recognizing the filter operation
    const otherChanges: structs.IndexedChange[] = (
      indexedFile.otherChanges?.length > 0
        ? await Promise.all(indexedFile.otherChanges.map(c => this.getChange(c)))
        : []
    ).filter(Boolean)
    return {
      path: indexedFile.path,
      timestamp: indexedFile.timestamp,
      bytes: indexedFile.bytes,
      writer: indexedFile.writer,
      change: indexedFile.change,
      noMerge: indexedFile.noMerge,
      conflict: otherChanges.length > 0 && !indexedFile.noMerge,
      otherChanges: otherChanges.map((c: structs.IndexedChange, i: number) => ({
        path: (c.details as structs.ChangeOpFilesAct).path,
        timestamp: c.timestamp,
        bytes: ('bytes' in c.details) ? c.details.bytes : 0,
        writer: c.writer,
        change: indexedFile.otherChanges[i]
      }))
    }
  }

  async listFiles (path = '/', opts?: any): Promise<structs.FileInfo[]> {
    const self = this
    const sub = this._filepathTraverse(path.split('/').filter(Boolean))
    return await new Promise((resolve, reject) => {
      pump(
        sub.createReadStream(opts),
        through.obj(function (entry, enc, cb) {
          if (structs.isIndexedFile(entry?.value)) {
            self._getFileInfo(entry.value).then(
              v => {
                this.push(v)
                cb()
              },
              err => cb(err)
            )
          } else {
            cb()
          }
        }),
        concat((entries: any) => {
          resolve(entries as structs.FileInfo[])
        }),
        reject
      )
    })
  }

  async statFile (path: string): Promise<structs.FileInfo|undefined> {
    const indexedFile = await this._getIndexedFile(path)
    if (!indexedFile) return undefined
    return await this._getFileInfo(indexedFile)
  }

  async readFile (path: string, opts?: string|ReadFileOpts): Promise<Buffer|string|undefined> {
    if (typeof opts === 'string') {
      opts = {encoding: opts}
    }

    let blob
    if (typeof opts?.change === 'string') {
      const indexedChange = await this.getChange(opts.change)
      if (indexedChange?.details.action === structs.OP_CHANGE_ACT_PUT) {
        blob = (indexedChange.details as structs.ChangeOpPut).blob
      } else if (indexedChange?.details.action === structs.OP_CHANGE_ACT_COPY) {
        blob = (indexedChange.details as structs.ChangeOpCopy).blob
      }
    } else {
      const indexedFile = await this._getIndexedFile(path)
      blob = indexedFile?.blob
    }
    if (!blob) return undefined
    return this._getBlobData(blob, opts)
  }

  async readAllFileStates (path: string): Promise<{writer: Buffer, data: Buffer}[]> {
    const indexedFile = await this._getIndexedFile(path)
    if (!indexedFile) return []

    const buffers = []
    if (indexedFile.blob) {
      buffers.push({
        writer: indexedFile.writer,
        data: (await this._getBlobData(indexedFile.blob)) as Buffer
      })
    }
    for (const changeId of indexedFile.otherChanges) {
      const change = await this.getChange(changeId)
      if (change && (change.details as structs.ChangeOpPut).blob) {
        buffers.push({
          writer: indexedFile.writer,
          data: (await this._getBlobData((change.details as structs.ChangeOpPut).blob)) as Buffer
        })
      }
    }
    return buffers
  }

  async writeFile (path: string, value: Buffer|string, opts?: string|WriteFileOpts) {
    if (typeof opts === 'string') {
      opts = {encoding: opts}
    }

    let blob: Buffer
    if (Buffer.isBuffer(value)) {
      blob = value
    } else {
      blob = Buffer.from(value, (opts?.encoding || 'utf-8') as BufferEncoding)
    }

    path = `/${path.split('/').filter(Boolean).join('/')}`
    const writerCore = this.getMyWriterCore()
    const blobChunks = []
    {
      let i = 0
      while (i < blob.length) {
        blobChunks.push(blob.slice(i, i + structs.BLOB_CHUNK_BYTE_LENGTH))
        i += structs.BLOB_CHUNK_BYTE_LENGTH
      }
    }

    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const blobId = hash(blob)
      const parents = opts?.noMerge
        ? await this._getIndexedNomergeParents(path, writerCore.key)
        : await this._getIndexedChangeParents(path)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_PUT,
          path,
          blob: blobId,
          chunks: blobChunks.length,
          bytes: blob.length,
          noMerge: opts?.noMerge || false
        }
      }), null, writerCore)
      for (const value of blobChunks) {
        await this.autobase.append(WorkspaceWriter.packop({
          op: structs.OP_BLOB_CHUNK,
          blob: blobId,
          chunk: blobChunks.indexOf(value),
          value
        }), null, writerCore)
      }
    } finally {
      release()
    }
    // HACK force to get indexed
    await this.statFile(path)
  }

  async moveFile (srcPath: string, dstPath: string) {
    srcPath = `/${srcPath.split('/').filter(Boolean).join('/')}`
    dstPath = `/${dstPath.split('/').filter(Boolean).join('/')}`
    const writerCore = this.getMyWriterCore()
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const indexedSrcFile = await this._getIndexedFile(srcPath)
      if (!indexedSrcFile) {
        throw new Error(`Cannot move ${srcPath}: file does not exist`)
      }
      if (indexedSrcFile.otherChanges.length) {
        throw new Error(`Cannot move ${srcPath}: file is in conflict`)
      }
      const srcParents = this._gatherIndexedFileChangeParents(indexedSrcFile)
      const dstParents = await this._getIndexedChangeParents(dstPath)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: dstParents,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_COPY,
          path: dstPath,
          blob: indexedSrcFile.blob,
          bytes: indexedSrcFile.bytes
        }
      }), null, writerCore)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: srcParents,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_DEL,
          path: srcPath
        }
      }), null, writerCore)
    } finally {
      release()
    }
    // HACK force to get indexed
    await this.statFile(dstPath)
  }

  async copyFile (srcPath: string, dstPath: string) {
    srcPath = `/${srcPath.split('/').filter(Boolean).join('/')}`
    dstPath = `/${dstPath.split('/').filter(Boolean).join('/')}`
    const writerCore = this.getMyWriterCore()
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const indexedSrcFile = await this._getIndexedFile(srcPath)
      if (!indexedSrcFile) {
        throw new Error(`Cannot copy ${srcPath}: file does not exist`)
      }
      if (indexedSrcFile.otherChanges.length) {
        throw new Error(`Cannot copy ${srcPath}: file is in conflict`)
      }
      const dstParents = await this._getIndexedChangeParents(dstPath)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: dstParents,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_COPY,
          path: dstPath,
          blob: indexedSrcFile.blob,
          bytes: indexedSrcFile.bytes
        }
      }), null, writerCore)
    } finally {
      release()
    }
    // HACK force to get indexed
    await this.statFile(dstPath)
  }

  async deleteFile (path: string) {
    path = `/${path.split('/').filter(Boolean).join('/')}`
    const writerCore = this.getMyWriterCore()
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const parents = await this._getIndexedChangeParents(path)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_DEL,
          path
        }
      }), null, writerCore)
    } finally {
      release()
    }

    // HACK force to get indexed
    await this.statFile(path)
  }

  // history
  // =

  async getChange (changeId: string): Promise<structs.IndexedChange|undefined> {
    const entry = await this.indexBee.sub('changes').get(changeId)
    if (structs.isIndexedChange(entry?.value)) return entry.value
  }

  async listHistory (opts?: any): Promise<structs.IndexedChange[]> {
    const self = this
    const matcher = typeof opts?.path === 'string' ? match.matcher(opts.path) : undefined
    return await new Promise((resolve, reject) => {
      pump(
        this.indexBee.sub('history').createReadStream(opts),
        through.obj(function (entry, enc, cb) {
          if (typeof entry.value !== 'string') return cb()
          self.getChange(entry.value).then(
            change => {
              if (change) {
                if (matcher && (!('path' in change.details) || !matcher(change.details.path))) {
                  // skip
                } else {
                  this.push(change)
                }
              }
              cb()
            },
            err => cb(err)
          )
        }),
        concat((entries: any) => {
          resolve(entries as structs.IndexedChange[])
        }),
        reject
      )
    })
  }

  // blobs
  // =

  async _getBlobData (blobId: string, opts?: ReadFileOpts): Promise<Buffer|string> {
    const buf: Buffer = await new Promise((resolve, reject) => {
      pump(
        this.indexBee.sub('blobchunks').sub(blobId).createReadStream(),
        concat((entries: any) => {
          resolve(Buffer.concat(entries.map((entry: any) => entry.value)))
        }),
        reject
      )
    })
    if (opts?.encoding && opts?.encoding !== 'binary') {
      return buf.toString(opts?.encoding as BufferEncoding)
    }
    return buf
  }

  // meta
  // =

  async _writeDeclaration () {
    await this.autobase.append(WorkspaceWriter.packop({
      op: structs.OP_DECLARE,
      index: this.indexes[0].core.key,
      timestamp: new Date()
    }), null, this.getMyWriterCore())
  }

  async _readDeclaration (core: Hypercore): Promise<structs.DeclareOp> {
    const chunk = await this.autobase._getInputNode(core, 1)
    const op = WorkspaceWriter.unpackop(chunk.value)
    if (structs.isDeclareOp(op)) {
      return op
    }
    throw new Error(`Declaration Op not found`)
  }

  async _loadFromDeclaration (core: Hypercore): Promise<void> {
    const declOp = await this._readDeclaration(core)
    const ownerIndex = WorkspaceIndex.load(this.store, declOp.index, undefined, true)
    await ownerIndex.core.ready()
    this.indexes.push(ownerIndex)
    this.autobase.addDefaultIndex(ownerIndex.core)
    this._setupWireExtensions()
  }

  async _loadFromMeta (meta?: structs.IndexedMeta): Promise<void> {
    if (!meta) {
      const metaEntry = await this.indexBee.get('_meta')
      meta = structs.isIndexedMeta(metaEntry?.value) ? metaEntry.value : undefined
    }
    if (!meta) return
    for (const w of meta.writers) {
      let writer = this.getWriter(w.key)
      if (writer) {
        writer.name = w.name
        writer.isAdmin = w.admin
        writer.isFrozen = w.frozen
      } else {
        writer = WorkspaceWriter.load(this.store, w.key, undefined, {
          isOwner: false,
          name: w.name,
          isAdmin: w.admin,
          isFrozen: w.frozen
        })
        await writer.core.ready()
        this.writers.push(writer)
        this.autobase.addInput(writer.core)
      }
    }
  }

  async _createWriter () {
    const writer = WorkspaceWriter.createNew(this.store)
    await writer.core.ready()
    this.writers.push(writer)
    this.autobase.addInput(writer.core)
    return writer
  }

  async _addWriter (publicKey: string) {
    const writer = WorkspaceWriter.load(this.store, publicKey, undefined)
    await writer.core.ready()
    this.writers.push(writer)
    await this.autobase.addInput(writer.core)
    return writer
  }

  // async _removeWriter (publicKey: string|Buffer) {
  //   publicKey = (Buffer.isBuffer(publicKey)) ? publicKey : Buffer.from(publicKey, 'hex')
  //   const i = this.writers.findIndex(w => w.publicKey.equals(publicKey as Buffer))
  //   if (i === -1) throw new Error('Writer not found')
  //   await this.autobase.removeInput(this.writers[i].core)
  //   this.writers.splice(i, 1)
  // }

  // indexing
  // =

  async _apply (batch: any[], clocks: any, change: Buffer) {
    if (this.indexBee._feed.length === 0) {
      // TODO needed?
      // HACK
      // when the indexBee is using the in-memory rebased core
      // (because it doesnt have one of its own, and is relying on a remote index)
      // it doesn't correctly write its header
      // so we do it here
      // -prf
      // await this.indexBee._feed.append(HyperbeeMessages.Header.encode({
      //   protocol: 'hyperbee'
      // }))
    }

    const b = this.indexBee.batch({ update: false })
    for (const node of batch) {
      try {
        var op = WorkspaceWriter.unpackop(node.value)
      } catch (e) {
        // skip: not an op
        console.error('Warning: not an op', node.value, e)
        continue
      }

      try {
        // console.debug('OP', this.debugId, op)
        if (structs.isDeclareOp(op)) {
          const owner = this.getOwner()
          if (owner && change.equals(owner.publicKey)) {
            const indexedMeta: structs.IndexedMeta = {
              owner: change,
              ownerIndex: op.index,
              writers: [{key: change, name: '', admin: true, frozen: false}],
              timestamp: op.timestamp,
              change: ''
            }
            await b.put('_meta', indexedMeta)
          } else {
            console.error('Error: declaration operation found on non-owner core, key:', change, 'op:', op)
          }
        } else if (structs.isChangeOp(op)) {
          if (structs.isChangeOpFileAct(op)) {
            await this._applyChangeOpFileAct(op, b, change)
          } else if (structs.isChangeOpMetaAct(op)) {
            await this._applyChangeOpMetaAct(op, b, change)
          } else {
            console.error('Warning: invalid change op', op)
            continue
          }

          const indexedChange: structs.IndexedChange = {
            id: op.id,
            parents: op.parents,
            writer: change,
            timestamp: op.timestamp,
            details: op.details
          }
          await b.put(`changes\x00${indexedChange.id}`, indexedChange)
          await b.put(`history\x00${mlts()}`, indexedChange.id)
        } else if (structs.isBlobChunkOp(op)) {
          await b.put(`blobs\x00${op.blob}`, {})
          await b.put(`blobchunks\x00${op.blob}\x00${op.chunk}`, op.value)
        } else {
          // skip: not an op
          console.error('Warning: invalid op', op)
          continue
        }
      } catch (e) {
        console.error('Failed to apply operation', op, e)
      }
    }
    await b.flush()
  }

  async _applyChangeOpFileAct (op: structs.ChangeOp, b: any, change: Buffer) {
    const pathp = (op.details as structs.ChangeOpFilesAct).path.split('/').filter(Boolean)
    if (pathp.length === 0) {
      console.error(`Invalid path "${(op.details as structs.ChangeOpFilesAct).path}", skipping operation`, op)
      return
    }
    const beekey = `files\x00${pathp.join('\x00')}`
    const path = `/${pathp.join('/')}`

    // detect conflicts
    const currIndexedFileEntry = await b.get(beekey, {update: false})
    const currIndexedFile = structs.isIndexedFile(currIndexedFileEntry?.value) ? currIndexedFileEntry.value : undefined
    const currParents = this._gatherIndexedFileChangeParents(currIndexedFile)
    // @ts-ignore for some reason the isChangeOp() type guard isn't enforcing here
    const otherChanges = currParents.filter(parent => !op.parents.includes(parent))

    const indexedFile: structs.IndexedFile = {
      path,
      timestamp: op.timestamp, // local clock time of change
      bytes: 0,
    
      writer: change,
      blob: undefined,
    
      change: op.id,
      noMerge: false,
      otherChanges
    }

    // TODO track blobs in use and delete unused blobs if possible

    switch (op.details.action) {
      case structs.OP_CHANGE_ACT_PUT: {
        const putDetails = op.details as structs.ChangeOpPut
        indexedFile.blob = putDetails.blob
        indexedFile.bytes = putDetails.bytes
        indexedFile.noMerge = putDetails.noMerge
        await b.put(beekey, indexedFile)
        break
      }
      case structs.OP_CHANGE_ACT_COPY: {
        const copyDetails = op.details as structs.ChangeOpCopy
        indexedFile.blob = copyDetails.blob
        indexedFile.bytes = copyDetails.bytes
        await b.put(beekey, indexedFile)
        break
      }
      case structs.OP_CHANGE_ACT_DEL:
        if (otherChanges.length === 0) {
          await b.del(beekey)
        } else {
          await b.put(beekey, indexedFile)
        }
        break
    }
  }

  async _applyChangeOpMetaAct (op: structs.ChangeOp, b: any, change: Buffer) {
    const putWriterDetails = op.details as structs.ChangeOpPutWriter

    const currIndexedMetaEntry = await b.get('_meta', {update: false})
    const currIndexedMeta: structs.IndexedMeta = structs.isIndexedMeta(currIndexedMetaEntry?.value) ? currIndexedMetaEntry.value : undefined
    if (!currIndexedMeta) {
      console.error('Unable to update writers, _meta entry invalid. Entry:', currIndexedMetaEntry)
      return
    }

    const writer = this.getWriter(change)
    if (!writer || (!writer.isAdmin && !putWriterDetails.key.equals(writer.publicKey))) {
      console.error('Non-admin attempted to edit writers, key:', change, 'op:', op)
      return
    }
    const hasAdminPowers = writer.isAdmin

    const existingEntry = currIndexedMeta.writers.find((w: structs.IndexedMetaWriter) => w.key.equals(putWriterDetails.key))
    if (existingEntry) {
      if ('name' in putWriterDetails) existingEntry.name = isString(putWriterDetails.name) ? putWriterDetails.name : existingEntry.name
      if (hasAdminPowers && 'admin' in putWriterDetails) existingEntry.admin = isBoolean(putWriterDetails.admin) ? putWriterDetails.admin : existingEntry.admin
      if (hasAdminPowers && 'frozen' in putWriterDetails) existingEntry.frozen = isBoolean(putWriterDetails.frozen) ? putWriterDetails.frozen : existingEntry.frozen
    } else {
      const indexedMetaWriter: structs.IndexedMetaWriter = {
        key: putWriterDetails.key,
        name: putWriterDetails.name || '',
        admin: hasAdminPowers && Boolean(putWriterDetails.admin),
        frozen: hasAdminPowers && Boolean(putWriterDetails.frozen)
      }
      currIndexedMeta.writers.push(indexedMetaWriter)
    }

    currIndexedMeta.change = op.id
    currIndexedMeta.timestamp = op.timestamp
    await b.put('_meta', currIndexedMeta)
    await this._loadFromMeta(currIndexedMeta)
  }
}

function isString (v: any): v is string {
  return typeof v === 'string'
}

function isBoolean (v: any): v is boolean {
  return typeof v === 'boolean'
}
