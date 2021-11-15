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
import { BaseWorkspaceCore } from './base.js'
import { WorkspaceWriter } from './oplog.js'
import * as structs from './structures.js'
import { genId } from './lib/crypto.js'
import lock from './lib/lock.js'

export * from './base.js'
export * from './oplog.js'
export * from './structures.js'

const mlts = MonotonicLexicographicTimestamp()

export interface WorkspaceMeta {
  schema: string
  writerKeys: string[]
}

export interface WorkspaceOpts {
  writers?: WorkspaceWriter[]
  indexes: WorkspaceIndex[]
}

export interface WriteOpts {
  writer?: Buffer|Hypercore
  prefix?: string
}

export class WorkspaceIndex extends BaseWorkspaceCore {
  static createNew (store: Corestore) {
    const keyPair = crypto.keyPair()
    return new WorkspaceIndex(store, keyPair.publicKey, keyPair.secretKey)
  }

  static load (store: Corestore, publicKey: string, secretKey?: string) {
    return new WorkspaceIndex(
      store,
      Buffer.from(publicKey, 'hex'),
      secretKey ? Buffer.from(secretKey, 'hex') : undefined
    )
  }
}

let _debugIdCounter = 1
export class Workspace {
  debugId = `Workspace${_debugIdCounter++}`
  autobase: Autobase
  indexBee: Hyperbee
  meta: WorkspaceMeta|undefined
  writers: WorkspaceWriter[]
  indexes: WorkspaceIndex[]
  constructor (public store: Corestore, {writers, indexes}: WorkspaceOpts) {
    this.writers = writers || []
    this.indexes = indexes
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
  }

  static async createNew (store: Corestore) {
    const writer = await WorkspaceWriter.createNew(store)
    await writer.core.ready()
    const index = WorkspaceIndex.createNew(store)
    await index.core.ready()
    const workspace = new Workspace(store, {
      writers: [writer],
      indexes: [index]
    })
    await workspace.ready()
    await workspace._persistMeta()
    return workspace
  }

  static async load (store: Corestore, publicKey: string) {
    const remoteIndex = WorkspaceIndex.load(store, publicKey)
    await remoteIndex.core.ready()
    const localIndex = WorkspaceIndex.createNew(store)
    await localIndex.core.ready()
    const workspace = new Workspace(store, {
      writers: [],
      indexes: [remoteIndex, localIndex]
    })
    await workspace.ready()
    await workspace._loadMeta()
    await workspace._watchMeta()
    return workspace
  }

  async ready () {
    await this.autobase.ready()
    await this.indexBee.ready()
  }

  get key () {
    return this.indexes[0].publicKey
  }

  get writable () {
    return !!this.autobase.inputs.find((core: Hypercore) => core.writable)
  }

  get isOwner () {
    return this.indexes[0].writable
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

  async createWriter () {
    const writer = WorkspaceWriter.createNew(this.store)
    await writer.core.ready()
    this.writers.push(writer)
    this.autobase.addInput(writer.core)
    await this._persistMeta()
    return writer
  }

  async addWriter (publicKey: string) {
    const writer = WorkspaceWriter.load(this.store, publicKey)
    await writer.core.ready()
    this.writers.push(writer)
    await this.autobase.addInput(writer.core)
    await this._persistMeta()
    return writer
  }

  async removeWriter (publicKey: string|Buffer) {
    publicKey = (Buffer.isBuffer(publicKey)) ? publicKey : Buffer.from(publicKey, 'hex')
    const i = this.writers.findIndex(w => w.publicKey.equals(publicKey as Buffer))
    if (i === -1) throw new Error('Writer not found')
    await this.autobase.removeInput(this.writers[i].core)
    this.writers.splice(i, 1)
    await this._persistMeta()
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
      if (indexedFile.conflicts?.length) {
        parents = parents.concat(indexedFile.conflicts)
      }
    }
    return parents
  }

  async _getIndexedChangeParents (path: string): Promise<string[]> {
    return this._gatherIndexedFileChangeParents(await this._getIndexedFile(path))
  }

