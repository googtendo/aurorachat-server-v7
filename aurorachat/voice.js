
const net = require('net')

/**
 * @param {String} command
 * @param {...String} args
 * @returns {String}
 */
function encodeVoice(command, ...args) {
    return `voice|${[command, ...args].map(v => encodeURIComponent(String(v ?? ''))).join('|')}|\n`
}

/**
 * @param {import('./core').CoreClient} client
 * @param {Object} peer
 * @param {Set} clients
 * @param {String} command
 * @param {String[]} args
 * @returns {undefined | String[]}
 */
function parseVoiceCommand(client, peer, clients, command, args) {
    switch(command.toLowerCase()) {
        case 'join': {
            let [room] = args
            room = room?.trim()

            if(room?.startsWith('#'))
                room = room.slice(1)

                if(!room || room.length > 64)
                    return ['error', 'bad_room']

                    leaveVoiceRoom(peer, clients)

                    peer.room = room

                    for(const other of clients) {
                        if(other === peer || other.room !== room)
                            continue

                            peer.socket.write(encodeVoice('join', other.username))
                    }

                    broadcastVoice(clients, peer, room, 'join', peer.username)

                    console.log(`Voice: ${peer.username} joined ${room}`)
        } break

        case 'leave': {
            leaveVoiceRoom(peer, clients)
        } break

        case 'audio': {
            if(!peer.room || !args[0])
                break

                const audio = args[0]

                if(audio.length > 12000)
                    return ['disconnect', 'audio_too_large']

                    if(client.user.checkFlag('MUTED'))
                        break

                        for(const other of clients) {
                            if(other === peer || other.room !== peer.room)
                                continue

                                if(!other.socket.destroyed)
                                    other.socket.write(encodeVoice('audio', peer.username, audio))
                        }
        } break

        default:
            return ['error', 'command_unknown']
    }
}

/**
 * @param {Object} peer
 * @param {Set} clients
 */
function leaveVoiceRoom(peer, clients) {
    if(!peer.room)
        return

        const oldRoom = peer.room

        broadcastVoice(clients, peer, oldRoom, 'leave', peer.username)
        peer.room = null
}

/**
 * @param {Set} clients
 * @param {Object} peer
 * @param {String} room
 * @param {String} command
 * @param {String} username
 */
function broadcastVoice(clients, peer, room, command, username) {
    for(const other of clients) {
        if(other === peer || other.room !== room)
            continue

            if(!other.socket.destroyed)
                other.socket.write(encodeVoice(command, username))
    }
}

/**
 * @param {import('./core')} core
 * @param {Number} port
 */
const VoiceServer = function(core, port) {
    const clients = new Set()

    const server = net.createServer(socket => {
        const rawip = socket.remoteAddress
        const ip = core.computeIP(rawip)

        if(core.checkIPBan(ip)) {
            socket.destroy()
            console.warn(`Attempted IP-Ban voice connection from ${ip} (${rawip})`)
            return
        }

        console.log(`Voice connection from ${ip} (${rawip})`)

        const client = core.connect(ip, () => {}, () => {
            socket.destroy()
        })

        let peer = null
        let buffer = ''

        const authTimeout = setTimeout(() => {
            if(!peer)
                socket.destroy()
        }, 10000)

        socket.on('data', data => {
            try {
                buffer += data.toString('utf-8')

                if(buffer.length > 65536) {
                    socket.destroy()
                    return
                }

                let newline

                while((newline = buffer.indexOf('\n')) !== -1) {
                    const msg = buffer.slice(0, newline)
                    buffer = buffer.slice(newline + 1)

                    if(!msg)
                        continue

                        const [command, ...args] = msg.split('|').map(v => decodeURIComponent(v).trim())

                        switch(command.toLocaleLowerCase()) {
                            case 'login': {
                                if(peer || args.length < 2) {
                                    socket.destroy()
                                    return
                                }

                                const [username, password] = args
                                const error = client.login(username, password)

                                if(error) {
                                    socket.write(encodeVoice('error', error[0]))
                                    socket.end()
                                    return
                                }

                                peer = {
                                    socket,
                                    username: client.user.login,
                                    room: null
                                }

                                clients.add(peer)
                                clearTimeout(authTimeout)

                                socket.write(encodeVoice('ready', peer.username))

                                console.log(`Voice login from ${peer.username}`)
                            } break

                            case 'voice': {
                                if(!peer) {
                                    socket.destroy()
                                    return
                                }

                                const [action, ...voiceArgs] = args
                                const result = parseVoiceCommand(
                                    client,
                                    peer,
                                    clients,
                                    action,
                                    voiceArgs
                                )

                                if(result) {
                                    if(result[0] === 'disconnect') {
                                        socket.destroy()
                                        return
                                    }

                                    socket.write(encodeVoice(...result))
                                }
                            } break

                            default:
                                socket.write(encodeVoice('error', 'command_unknown'))
                                break
                        }
                }
            } catch(e) {
                console.error(e)
                socket.write(encodeVoice('error', 'unknown_internal'))
            }
        })

        socket.on('close', () => {
            clearTimeout(authTimeout)

            if(peer) {
                leaveVoiceRoom(peer, clients)
                clients.delete(peer)

                console.log(`Voice: ${peer.username} disconnected`)
            }

            client.disconnect()
        })

        socket.on('error', e => {
            console.error(e, `Voice error on ${ip} (${rawip})`)
            client.disconnect()
            socket.destroy()
        })
    })

    server.listen(port, () => console.log('Voice TCP server on port', port))
}

module.exports = VoiceServer
module.exports.parseVoiceCommand = parseVoiceCommand
module.exports.encodeVoice = encodeVoice
