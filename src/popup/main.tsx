import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/base.css';
import './popup.css';
import '../spike/spike.css';
import { Popup } from './Popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
