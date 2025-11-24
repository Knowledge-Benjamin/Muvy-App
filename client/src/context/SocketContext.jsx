import React, { createContext, useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

const SocketProvider = ({ children }) => {
    const [stream, setStream] = useState(null);
    const [me, setMe] = useState('');
    const socket = useRef();
    const connectionRef = useRef();

    useEffect(() => {
        // Connect to server - uses env var in production, localhost in dev
        const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        socket.current = io(SOCKET_URL, {
            transports: ['websocket', 'polling'], // Try websocket first
            withCredentials: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socket.current.on('connect', () => {
            setMe(socket.current.id);
        });

        // Get user media
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then((currentStream) => {
                setStream(currentStream);
            })
            .catch(err => console.error('Error accessing media devices:', err));

        return () => {
            if (socket.current) socket.current.disconnect();
        }
    }, []);

    return (
        <SocketContext.Provider value={{ socket: socket.current, me, stream }}>
            {children}
        </SocketContext.Provider>
    );
};

export { SocketContext, SocketProvider };
