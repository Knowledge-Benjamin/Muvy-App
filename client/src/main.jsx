import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SocketProvider } from './context/SocketContext';
import './App.css'

ReactDOM.createRoot(document.getElementById('app')).render(
    <React.StrictMode>
        <SocketProvider>
            <App />
        </SocketProvider>
    </React.StrictMode>,
)
