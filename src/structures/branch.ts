import { SerializedFileTree } from './filetree.js'

export interface BranchData {
  commit: string
  conflicts: string[]
  files: SerializedFileTree
}

export class Branch {
  constructor (public data: BranchData) {
    // TODO validate
  }
}