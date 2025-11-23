import React, { useState, useEffect } from 'react';
import { FolderOpen, Lock, Check, Upload } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'YOUR_API_KEY'; // We'll need to add this
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const GoogleDriveUpload = ({ onLinkGenerated }) => {
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [tokenClient, setTokenClient] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [pickerApiLoaded, setPickerApiLoaded] = useState(false);

    useEffect(() => {
        // Load Google Identity Services
        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.onload = initializeGIS;
        document.body.appendChild(gisScript);

        // Load Google API (for Picker)
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = () => {
            window.gapi.load('picker', () => {
                setPickerApiLoaded(true);
            });
        };
        document.body.appendChild(gapiScript);

        return () => {
            if (document.body.contains(gisScript)) document.body.removeChild(gisScript);
            if (document.body.contains(gapiScript)) document.body.removeChild(gapiScript);
        };
    }, []);

    const initializeGIS = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.access_token) {
                    setAccessToken(response.access_token);
                    setIsSignedIn(true);
                }
            },
        });
        setTokenClient(client);
    };

    const handleSignIn = () => {
        if (tokenClient) {
            tokenClient.requestAccessToken();
        }
    };

    const handleSignOut = () => {
        if (accessToken) {
            window.google.accounts.oauth2.revoke(accessToken, () => {
                setAccessToken(null);
                setIsSignedIn(false);
            });
        }
    };

    const openPicker = () => {
        if (!pickerApiLoaded || !accessToken) {
            alert('Please wait for Google Drive to load...');
            return;
        }

        const picker = new window.google.picker.PickerBuilder()
            .addView(
                new window.google.picker.DocsView(window.google.picker.ViewId.DOCS_VIDEOS)
                    .setIncludeFolders(true)
            )
            .setOAuthToken(accessToken)
            .setDeveloperKey(GOOGLE_API_KEY)
            .setCallback(pickerCallback)
            .build();

        picker.setVisible(true);
    };

    const pickerCallback = async (data) => {
        if (data.action === window.google.picker.Action.PICKED) {
            const file = data.docs[0];
            const fileId = file.id;

            try {
                // Make file publicly accessible
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        role: 'reader',
                        type: 'anyone',
                    }),
                });

                // Generate preview link
                const directLink = `https://drive.google.com/file/d/${fileId}/preview`;

                if (onLinkGenerated) {
                    onLinkGenerated(directLink);
                }
            } catch (error) {
                console.error('Error sharing file:', error);
                alert('Failed to share the file. Please try again.');
            }
        }
    };

    const uploadToDrive = async (file) => {
        if (!file || !accessToken) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const metadata = {
                name: file.name,
                mimeType: file.type,
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    setUploadProgress(percentComplete);
                }
            });

            xhr.addEventListener('load', async () => {
                if (xhr.status === 200) {
                    const fileData = JSON.parse(xhr.responseText);
                    const fileId = fileData.id;

                    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            role: 'reader',
                            type: 'anyone',
                        }),
                    });

                    const directLink = `https://drive.google.com/file/d/${fileId}/preview`;

                    setUploadProgress(100);
                    setIsUploading(false);

                    if (onLinkGenerated) {
                        onLinkGenerated(directLink);
                    }
                } else {
                    throw new Error('Upload failed');
                }
            });

            xhr.addEventListener('error', () => {
                console.error('Upload error');
                setIsUploading(false);
                alert('Failed to upload to Google Drive. Please try again.');
            });

            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
            xhr.send(form);

        } catch (error) {
            console.error('Error uploading to Drive:', error);
            setIsUploading(false);
            alert('Failed to upload to Google Drive. Please try again.');
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            uploadToDrive(file);
        }
    };

    if (!tokenClient) {
        return <div style={{ padding: '0.625rem', color: 'var(--gray-400)', fontSize: '0.75rem' }}>Loading Google Drive...</div>;
    }

    return (
        <div className="upload-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <FolderOpen size={16} /> Google Drive
            </label>

            {!isSignedIn ? (
                <button
                    onClick={handleSignIn}
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
                    <Lock size={16} /> Sign in with Google
                </button>
            ) : (
                <div>
                    <div style={{ marginBottom: '0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Check size={14} /> Signed in to Google Drive
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

                    {isUploading ? (
                        <div>
                            <div style={{ marginBottom: '5px', fontSize: '0.9rem' }}>
                                Uploading... {uploadProgress}%
                            </div>
                            <div style={{
                                width: '100%',
                                height: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '4px',
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
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                onClick={openPicker}
                                style={{
                                    padding: '10px 20px',
                                    background: 'var(--white)',
                                    color: 'var(--black)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem'
                                }}
                            >
                                📂 Browse My Drive
                            </button>

                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                id="drive-upload-input"
                            />
                            <label
                                htmlFor="drive-upload-input"
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
                                <Upload size={16} /> Upload New Video
                            </label>
                        </div>
                    )}
                    <p style={{ margin: '0.625rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                        Pick an existing video or upload a new one to your Drive
                    </p>
                </div>
            )}
        </div>
    );
};

export default GoogleDriveUpload;
