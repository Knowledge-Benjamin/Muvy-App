import React, { useState, useContext, useEffect } from 'react';
import { SocketContext } from './context/SocketContext';
import VideoPlayer from './components/VideoPlayer';
import AudioChat from './components/AudioChat';
import GoogleDriveUpload from './components/GoogleDriveUpload';
import DropboxUpload from './components/DropboxUpload';
import { Home, Users, Crown, User, Upload, ChevronDown, Monitor, Share2 } from 'lucide-react';
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
            // Save room ID to session storage for Dropbox redirect flow
            sessionStorage.setItem('muvy_room_id', roomId);
        }
    };

    useEffect(() => {
        if (!socket) return;

        socket.on('room_metadata', (data) => {
            setHostId(data.hostId);
            setUserCount(data.userCount);
        });

        // Listen for initial state sync (Late Joiner Fix)
        socket.on('sync_state', (state) => {
            console.log('Received sync state:', state);
            if (state.videoSrc) {
                setVideoSrc(state.videoSrc);
            }
        });

        // Listen for video URL changes from other users
        socket.on('receive_url_change', (data) => {
            console.log('Received new video URL:', data.url);
            setVideoSrc(data.url);
        });

        return () => {
            socket.off('room_metadata');
            socket.off('sync_state');
            socket.off('receive_url_change');
        };
    }, [socket]);

    // Auto-join if returning from Dropbox auth
    useEffect(() => {
        const hash = window.location.hash;
        const savedRoomId = sessionStorage.getItem('muvy_room_id');
        const isAuthRedirect = hash.includes('access_token') || hash.includes('error=');

        // If we are in an auth redirect flow, we MUST NOT clear the session ID
        // just because the socket isn't ready yet.
        if (isAuthRedirect) {
            if (savedRoomId && socket) {
                console.log('Returning from Dropbox Auth, auto-joining room:', savedRoomId);
                setRoomId(savedRoomId);
                setJoined(true);
                socket.emit('join_room', savedRoomId);
            }
            // If socket is missing, do nothing. Wait for it.
        } else {
            // Only clear if we are definitely NOT returning from auth
            // This ensures a normal refresh logs you out of the room
            sessionStorage.removeItem('muvy_room_id');
        }
    }, [socket]); // Depend on socket to ensure it's ready

    // Auto-join from URL param (Share Link)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam && socket) {
            console.log('Auto-joining from URL param:', roomParam);
            setRoomId(roomParam);
            socket.emit('join_room', roomParam);
            setJoined(true);
            sessionStorage.setItem('muvy_room_id', roomParam);
            // Clean URL without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [socket]);

    // Check for auto-open upload panel flag (from Dropbox redirect)
    useEffect(() => {
        if (sessionStorage.getItem('muvy_auto_open_upload')) {
            setShowUploadPanel(true);
            sessionStorage.removeItem('muvy_auto_open_upload');
        }
    }, []);

    const isHost = socket && socket.id === hostId;

    const handleLinkGenerated = (link) => {
        setVideoSrc(link);
        setShowUploadPanel(false);
        // Emit URL change to sync with other users in the room
        if (socket && roomId) {
            socket.emit('video_url_change', { room: roomId, url: link });
        }
    };

    const generateRoomId = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const handleCreateRoom = () => {
        if (!socket) return;
        const newRoomId = generateRoomId();
        setRoomId(newRoomId);
        socket.emit('join_room', newRoomId);
        setJoined(true);
        sessionStorage.setItem('muvy_room_id', newRoomId);
    };

    const handleCopyLink = () => {
        const link = `${window.location.origin}/?room=${roomId}`;
        navigator.clipboard.writeText(link).then(() => {
            alert('Link copied to clipboard!');
        });
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%' }}>
                        <button
                            onClick={handleCreateRoom}
                            style={{
                                background: 'var(--gray-800)',
                                color: 'var(--white)',
                                border: '1px solid var(--gray-600)',
                                padding: '1rem 2rem',
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                width: '100%',
                                cursor: 'pointer',
                                borderRadius: 'var(--radius-md)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            ✨ Create New Room
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--gray-300)' }}></div>
                            <span style={{ color: 'var(--gray-400)', fontSize: '0.9rem' }}>OR</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--gray-300)' }}></div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <input
                                type="text"
                                placeholder="Enter Room ID"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                style={{ flex: 1, marginBottom: 0 }}
                            />
                            <button onClick={handleJoin} style={{ whiteSpace: 'nowrap', width: 'auto' }}>Join</button>
                        </div>
                    </div>
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
                            <button
                                onClick={handleCopyLink}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--white)',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Copy Invite Link"
                            >
                                <Share2 size={14} />
                            </button>
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

                    {/* Upload Panel (Collapsible - Persisted) */}
                    <div className="upload-panel" style={{ display: showUploadPanel ? 'block' : 'none' }}>
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