  async _getFileInfo (indexedFile: structs.IndexedFile): Promise<structs.FileInfo> {
    // @ts-ignore typescript isn't recognizing the filter operation
    const conflicts: structs.IndexedChange[] = (
      indexedFile.conflicts?.length > 0
        ? await Promise.all(indexedFile.conflicts.map(c => this.getChange(c)))
        : []
    ).filter(Boolean)
    return {
      path: indexedFile.path,
      timestamp: indexedFile.timestamp,
      bytes: indexedFile.bytes,
      writer: indexedFile.writer,
      change: indexedFile.change,
      conflicts: conflicts.map((c: structs.IndexedChange, i: number) => ({
        path: c.path,
        timestamp: c.timestamp,
        bytes: ('bytes' in c.details) ? c.details.bytes : 0,
        writer: c.writer,
        change: indexedFile.conflicts[i]
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

  async readFile (path: string): Promise<Buffer|undefined> {
    const indexedFile = await this._getIndexedFile(path)
    if (!indexedFile?.blob) return undefined
    return this._getBlobData(indexedFile.blob)
  }

  async writeFile (path: string, blob: Buffer) {
    path = `/${path.split('/').filter(Boolean).join('/')}`
    const writer = getWriterCore(this)
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
      const blobId = genId()
      const parents = await this._getIndexedChangeParents(path)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents,
        path,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_PUT,
          blob: blobId,
          chunks: blobChunks.length,
          bytes: blob.length
        }
      }), null, writer)
      for (const value of blobChunks) {
        await this.autobase.append(WorkspaceWriter.packop({
          op: structs.OP_BLOB_CHUNK,
          blob: blobId,
          chunk: blobChunks.indexOf(value),
          value
        }), null, writer)
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
    const writer = getWriterCore(this)
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const indexedSrcFile = await this._getIndexedFile(srcPath)
      if (!indexedSrcFile) {
        throw new Error(`Cannot move ${srcPath}: file does not exist`)
      }
      const srcParents = this._gatherIndexedFileChangeParents(indexedSrcFile)
      const dstParents = await this._getIndexedChangeParents(dstPath)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: dstParents,
        path: dstPath,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_COPY,
          blob: indexedSrcFile.blob,
          bytes: indexedSrcFile.bytes
        }
      }), null, writer)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: srcParents,
        path: srcPath,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_DEL
        }
      }), null, writer)
    } finally {
      release()
    }
    // HACK force to get indexed
    await this.statFile(dstPath)
  }

  async copyFile (srcPath: string, dstPath: string) {
    srcPath = `/${srcPath.split('/').filter(Boolean).join('/')}`
    dstPath = `/${dstPath.split('/').filter(Boolean).join('/')}`
    const writer = getWriterCore(this)
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const indexedSrcFile = await this._getIndexedFile(srcPath)
      if (!indexedSrcFile) {
        throw new Error(`Cannot copy ${srcPath}: file does not exist`)
      }
      const dstParents = await this._getIndexedChangeParents(dstPath)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents: dstParents,
        path: dstPath,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_COPY,
          blob: indexedSrcFile.blob,
          bytes: indexedSrcFile.bytes
        }
      }), null, writer)
    } finally {
      release()
    }
    // HACK force to get indexed
    await this.statFile(dstPath)
  }

  async deleteFile (path: string) {
    path = `/${path.split('/').filter(Boolean).join('/')}`
    const writer = getWriterCore(this)
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const parents = await this._getIndexedChangeParents(path)
      await this.autobase.append(WorkspaceWriter.packop({
        op: structs.OP_CHANGE,
        id: genId(),
        parents,
        path,
        timestamp: new Date(),
        details: {
          action: structs.OP_CHANGE_ACT_DEL
        }
      }), null, writer)
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
    return await new Promise((resolve, reject) => {
      pump(
        this.indexBee.sub('history').createReadStream(opts),
        through.obj(function (entry, enc, cb) {
          if (typeof entry.value !== 'string') return cb()
          self.getChange(entry.value).then(
            change => {
              if (change) this.push(change)
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

  async _getBlobData (blobId: string): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      pump(
        this.indexBee.sub('blobchunks').sub(blobId).createReadStream(),
        concat((entries: any) => {
          resolve(Buffer.concat(entries.map((entry: any) => entry.value)))
        }),
        reject
      )
    })
  }

  // meta
  // =

  _watchMeta () {
    // TODO doesnt quite work
    /*this.indexes[0].core.on('append', () => {
      // TODO can we make this less stupid?
      this._loadMeta()
    })*/
  }

  async _loadMeta () {
    // TODO doesnt quite work
    /*const meta = (await this.indexBee.get('_meta'))?.value || {schema: 'sfw', writerKeys: []}
    meta.writerKeys = meta.writerKeys.map((buf: Buffer) => buf.toString('hex'))
    
    const release = await lock(`loadMeta:${this.key.toString('hex')}`)
    try {
      this.meta = meta
      for (const key of meta.writerKeys) {
        if (!this.writers.find(w => w.publicKey.toString('hex') === key)) {
          await this.addWriter(key)
        }
      }
      for (const w of this.writers) {
        if (!meta.writerKeys.includes(w.publicKey.toString('hex'))) {
          await this.removeWriter(w.publicKey)
        }
      }
    } finally {
      release()
    }*/
  }

  async _persistMeta () {
    // TODO doesnt quite work
    /*
    if (!this.isOwner) return
    this.meta = {schema: 'sfw', writerKeys: this.writers.map(w => w.publicKey.toString('hex'))}
    const writer = getWriterCore(this)
    const release = await lock(`write:${this.key.toString('hex')}`)
    try {
      const meta = {op: structs.OP_SET_META, schema: 'sfw', writerKeys: this.writers.map(w => w.publicKey)}
      await this.autobase.append(WorkspaceWriter.packop(meta), null, writer)

      // HACK
      // We need the index to apply this transaction ASAP but it doesn't do that until a read
      // reading it will trigger that
      // -prf
      await this.indexBee.get('_meta')
    } finally {
      release()
    }
    */
  }

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
        console.debug('OP', this.debugId, op)
        if (structs.isSetMetaOp(op)) {
          await b.put('_meta', {
            schema: op.schema,
            writerKeys: op.writerKeys
          })
        } else if (structs.isChangeOp(op)) {
          const pathp = op.path.split('/').filter(Boolean)
          if (pathp.length === 0) {
            console.error(`Invalid path "${op.path}", skipping operation`, op)
            continue
          }
          const beekey = `files\x00${pathp.join('\x00')}`
          const path = `/${pathp.join('/')}`

          // detect conflicts
          const currIndexedFileEntry = await b.get(beekey, {update: false})
          const currIndexedFile = structs.isIndexedFile(currIndexedFileEntry?.value) ? currIndexedFileEntry.value : undefined
          const currParents = this._gatherIndexedFileChangeParents(currIndexedFile)
          // @ts-ignore for some reason the isChangeOp() type guard isn't enforcing here
          const conflicts = currParents.filter(parent => !op.parents.includes(parent))

          const indexedFile: structs.IndexedFile = {
            path,
            timestamp: op.timestamp, // local clock time of change
            bytes: 0,
          
            writer: change,
            blob: undefined,
          
            change: op.id,
            conflicts
          }

          // TODO track blobs in use and delete unused blobs if possible

          switch (op.details.action) {
            case structs.OP_CHANGE_ACT_PUT: {
              const putDetails = op.details as structs.ChangeOpPut
              indexedFile.blob = putDetails.blob
              indexedFile.bytes = putDetails.bytes
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
              if (conflicts.length === 0) {
                await b.del(beekey)
              } else {
                await b.put(beekey, indexedFile)
              }
              break
            default:
              console.error('Warning: invalid change op', op)
              continue
          }

          const indexedChange: structs.IndexedChange = {
            id: op.id,
            parents: op.parents,
            writer: change,
            path: op.path,
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
}

function getWriterCore (workspace: Workspace, opts?: WriteOpts): Hypercore {
  let writer
  if (opts?.writer) {
    if (opts.writer instanceof WorkspaceWriter) {
      writer = workspace.writers.find(w => w === opts.writer)
    } else if (Buffer.isBuffer(opts.writer)) {
      writer = workspace.writers.find(w => w.publicKey.equals(opts.writer)) 
    }
  } else {
    writer = workspace.writers.find(w => w.core === workspace.autobase.defaultInput) || workspace.writers.find(w => w.writable)
  }
  if (!writer) {
    throw new Error(`Not a writer: ${opts?.writer}`)
  }
  if (!writer.writable) {
    throw new Error(`Not writable: ${opts?.writer}`)
  }
  return writer.core
}
