import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Homepage from './homepage';
import About from './about';
import Contact from './contact';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

function App() {
    switch (path) {
        case '/about':
            return <About />;

        case '/contact':
            return <Contact />;

        default:
            return <Homepage />;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);