import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Homepage from './homepage';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Homepage />
    </StrictMode>
);