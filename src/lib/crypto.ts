import { createHash, randomBytes } from 'crypto'

export function hash (buf: Buffer): string {
  const hashSum = createHash('sha256')
  hashSum.update(buf)
  return `sha256-${hashSum.digest('hex')}`
}

export function genId () {
  return randomBytes(8).toString('hex')
}
