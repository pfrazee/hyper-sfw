import { createHash, randomBytes } from 'crypto'

export function hash (buf: Buffer): string {
  const hashSum = createHash('sha256')
  hashSum.update(buf)
  return `sha256-${hashSum.digest('hex')}`
}

export function genId (len = 8) {
  return randomBytes(len).toString('hex')
}
