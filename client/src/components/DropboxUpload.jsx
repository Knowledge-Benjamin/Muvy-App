import React, { useState, useEffect, useRef } from 'react';
import { Lock, Folder, Upload, Check, X, RotateCw, Sparkles } from 'lucide-react';

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;

const DropboxUpload = ({ onLinkGenerated }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const xhrRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
        script.id = 'dropboxjs';
        script.setAttribute('data-app-key', DROPBOX_APP_KEY);
        document.body.appendChild(script);

        const savedToken = localStorage.getItem('dropbox_access_token');
        if (savedToken) {
            setAccessToken(savedToken);
            setIsAuthenticated(true);
        }

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    const handleAuth = () => {
        const redirectUri = window.location.origin;
        const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=token&redirect_uri=${redirectUri}`;

        const width = 600;
        const height = 700;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);

        const popup = window.open(authUrl, 'Dropbox Auth', `width=${width},height=${height},left=${left},top=${top}`);

        const checkPopup = setInterval(() => {
            try {
                if (popup.closed) {
                    clearInterval(checkPopup);
                    return;
                }

                const popupUrl = popup.location.href;
                if (popupUrl.includes('access_token=')) {
                    const token = popupUrl.split('access_token=')[1].split('&')[0];
                    setAccessToken(token);
                    setIsAuthenticated(true);
                    localStorage.setItem('dropbox_access_token', token);
                    popup.close();
                    clearInterval(checkPopup);
                }
            } catch (e) {
                // Cross-origin error, ignore
            }
        }, 500);
    };

    const handleSignOut = () => {
        setAccessToken(null);
        setIsAuthenticated(false);
        localStorage.removeItem('dropbox_access_token');
    };

    const openChooser = () => {
        if (!window.Dropbox) {
            alert('Dropbox is still loading, please wait...');
            return;
        }

        const options = {
            success: async (files) => {
                const file = files[0];
                let link = file.link;
                link = link.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                link = link.split('?')[0];

                if (onLinkGenerated) {
                    onLinkGenerated(link);
                }
            },
            cancel: () => {
                console.log('User canceled');
            },
            linkType: 'direct',
            multiselect: false,
            extensions: ['.mp4', '.webm', '.mkv', '.avi', '.mov'],
        };

        window.Dropbox.choose(options);
    };

    const cancelUpload = () => {
        if (xhrRef.current) {
            xhrRef.current.abort();
            setIsUploading(false);
            setUploadProgress(0);
            setUploadError(null);
            setCurrentFile(null);
        }
    };

    const retryUpload = () => {
        if (currentFile) {
            setUploadError(null);
            uploadToDropbox(currentFile);
        }
    };

    const uploadToDropbox = async (file) => {
        if (!accessToken) {
            alert('Please sign in to Dropbox first');
            return;
        }

        setCurrentFile(file);
        setIsUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        try {
            const xhr = new XMLHttpRequest();
            xhrRef.current = xhr;

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 90);
                    setUploadProgress(percentComplete);
                }
            });

            xhr.addEventListener('load', async () => {
                if (xhr.status === 200) {
                    setUploadProgress(95);
                    const data = JSON.parse(xhr.responseText);

                    try {
                        // First, try to list existing shared links
                        const listResponse = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                path: data.path_display,
                                direct_only: true
                            }),
                        });

                        let directLink;

                        if (listResponse.ok) {
                            const listData = await listResponse.json();

                            // If link already exists, use it
                            if (listData.links && listData.links.length > 0) {
                                directLink = listData.links[0].url;
                            } else {
                                // No existing link, create a new one
                                const createResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        path: data.path_display,
                                        settings: { requested_visibility: 'public' },
                                    }),
                                });

                                if (!createResponse.ok) {
                                    const errorData = await createResponse.json();

                                    // If link already exists (race condition), list again
                                    if (errorData.error && errorData.error['.tag'] === 'shared_link_already_exists') {
                                        const retryList = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bearer ${accessToken}`,
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                path: data.path_display,
                                                direct_only: true
                                            }),
                                        });

                                        if (retryList.ok) {
                                            const retryData = await retryList.json();
                                            if (retryData.links && retryData.links.length > 0) {
                                                directLink = retryData.links[0].url;
                                            }
                                        }
                                    }

                                    if (!directLink) {
                                        throw new Error('Failed to create or retrieve share link');
                                    }
                                } else {
                                    const createData = await createResponse.json();
                                    directLink = createData.url;
                                }
                            }
                        } else {
                            throw new Error('Failed to list shared links');
                        }

                        // Convert to direct download link
                        directLink = directLink.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                        directLink = directLink.replace('?dl=0', '');

                        setUploadProgress(100);
                        setIsUploading(false);
                        setCurrentFile(null);

                        if (onLinkGenerated) {
                            onLinkGenerated(directLink);
                        }
                    } catch (error) {
                        console.error('Share link error:', error);
                        setIsUploading(false);
                        setUploadError('Failed to create share link. Please try again.');
                    }
                } else {
                    // Parse error response from Dropbox
                    let errorMessage = 'Upload failed. ';

                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.error_summary) {
                            const summary = errorData.error_summary;

                            if (summary.includes('required scope')) {
                                errorMessage = 'Missing permissions. Enable "files.content.write" in Dropbox App Console → Permissions, then sign out and sign in again.';
                            } else if (summary.includes('user limit')) {
                                errorMessage = 'App has reached user limit. Use "Browse Public Dropbox Files" instead.';
                            } else {
                                errorMessage += summary;
                            }
                        } else {
                            errorMessage += `Status ${xhr.status}. Please try again.`;
                        }
                    } catch (e) {
                        // If can't parse error, show generic message
                        if (xhr.status === 400) {
                            errorMessage += 'Bad request. Check app permissions.';
                        } else if (xhr.status === 401) {
                            errorMessage += 'Authentication failed. Please sign in again.';
                        } else {
                            errorMessage += `Status ${xhr.status}. Please try again.`;
                        }
                    }

                    console.error('Upload failed:', xhr.status, xhr.responseText);
                    setIsUploading(false);
                    setUploadError(errorMessage);
                }
            });

            xhr.addEventListener('error', () => {
                console.error('Upload network error');
                setIsUploading(false);
                setUploadError('Upload failed. Please check your connection and try again.');
            });

            xhr.addEventListener('abort', () => {
                setIsUploading(false);
                setUploadProgress(0);
            });

            xhr.open('POST', 'https://content.dropboxapi.com/2/files/upload');
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
            xhr.setRequestHeader('Dropbox-API-Arg', JSON.stringify({
                path: `/${file.name}`,
                mode: 'add',
                autorename: true,
                mute: false,
            }));
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.send(file);

        } catch (error) {
            console.error('Error uploading to Dropbox:', error);
            setIsUploading(false);
            setUploadError('Upload failed. Please try again.');
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            uploadToDropbox(file);
        }
    };

    return (
        <div className="upload-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Folder size={16} /> Dropbox (Perfect Sync)
            </label>

            {!isAuthenticated ? (
                <div>
                    <button
                        onClick={handleAuth}
                        style={{
                            padding: '0.625rem 1.25rem',
                            background: 'var(--white)',
                            color: 'var(--black)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.75rem',
                            marginBottom: '0.625rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Lock size={16} /> Sign in with Dropbox
                    </button>
                    <div style={{ marginTop: '10px' }}>
                        <button
                            onClick={openChooser}
                            style={{
                                padding: '0.625rem 1.25rem',
                                background: 'transparent',
                                color: 'var(--white)',
                                border: '1px solid var(--gray-300)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Folder size={16} /> Browse Public Dropbox Files
                        </button>
                        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                            (No sign-in needed for public files)
                        </p>
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ marginBottom: '0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Check size={14} /> Signed in to Dropbox
                        <button
                            onClick={handleSignOut}
                            style={{
                                marginLeft: '0.625rem',
                                padding: '0.3rem 0.625rem',
                                background: 'transparent',
                                color: 'var(--white)',
                                border: '1px solid var(--gray-300)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                fontSize: '0.7rem'
                            }}
                        >
                            Sign Out
                        </button>
                    </div>

                    {uploadError && (
                        <div style={{
                            padding: '0.625rem',
                            background: 'var(--gray-100)',
                            border: '1px solid var(--white)',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '0.625rem',
                            fontSize: '0.7rem',
                            color: 'var(--white)',
                            lineHeight: '1.4',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <X size={14} /> {uploadError}
                            <button
                                onClick={retryUpload}
                                style={{
                                    marginLeft: 'auto',
                                    padding: '0.3rem 0.9rem',
                                    background: 'var(--white)',
                                    color: 'var(--black)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                }}
                            >
                                <RotateCw size={12} /> Retry
                            </button>
                        </div>
                    )}

                    {isUploading ? (
                        <div>
                            <div style={{ marginBottom: '0.3rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Uploading... {uploadProgress}%</span>
                                <button
                                    onClick={cancelUpload}
                                    style={{
                                        padding: '0.3rem 0.9rem',
                                        background: 'transparent',
                                        color: 'var(--white)',
                                        border: '1px solid var(--gray-300)',
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem'
                                    }}
                                >
                                    <X size={12} /> Cancel
                                </button>
                            </div>
                            <div style={{
                                width: '100%',
                                height: '0.5rem',
                                background: 'var(--gray-100)',
                                borderRadius: 'var(--radius-sm)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${uploadProgress}%`,
                                    height: '100%',
                                    background: 'var(--white)',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={openChooser}
                                style={{
                                    padding: '0.625rem 1.25rem',
                                    background: 'var(--white)',
                                    color: 'var(--black)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Folder size={16} /> Browse My Dropbox
                            </button>

                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                id="dropbox-upload-input"
                            />
                            <label
                                htmlFor="dropbox-upload-input"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.625rem 1.25rem',
                                    background: 'transparent',
                                    color: 'var(--white)',
                                    border: '1px solid var(--gray-300)',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.75rem'
                                }}
                            >
                                <Upload size={16} /> Upload to Dropbox
                            </label>
                        </div>
                    )}
                    <p style={{ margin: '0.625rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Sparkles size={12} /> Dropbox links work perfectly with video sync!
                    </p>
                </div>
            )}
        </div>
    );
};

export default DropboxUpload;
