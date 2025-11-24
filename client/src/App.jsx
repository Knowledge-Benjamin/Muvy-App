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
        // Emit URL change to sync with other users in the room
        if (socket && roomId) {
            socket.emit('video_url_change', { room: roomId, url: link });
        }
    };

    return (
        <div className="App">
            {/* DEBUG OVERLAY - REMOVE BEFORE FINAL PRODUCTION */}
            <div style={{
                position: 'fixed',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0,0,0,0.8)',
                color: '#0f0',
                padding: '10px',
                zIndex: 9999,
                fontSize: '10px',
                pointerEvents: 'none',
                maxWidth: '300px',
                wordWrap: 'break-word'
            }}>
                <p><strong>Origin:</strong> {window.location.origin}</p>
                <p><strong>Server:</strong> {import.meta.env.VITE_SERVER_URL}</p>
                <p><strong>Socket:</strong> {socket ? (socket.connected ? '✅ Connected' : '❌ Disconnected') : '⚠️ Null'}</p>
                <p><strong>Socket ID:</strong> {socket?.id || 'None'}</p>
            </div>

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
                                        <Monitor size={16} /> Local File (Your Device Only)
                                    </label>
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const localUrl = URL.createObjectURL(file);
                                                setVideoSrc(localUrl);
                                                alert('⚠️ Local files only work on YOUR device.\n\nTo watch together with others, please upload to Dropbox or Google Drive instead.');
                                            }
                                        }}
                                    />
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                                        Note: Local files won't sync to other users. Use Dropbox/Google Drive for sharing.
                                    </p>
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
