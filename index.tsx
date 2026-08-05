
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Ignore benign browser extension messaging errors
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('Could not establish connection') ||
      event.reason?.message?.includes('Receiving end does not exist')) {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
