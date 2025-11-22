import React, { useState, useContext } from 'react';
import { SocketContext } from './context/SocketContext';
import VideoPlayer from './components/VideoPlayer';
import AudioChat from './components/AudioChat';
import './App.css';

function App() {
    const { socket } = useContext(SocketContext);
    const [roomId, setRoomId] = useState('');
    const [joined, setJoined] = useState(false);
    const [hostId, setHostId] = useState('');
    const [userCount, setUserCount] = useState(0);

    const handleJoin = () => {
        if (roomId.trim() && socket) {
            socket.emit('join_room', roomId);
            setJoined(true);
        }
    };

    React.useEffect(() => {
        if (!socket) return;

        socket.on('room_metadata', (data) => {
            setHostId(data.hostId);
            setUserCount(data.userCount);
        });

        return () => {
            socket.off('room_metadata');
        };
    }, [socket]);

    const isHost = socket && socket.id === hostId;

    return (
        <div className="App">
            <h1>Muvy - Watch Together</h1>
            {!joined ? (
                <div className="join-screen">
                    <input
                        type="text"
                        placeholder="Enter Room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                    />
                    <button onClick={handleJoin}>Join Room</button>
                </div>
            ) : (
                <div className="room-screen">
                    <div className="room-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '10px', background: '#333', borderRadius: '8px' }}>
                        <h2>Room: {roomId}</h2>
                        <div className="room-info">
                            <span style={{ marginRight: '15px' }}>👥 Users: {userCount}</span>
                            <span style={{
                                padding: '5px 10px',
                                borderRadius: '4px',
                                background: isHost ? '#4caf50' : '#2196f3',
                                color: 'white',
                                fontWeight: 'bold'
                            }}>
                                {isHost ? '👑 You are Host' : '👤 Viewer'}
                            </span>
                        </div>
                    </div>
                    <div className="content">
                        <VideoPlayer roomId={roomId} isHost={isHost} />
                        <AudioChat roomId={roomId} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
