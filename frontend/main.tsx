import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Homepage from './homepage';
import About from './about';
import Contact from './contact';
import Services from './services';
import WorkerAuthentication from './worker-authentication';
import WorkerEmailOTP from './worker-email-otp';
import WorkerPasswordResetOTP from './worker-password-reset-otp';
import WorkerCreateProfile from './worker-create-profile';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

function App() {
    switch (path) {
        case '/about': return <About />;
        case '/contact': return <Contact />;
        case '/services': return <Services />;
        case '/worker-authentication': return <WorkerAuthentication />;
        case '/worker-email-otp': return <WorkerEmailOTP />;
        case '/worker-password-reset-otp': return <WorkerPasswordResetOTP />;
        case '/worker-create-profile': return <WorkerCreateProfile />;
        default: return <Homepage />;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);