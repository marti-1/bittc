const EventEmitter = require('events').EventEmitter;
const net = require('net');

const Message = require('./message');


// Peer states
const HANDSHAKE = 0;
const CHOKED = 1;

class PeerNode extends EventEmitter {

    constructor (master, torrent, opts) {
        super();

        this.master = master;
        this.torrent = torrent;

        this.ip = opts.ip;
        this.port = opts.port;

        // buffer for arrived chunks of messages
        this.buffer = [];
        // list of messages from peer
        this.inbox = [];

        this.state = new Set([HANDSHAKE, CHOKED]);



        this.conn = net.createConnection(this.port, this.ip, () => {
            console.log('connected');

            const handshake = Message.handshake(
                this.torrent.infoHash,
                this.master.peerId);

            this.conn.write(handshake.asBytes, () => {
                console.log('send handshake');
            });
        });

        this.conn.on('error', (e) => {
            console.log(`peer has failed: ${this.ip}:${this.port}`);
        });

        this.conn.on('data', (chunk) => {

            this.buffer.push(chunk);

            const buffer = Buffer.concat(this.buffer);

            var message, restOfBuffer;
            if (this.state.has(HANDSHAKE)) {
                [message, restOfBuffer] = Message.parseHandshake(buffer);
                this.state.delete(HANDSHAKE);
            } else {
                [message, restOfBuffer] = Message.parse(buffer);
            }

            if (message) {
                this.inbox.push(message);
                this.buffer = [restOfBuffer];
            }

        });


        this.react();
    }

    react() {
        this.handleIncomingMessages();
        this.inbox = [];

        setImmediate(() => {this.react()});
    }


    handleIncomingMessages() {
        if (this.inbox.length == 0) {
            return;
        }

        for (let msg of this.inbox) {
            console.log(`received ${msg.constructor.name}`);
            switch (msg.constructor) {
                case Message.Unchoke:
                    this.state.delete(CHOKED);
                    this.conn.write(Message.request(0, 0, 3332).asBytes, () => {
                        console.log('sent REQUEST');
                    });
                    break;
                case Message.Bitfield:
                    this.conn.write(Message.interested().asBytes, () => {
                        console.log('sent INTERESTED');
                    });
                    break;
                case Message.Piece:
                    this.master.emit('piece', msg.payload);
                    break;
                default:
                    console.log('unknown message');

            }
        }


    }
}

module.exports = PeerNode;
