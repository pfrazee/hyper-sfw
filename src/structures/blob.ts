export interface BlobData {
  hash: string
  bytes: number
  length: number
}

export interface BlobChunkData {
  value: Buffer
}

export interface IndexedBlobData {
  writer: Buffer
  bytes: number
  start: number
  end: number
}

export class Blob {
  constructor (public data: BlobData) {
    // TODO validate
  }
}

export class BlobChunk {
  constructor (public data: BlobChunkData) {
    // TODO validate
  }
}

export class IndexedBlob {
  constructor (public data: IndexedBlobData) {
    // TODO validate
  }
}