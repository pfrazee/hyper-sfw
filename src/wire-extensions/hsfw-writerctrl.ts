// @ts-ignore no types available yet -prf
import Hypercore from 'hypercore'
import EventEmitter from 'events'
import * as msgpackr from 'msgpackr'
import { genId } from '../lib/crypto.js'

export const EXTENSION_ID = 'hsfw-writerctrl'

interface OnRemoteSupportsInfo {
  extension: any
  peer: any
}

export interface InviteDetails {
  code: string
  token: string
}

export class WriterCtrlExtension extends EventEmitter {
  ext: any
  tokens: string[] = []
  constructor (public core: Hypercore) {
    super()
    this.ext = core.registerExtension(EXTENSION_ID, {
      encoding: 'binary',
      onremotesupports: (info: OnRemoteSupportsInfo) => {
        // TODO needed?
      },
      onmessage: (message: Buffer, peer: any) => {
        try {
          const parsed = msgpackr.unpack(message)
          if (parsed.msg === 'USE_INVITE') {
            const ti = this.tokens.indexOf(parsed.token)
            if (ti === -1) throw new Error(`Invalid token (${parsed.token})`)
            if (!Buffer.isBuffer(parsed.writerKey) || parsed.writerKey.length !== 32) {
              throw new Error(`Token (${parsed.token}) is valid but the writer key is invalid`)
            }
            this.tokens.splice(ti, 1)
            this._addWriter(parsed.writerKey)
          } else {
            throw new Error(`Unknown message type: ${parsed.message}`)
          }
        } catch (e) {
          console.error(`Received invalid message in ${EXTENSION_ID} wire protocol`, e)
        }
      }
    })
  }

  createInvite (peerPublicKey: Buffer): InviteDetails {
    const token = genId()
    this.tokens.push(token)
    return {
      code: `hsfw-invite:${peerPublicKey.toString('hex')}:${token}`,
      token
    }
  }

  useInvite (invite: string, writerKey: Buffer) {
    const [prefix, peerPublicKeyHex, token] = invite.split(':')
    if (prefix !== 'hsfw-invite') throw new Error('Not an invite code')
    if (!peerPublicKeyHex || !token) throw new Error('Incomplete invite code')

    for (const peer of this.core.peers) {
      const remotePublicKeyHex = peer.protocol.noiseStream.remotePublicKey.toString('hex')
      if (remotePublicKeyHex === peerPublicKeyHex) {
        this.ext.send(msgpackr.pack({msg: 'USE_INVITE', token, writerKey}), peer)
      }
    }
  }

  _addWriter (writerKey: Buffer) {
    this.emit('add-writer', {writerKey: writerKey})
    // TODO broadcast event over the wire?
  }
}