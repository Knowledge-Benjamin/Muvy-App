import React, { useEffect, useState, useRef, useContext } from 'react';
import Peer from 'simple-peer';
import { SocketContext } from '../context/SocketContext';

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
        if (stream) {
            stream.getAudioTracks()[0].enabled = !stream.getAudioTracks()[0].enabled;
            setIsMuted(!stream.getAudioTracks()[0].enabled);
        }
    };

    return (
        <div className="audio-chat">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Audio Chat ({peers.length} peers)</h3>
                <button onClick={toggleMute}>
                    {isMuted ? "Unmute Mic" : "Mute Mic"}
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
