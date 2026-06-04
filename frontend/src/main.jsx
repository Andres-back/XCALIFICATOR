import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress React 18 defaultProps deprecation warnings from third-party libraries
const origWarn = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Support for defaultProps will be removed')) return;
  origWarn.apply(console, args);
};

const appTree = <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? appTree : <React.StrictMode>{appTree}</React.StrictMode>
);
