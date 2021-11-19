// @ts-ignore no types available yet -prf
import Hypercore from 'hypercore'
import EventEmitter from 'events'
import * as msgpackr from 'msgpackr'
import { Workspace } from '../index.js'

export const EXTENSION_ID = 'hsfw-writerctrl'
const USE_INVITE_TIMEOUT = 30e3

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
  constructor (public ws: Workspace, public core: Hypercore) {
    super()
    this.ext = core.registerExtension(EXTENSION_ID, {
      encoding: 'binary',
      onmessage: this._onmessage.bind(this)
    })
  }

  async _onmessage (message: Buffer, peer: any) {
    let parsed
    try {
      parsed = msgpackr.unpack(message)
      switch (parsed.msg) {
        case 'USE_INVITE': {
          const invite = this.ws.getInvite(parsed.token)
          if (!invite) {
            return this.sendUseInviteResponse(peer, false, `Invalid invite code (${parsed.token})`)
          }
          if (!Buffer.isBuffer(parsed.writerKey) || parsed.writerKey.length !== 32) {
            return this.sendUseInviteResponse(peer, false, `Invite code (${parsed.token}) is valid but the writer key is not`)
          }
          this.ws.delInvite(parsed.token)
          await this.ws.putWriter(parsed.writerKey, {
            name: invite.recipientName,
            admin: false,
            frozen: false
          })
          this.emit('invite-used', invite)
          this.sendUseInviteResponse(peer, true)
          break
        }
        case 'USE_INVITE_RES':
          this.emit('use-invite-res', parsed)
          break
        default:
          throw new Error(`Unknown message type: ${parsed.message}`)
      }
    } catch (e) {
      console.error(`Error handling message in ${EXTENSION_ID} wire protocol.`, parsed || 'Invalid msgpack encoding.', e)
    }
  }

  async useInvite (invite: string, writerKey: Buffer) {
    const [prefix, peerPublicKeyHex, token] = invite.split(':')
    if (prefix !== 'invite') throw new Error('Not an invite code')
    if (!peerPublicKeyHex || !token) throw new Error('Incomplete invite code')

    const p = new Promise(r => {
      this.once('use-invite-res', r)
    })

    let sent = false
    for (const peer of this.core.peers) {
      const remotePublicKeyHex = peer.protocol.noiseStream.remotePublicKey.toString('hex')
      if (remotePublicKeyHex === peerPublicKeyHex) {
        this.sendUseInvite(peer, token, writerKey)
        sent = true
      }
    }

    if (!sent) {
      throw new Error(`Can't find the user that created this invite. Are they online? (Are you?)`)
    }

    const timeoutP = new Promise((resolve, reject) => setTimeout(() => reject(new Error('Timed out waiting for a response')), USE_INVITE_TIMEOUT))
    const res: any = await Promise.race([p, timeoutP])
    if (!res.success) {
      throw new Error(res.error || 'Invite failed')
    }
  }

  sendUseInvite (peer: any, token: string, writerKey: Buffer) {
    this.ext.send(msgpackr.pack({msg: 'USE_INVITE', token, writerKey}), peer)
  }

  sendUseInviteResponse (peer: any, success: boolean, error?: string) {
    this.ext.send(msgpackr.pack({msg: 'USE_INVITE_RES', success, error}), peer)
  }
}