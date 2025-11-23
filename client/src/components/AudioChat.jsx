import React, { useEffect, useState, useRef, useContext } from 'react';
import Peer from 'simple-peer';
import { SocketContext } from '../context/SocketContext';
import { Mic, MicOff } from 'lucide-react';

const AudioChat = ({ roomId }) => {
    const { socket, stream, me } = useContext(SocketContext);
    const [peers, setPeers] = useState([]);
    const peersRef = useRef([]);

    useEffect(() => {
        if (!socket || !stream) return;

        socket.on('user_joined', (userId) => {
            console.log('User joined:', userId);
            const peer = createPeer(userId, socket.id, stream);
            peersRef.current.push({
                peerID: userId,
                peer,
            });
            setPeers(users => [...users, { peerID: userId, peer }]);
        });

        socket.on('user_left', (userId) => {
            console.log('User left:', userId);
            const peerObj = peersRef.current.find(p => p.peerID === userId);
            if (peerObj) {
                peerObj.peer.destroy();
            }
            const peers = peersRef.current.filter(p => p.peerID !== userId);
            peersRef.current = peers;
            setPeers(peers);
        });

        socket.on('signal', (data) => {
            console.log('Received signal from:', data.from);
            const item = peersRef.current.find(p => p.peerID === data.from);
            if (item) {
                item.peer.signal(data.signal);
            } else {
                const peer = addPeer(data.signal, data.from, stream);
                peersRef.current.push({
                    peerID: data.from,
                    peer
                });
                setPeers(users => [...users, { peerID: data.from, peer }]);
            }
        });

        return () => {
            socket.off('user_joined');
            socket.off('user_left');
            socket.off('signal');
        };
    }, [socket, stream]);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket.emit('signal', { to: userToSignal, signal, from: callerID });
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket.emit('signal', { to: callerID, signal, from: socket.id });
        });

        peer.signal(incomingSignal);

        return peer;
    }

    const [isMuted, setIsMuted] = useState(false);

    const toggleMute = () => {
        if (stream && stream.getAudioTracks().length > 0) {
            const audioTrack = stream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    };

    return (
        <div className="audio-chat">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Audio Chat ({peers.length} peers)</h3>
                <button
                    onClick={toggleMute}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: 'var(--spacing-sm) var(--spacing-md)'
                    }}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
            </div>
            {peers.map((peer, index) => {
                return (
                    <Audio key={index} peer={peer.peer} />
                );
            })}
        </div>
    );
};

const Audio = ({ peer }) => {
    const ref = useRef();

    useEffect(() => {
        peer.on('stream', stream => {
            ref.current.srcObject = stream;
        });
    }, [peer]);

    return (
        <audio playsInline autoPlay ref={ref} />
    );
};

export default AudioChat;
