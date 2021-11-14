export type SerializedFileTree = string[][]

export interface FileTreeDiff {
  added: string[][]
  changed: string[][]
  removed: string[]
}

export class FileTree {
  constructor (public files: Record<string, string> = {}) {}

  list (path = '/'): string[] {
    if (!path.endsWith('/')) path = `${path}/`
    return Object.entries(this.files).filter(([filepath, blobRef]) => filepath.startsWith(path)).map(([filepath]) => filepath)
  }

  read (path: string): string|undefined {
    return this.files[path]
  }

  write (path: string, blobRef: string) {
    this.files[path] = blobRef
  }

  delete (path: string) {
    delete this.files[path]
  }

  diff (oldTree: FileTree): FileTreeDiff {
    const diff: FileTreeDiff = {added: [], changed: [], removed: []}
    for (const path in this.files) {
      if (!oldTree.files[path]) diff.added.push([path, this.files[path]])
      else if (oldTree.files[path] !== this.files[path]) diff.changed.push([path, this.files[path]])
    }
    for (const path in oldTree.files) {
      if (!this.files[path]) diff.removed.push(path)
    }
    return diff
  }

  serialize (): SerializedFileTree {
    return Object.entries(this.files).sort((a, b) => a[0].localeCompare(b[0]))
  }

  static fromSerialized (obj: SerializedFileTree) {
    return new FileTree(Object.fromEntries(obj || []))
  }
}