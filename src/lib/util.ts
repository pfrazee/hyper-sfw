export function toBuffer (v: string|Buffer): Buffer {
  return Buffer.isBuffer(v) ? v : Buffer.from(v, 'hex')
}

export function toHex (v: string|Buffer): string {
  if (Buffer.isBuffer(v)) return v.toString('hex')
  return v
}