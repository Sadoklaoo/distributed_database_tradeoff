import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e1e1e',
              color: '#fff',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              padding: '12px 16px',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
                secondary: '#1e1e1e',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#1e1e1e',
              },
            },
          }}
        />
    </BrowserRouter>
  </React.StrictMode>
);


