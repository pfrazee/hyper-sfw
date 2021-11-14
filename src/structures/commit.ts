import { FileTreeDiff } from './filetree.js'

export interface CommitData {
  id: string,
  writer?: Buffer
  parents: string[]
  message: string
  timestamp: Date,
  diff: FileTreeDiff
}

export class Commit {
  constructor (public data: CommitData) {
    // TODO validate
  }
}