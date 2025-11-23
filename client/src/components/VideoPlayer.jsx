import React, { useEffect, useRef, useState, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { Link } from 'lucide-react';

const VideoPlayer = ({ roomId, isHost, videoSrc, setVideoSrc }) => {
    const { socket } = useContext(SocketContext);
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const isRemoteUpdate = useRef(false);

    const [notification, setNotification] = useState('');
    const [mismatchWarning, setMismatchWarning] = useState(false);
    const [remoteFingerprint, setRemoteFingerprint] = useState(null);
    const [localFingerprint, setLocalFingerprint] = useState(null);

    const generateFingerprint = async (file) => {
        const chunkSize = 2048;
        const startChunk = file.slice(0, chunkSize);
        const endChunk = file.slice(Math.max(0, file.size - chunkSize), file.size);

        const startBuffer = await startChunk.arrayBuffer();
        const endBuffer = await endChunk.arrayBuffer();

        const startView = new Uint8Array(startBuffer);
        const endView = new Uint8Array(endBuffer);

        let sum = 0;
        startView.forEach(b => sum += b);
        endView.forEach(b => sum += b);

        return `${file.size}-${startView[0]}-${endView[endView.length - 1]}-${sum}`;
    };

    const checkMismatch = (remoteDuration) => {
        if (localFingerprint && remoteFingerprint && localFingerprint !== remoteFingerprint) {
            setMismatchWarning(true);
            return;
        }

        if (!videoRef.current) return;
        const localDuration = videoRef.current.duration;
        if (Math.abs(localDuration - remoteDuration) > 1) {
            setMismatchWarning(true);
        } else {
            setMismatchWarning(false);
        }
    };

    useEffect(() => {
        if (!socket) return;

        socket.on('receive_file_loaded', (data) => {
            setNotification(`${data.fileName} loaded by another user`);
            setRemoteFingerprint(data.fingerprint);
            if (localFingerprint) {
                if (localFingerprint !== data.fingerprint) {
                    setMismatchWarning(true);
                } else {
                    setMismatchWarning(false);
                }
            }
            setTimeout(() => setNotification(''), 3000);
        });

        socket.on('receive_url_change', (data) => {
            setVideoSrc(data.url);
            setMismatchWarning(false);
            setLocalFingerprint(null);
        });

        socket.on('receive_play', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                videoRef.current.currentTime = data.time;
                videoRef.current.play();
                setIsPlaying(true);
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                setNotification(`▶️ ${userId} played the video`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 500);
            }
        });

        socket.on('receive_pause', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                videoRef.current.currentTime = data.time;
                videoRef.current.pause();
                setIsPlaying(false);
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                setNotification(`⏸️ ${userId} paused the video`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 500);
            }
        });

        socket.on('receive_seek', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                videoRef.current.currentTime = data.time;
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                const minutes = Math.floor(data.time / 60);
                const seconds = Math.floor(data.time % 60);
                setNotification(`⏩ ${userId} seeked to ${minutes}:${seconds.toString().padStart(2, '0')}`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 500);
            }
        });

        return () => {
            socket.off('receive_file_loaded');
            socket.off('receive_url_change');
            socket.off('receive_play');
            socket.off('receive_pause');
            socket.off('receive_seek');
        };
    }, [socket, localFingerprint, remoteFingerprint]);

    const handlePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const handlePlay = () => {
        if (isRemoteUpdate.current) return;
        setIsPlaying(true);
        if (socket) {
            socket.emit('play_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handlePause = () => {
        if (isRemoteUpdate.current) return;
        setIsPlaying(false);
        if (socket) {
            socket.emit('pause_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleSeeked = () => {
        if (isRemoteUpdate.current) return;
        if (socket) {
            socket.emit('seek_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleUrlChange = (e) => {
        const url = e.target.value;
        setVideoSrc(url);
        setMismatchWarning(false);
        setLocalFingerprint(null);
        if (socket) {
            socket.emit('video_url_change', { room: roomId, url });
        }
    };

    return (
        <div className="video-player-container">
            {notification && (
                <div className="notification notification-info">
                    {notification}
                </div>
            )}
            {mismatchWarning && (
                <div className="notification notification-warning">
                    ⚠️ Warning: Video duration mismatch! You might be watching a different video than the host.
                </div>
            )}

            {/* Video URL Input */}
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    placeholder="Paste video URL"
                    value={videoSrc}
                    onChange={handleUrlChange}
                    style={{ paddingLeft: '2.5rem' }}
                />
                <Link size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            </div>

            {/* Video Player */}
            {videoSrc && (
                <div className="video-wrapper">
                    {videoSrc.includes('drive.google.com') ? (
                        <iframe
                            src={videoSrc}
                            allow="autoplay"
                            title="Google Drive Video"
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            controls
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onSeeked={handleSeeked}
                        >
                            <source src={videoSrc} type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                    )}
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
