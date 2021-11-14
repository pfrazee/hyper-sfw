import { FileTree } from './structures/filetree.js'
import { Branch } from './structures/branch.js'
import { Repo, WriteOpts } from './repo.js'
import { Commit } from './structures/commit.js'
import { Blob, BlobChunk } from './structures/blob.js'
import { hash, genId } from './lib/crypto.js'
import { BLOB_CHUNK_BYTE_LENGTH } from './lib/const.js'

// TODO persist blobs to the local disk

export class Workspace {
  fileTree: FileTree
  blobs: Map<string, Buffer> = new Map()

  constructor (public repo: Repo, head: Branch) {
    this.fileTree = FileTree.fromSerialized(head.data.files)
  }

  static async create (repo: Repo) {
    const head = await repo.getBranch('main')
    return new Workspace(repo, head)
  }

  list (path = '/') {
    return this.fileTree.list(path)
  }

  read (path: string): Promise<Buffer|undefined> {
    const blobRef = this.fileTree.read(path)
    if (blobRef) {
      return this._getBlob(blobRef)
    } else {
      return Promise.resolve(undefined)
    }
  }

  async write (path: string, blob: Buffer) {
    const blobRef = hash(blob)
    if (!this.blobs.has(blobRef)) {
      this.blobs.set(blobRef, blob)
    }
    this.fileTree.write(path, blobRef)
    return await Promise.resolve(undefined)
  }

  async delete (path: string) {
    this.fileTree.delete(path)
    return await Promise.resolve(undefined)
  }

  async commit (message: string, opts?: WriteOpts) {
    const commit = await this._generateCommit(message)
    const ops: Array<Commit|Blob|BlobChunk> = [commit]
    for await (const op of this._generateCommitBlobs(commit)) {
      ops.push(op)
    }
    await this.repo.putCommit(ops, opts)
  }

  async _getBlob (blobRef: string): Promise<Buffer|undefined> {
    let blob = this.blobs.get(blobRef)
    if (!blob) {
      // pass through to the repo
      const blobInfo = await this.repo.getBlobInfo(blobRef)
      if (blobInfo) {
        blob = await this.repo.getBlobData(blobInfo)
      }
    }
    if (!blob) throw new BlobNotFoundError()
    return await Promise.resolve(blob)
  }

  async _generateCommit (message: string): Promise<Commit> {
    const head = await this.repo.getBranch('main')
    return new Commit({
      id: genId(),
      parents: [head.data.commit].concat(head.data.conflicts || []),
      message,
      timestamp: new Date(),
      diff: this.fileTree.diff(FileTree.fromSerialized(head.data.files))
    })
  }

  async* _generateCommitBlobs (commit: Commit): AsyncGenerator<Blob|BlobChunk> {
    const items = commit.data.diff.added.concat(commit.data.diff.changed)
    for (const [path, hash] of items) {
      const blob = await this._getBlob(hash)
      if (!blob) continue

      // TODO: detect if the blob length is close to the chunk size and cheat to avoid small slices

      yield new Blob({
        hash,
        bytes: blob.length,
        length: Math.ceil(blob.length / BLOB_CHUNK_BYTE_LENGTH)
      })
      let i = 0
      while (i < blob.length) {
        yield new BlobChunk({value: blob.slice(i, i + BLOB_CHUNK_BYTE_LENGTH)})
        i += BLOB_CHUNK_BYTE_LENGTH
      }
    }
  }
}

export class BlobNotFoundError extends Error {
  httpCode = 500
  constructor (message?: string) {
    super(message || '')
    this.name = 'BlobNotFoundError'
  }
}
