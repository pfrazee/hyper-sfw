import bytes from 'bytes'

export const OP_SET_META = 1
export const OP_COMMIT = 2
export const OP_BLOB = 3
export const OP_BLOB_CHUNK = 4
export const BLOB_CHUNK_BYTE_LENGTH = bytes('4mb')