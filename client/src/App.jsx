import React, { useState, useContext } from 'react';
import { SocketContext } from './context/SocketContext';
import VideoPlayer from './components/VideoPlayer';
import AudioChat from './components/AudioChat';
import GoogleDriveUpload from './components/GoogleDriveUpload';
import DropboxUpload from './components/DropboxUpload';
import { Home, Users, Crown, User, Upload, ChevronDown, Monitor } from 'lucide-react';
import './App.css';

function App() {
    const { socket } = useContext(SocketContext);
    const [roomId, setRoomId] = useState('');
    const [joined, setJoined] = useState(false);
    const [hostId, setHostId] = useState('');
    const [userCount, setUserCount] = useState(0);
    const [showUploadPanel, setShowUploadPanel] = useState(false);
    const [videoSrc, setVideoSrc] = useState('');

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

    const handleLinkGenerated = (link) => {
        setVideoSrc(link);
        setShowUploadPanel(false);
    };

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
                    {/* Top Panel */}
                    <div className="top-panel">
                        <div className="top-panel-left">
                            <h1>Muvy</h1>
                        </div>
                        <div className="top-panel-center">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Home size={14} /> {roomId}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Users size={14} /> {userCount}
                            </span>
                            <span className="host-badge">
                                {isHost ? <><Crown size={14} /> Host</> : <><User size={14} /> Viewer</>}
                            </span>
                        </div>
                        <button
                            className="upload-toggle-btn"
                            onClick={() => setShowUploadPanel(!showUploadPanel)}
                        >
                            <Upload size={16} />
                            <span>Upload</span>
                            <ChevronDown size={16} style={{ transform: showUploadPanel ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
                        </button>
                    </div>

                    {/* Upload Panel (Collapsible) */}
                    {showUploadPanel && (
                        <div className="upload-panel">
                            <div className="upload-options">
                                <div className="upload-section">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Monitor size={16} /> Local File
                                    </label>
                                    <input type="file" accept="video/*" />
                                </div>
                                <GoogleDriveUpload onLinkGenerated={handleLinkGenerated} />
                                <DropboxUpload onLinkGenerated={handleLinkGenerated} />
                            </div>
                        </div>
                    )}

                    {/* Main Content */}
                    <div className="main-content">
                        <div className="video-section">
                            <VideoPlayer roomId={roomId} isHost={isHost} videoSrc={videoSrc} setVideoSrc={setVideoSrc} />
                        </div>
                        <div className="audio-sidebar">
                            <AudioChat roomId={roomId} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
