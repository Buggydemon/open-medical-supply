import React from 'react';
import { createRoot } from 'react-dom/client';
import PilotApp from './PilotApp.jsx';
import '../styles.css';
import './pilot.css';

createRoot(document.getElementById('root')).render(<PilotApp />);
