import React, { useEffect, useRef, useState, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { Link } from 'lucide-react';

const VideoPlayer = ({ roomId, isHost, videoSrc, setVideoSrc }) => {
    const { socket } = useContext(SocketContext);
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const isRemoteUpdate = useRef(false);
    const pendingSync = useRef(null);
    const lastRemoteTime = useRef(0);

    const [notification, setNotification] = useState('');
    const [mismatchWarning, setMismatchWarning] = useState(false);

    // Multi-part video state
    const [playlist, setPlaylist] = useState(null);
    const [currentPartIndex, setCurrentPartIndex] = useState(0);
    const [partDurations, setPartDurations] = useState([]);
    const [totalDuration, setTotalDuration] = useState(0);

    const checkMismatch = (remoteDuration) => {
        if (!videoRef.current) return;
        const localDuration = videoRef.current.duration;
        if (Math.abs(localDuration - remoteDuration) > 1) {
            setMismatchWarning(true);
        } else {
            setMismatchWarning(false);
        }
    };

    // Force reload video when source changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [videoSrc]);

    // Apply pending sync when video metadata loads
    const handleLoadedMetadata = () => {
        if (pendingSync.current && videoRef.current) {
            const state = pendingSync.current;
            console.log('Applying pending sync state:', state);

            // Prevent emitting events back to server
            isRemoteUpdate.current = true;
            lastRemoteTime.current = state.videoTime || 0;

            if (state.videoTime) {
                videoRef.current.currentTime = state.videoTime;
            }

            if (state.isPlaying) {
                videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                setIsPlaying(true);
            }

            pendingSync.current = null;

            // Reset flag after a delay to ensure events are suppressed
            setTimeout(() => {
                isRemoteUpdate.current = false;
            }, 2000);
        }
    };

    useEffect(() => {
        if (!socket) return;

        // Initial state sync for playback (Late Joiner Fix)
        socket.on('sync_state', (state) => {
            console.log('Received sync state in player:', state);

            if (videoRef.current) {
                // Video element exists, apply immediately
                isRemoteUpdate.current = true;
                lastRemoteTime.current = state.videoTime || 0;

                if (state.videoTime) {
                    videoRef.current.currentTime = state.videoTime;
                }

                if (state.isPlaying) {
                    videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                    setIsPlaying(true);
                } else {
                    videoRef.current.pause();
                    setIsPlaying(false);
                }

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 2000);
            } else {
                // Video element not ready (e.g. just joined), store for later
                console.log('Video not ready, storing pending sync');
                pendingSync.current = state;
            }
        });

        socket.on('receive_play', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

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
                }, 2000);
            }
        });

        socket.on('receive_pause', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

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
                }, 2000);
            }
        });

        socket.on('receive_seek', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

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
                }, 2000);
            }
        });

        return () => {
            socket.off('sync_state');
            socket.off('receive_play');
            socket.off('receive_pause');
            socket.off('receive_seek');
        };
    }, [socket]);

    const handlePlay = (e) => {
        // Ignore script-triggered events (like from socket sync)
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
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

    const handlePause = (e) => {
        // Ignore script-triggered events
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
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

    const handleSeeked = (e) => {
        // Ignore script-triggered events
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
        if (isRemoteUpdate.current) return;

        // Anti-Loop: If seek time is very close to last remote update, ignore it
        if (videoRef.current && Math.abs(videoRef.current.currentTime - lastRemoteTime.current) < 1.5) {
            console.log('Ignoring seek loop echo');
            return;
        }

        if (socket) {
            socket.emit('seek_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    // Multi-part video helper functions
    const isMultiPart = () => playlist && playlist.length > 1;

    const getAccumulatedDuration = (upToPartIndex) => {
        if (!partDurations.length) return 0;
        return partDurations.slice(0, upToPartIndex).reduce((sum, dur) => sum + dur, 0);
    };

    const getCurrentGlobalTime = () => {
        if (!videoRef.current) return 0;
        if (!isMultiPart()) return videoRef.current.currentTime;

        const accumulated = getAccumulatedDuration(currentPartIndex);
        return accumulated + videoRef.current.currentTime;
    };

    const seekToGlobalTime = (globalTime) => {
        if (!isMultiPart()) {
            if (videoRef.current) {
                videoRef.current.currentTime = globalTime;
            }
            return;
        }

        let accumulatedTime = 0;
        let targetPartIndex = 0;
        let timeInPart = globalTime;

        // Calculate which part contains this global time
        for (let i = 0; i < partDurations.length; i++) {
            const partDuration = partDurations[i];

            if (globalTime < accumulatedTime + partDuration) {
                targetPartIndex = i;
                timeInPart = globalTime - accumulatedTime;
                break;
            }

            accumulatedTime += partDuration;
        }

        // Load correct part if different
        if (targetPartIndex !== currentPartIndex) {
            setCurrentPartIndex(targetPartIndex);
            setVideoSrc(playlist[targetPartIndex].url);

            // After video loads, seek to specific time
            const handleSeek = () => {
                if (videoRef.current) {
                    videoRef.current.currentTime = timeInPart;
                }
                videoRef.current?.removeEventListener('loadedmetadata', handleSeek);
            };
            videoRef.current?.addEventListener('loadedmetadata', handleSeek);
        } else {
            // Same part, just seek
            if (videoRef.current) {
                videoRef.current.currentTime = timeInPart;
            }
        }
    };

    const handleVideoEnded = () => {
        if (isMultiPart() && currentPartIndex < playlist.length - 1) {
            // Load next part
            const nextIndex = currentPartIndex + 1;
            setCurrentPartIndex(nextIndex);
            setVideoSrc(playlist[nextIndex].url);

            // Notify other viewers
            if (socket) {
                socket.emit('load_next_part', {
                    room: roomId,
                    partIndex: nextIndex
                });
            }
        } else {
            // Last part ended or single video
            setIsPlaying(false);
        }
    };

    const convertToDirectLink = (url) => {
        // Handle Dropbox sharing links
        if (url.includes('dropbox.com')) {
            // New format: dropbox.com/scl/fi/... (requires raw=1 parameter)
            if (url.includes('/scl/fi/') || url.includes('/scl/fo/')) {
                // Remove dl=0 and add raw=1 for direct access
                let directUrl = url
                    .replace('?dl=0', '?raw=1')
                    .replace('&dl=0', '&raw=1')
                    .replace('?dl=1', '?raw=1')
                    .replace('&dl=1', '&raw=1');

                // If no query params exist yet, add raw=1
                if (!directUrl.includes('?')) {
                    directUrl += '?raw=1';
                } else if (!directUrl.includes('raw=1')) {
                    directUrl += '&raw=1';
                }

                return directUrl;
            }

            // Old format: dropbox.com/s/... (convert to dl.dropboxusercontent.com)
            if (url.includes('/s/')) {
                return url
                    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
                    .replace('?dl=0', '')
                    .replace('?dl=1', '')
                    .replace('&dl=0', '')
                    .replace('&dl=1', '');
            }
        }

        return url;
    };

    const handleUrlChange = (e) => {
        let url = e.target.value.trim();

        // Auto-convert Dropbox sharing links
        url = convertToDirectLink(url);

        setVideoSrc(url);
        setPlaylist(null); // Clear playlist when manual URL is entered
        setMismatchWarning(false);
        if (socket) {
            socket.emit('video_url_change', { room: roomId, url });
        }
    };

    // Handle playlist from multi-part upload (called from App.jsx)
    const handleSetPlaylist = (playlistData) => {
        if (!playlistData || playlistData.length === 0) return;

        setPlaylist(playlistData);
        setCurrentPartIndex(0);
        setVideoSrc(playlistData[0].url);
        setPartDurations([]);
        setMismatchWarning(false);

        // Notify other viewers
        if (socket) {
            socket.emit('set_playlist', { room: roomId, playlist: playlistData });
        }
    };

    // Register handleSetPlaylist globally for App.jsx access
    useEffect(() => {
        if (!window.videoPlayerRef) {
            window.videoPlayerRef = {};
        }
        window.videoPlayerRef.handleSetPlaylist = handleSetPlaylist;

        return () => {
            if (window.videoPlayerRef) {
                delete window.videoPlayerRef.handleSetPlaylist;
            }
        };
    }, [playlist, roomId, socket]); // Re-register when dependencies change

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
                            onLoadedMetadata={() => {
                                handleLoadedMetadata();

                                // Track part duration for multi-part videos
                                if (isMultiPart() && videoRef.current) {
                                    const newDurations = [...partDurations];
                                    newDurations[currentPartIndex] = videoRef.current.duration;
                                    setPartDurations(newDurations);

                                    // Calculate total duration
                                    const total = newDurations.reduce((sum, dur) => sum + (dur || 0), 0);
                                    setTotalDuration(total);
                                }
                            }}
                            onEnded={handleVideoEnded}
                            onError={(e) => {
                                console.error('Video Error:', e);
                                setNotification('❌ Error loading video. Please check the URL or try a different file.');
                            }}
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
