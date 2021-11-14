// @ts-ignore no types available yet -prf
import Corestore from 'corestore'
// @ts-ignore no types available yet -prf
import Hypercore from 'hypercore'

export class BaseRepoCore {
  core: Hypercore
  constructor (public store: Corestore, public publicKey: Buffer, public secretKey?: Buffer) {
    this.core = store.get({publicKey, secretKey})
  }

  get writable () {
    return !!this.secretKey
  }

  toJSON () {
    return {
      key: this.publicKey.toString('hex'),
      writable: this.writable
    }
  }

  serialize () {
    return {
      publicKey: this.publicKey.toString('hex'),
      secretKey: this.secretKey?.toString('hex'),
    }
  }
}