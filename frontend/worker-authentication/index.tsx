import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Notice {
    title: string;
    message: string;
    action?: () => void;
    cooldown?: boolean;
}

interface EmailFieldProps {
    id: string;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

interface PasswordFieldProps extends EmailFieldProps {
    label: string;
    placeholder: string;
    autoComplete: string;
    visible: boolean;
    onToggle: () => void;
}

function EmailField({ id, value, onChange }: EmailFieldProps) {
    return (
        <div className="form-group">
            <label htmlFor={id}>Email Address</label>
            <input id={id} type="email" autoComplete="email"
                placeholder="Enter your email" value={value} onChange={onChange}/>
        </div>
    );
}

function PasswordField({ id, label, value, onChange, placeholder, autoComplete, visible, onToggle }: PasswordFieldProps) {
    return (
        <div className="form-group">
            <label htmlFor={id}>{label}</label>
            <div className="password-wrapper">
                <input id={id} type={visible ? 'text' : 'password'}
                    autoComplete={autoComplete} placeholder={placeholder}
                    value={value} onChange={onChange}/>
                <button type="button" className="password-toggle" onClick={onToggle}>
                    {visible ? 'Hide' : 'Show'}
                </button>
            </div>
        </div>
    );
}

function GoogleButton({ busy, onClick }: { busy: string; onClick: () => void }) {
    return (
        <button type="button" className="google-button" disabled={!!busy} onClick={onClick}>
            <span className="google-icon">G</span>
            {busy === 'google' ? 'Connecting…' : 'Continue with Google'}
        </button>
    );
}

function WorkerAuthentication() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<'login' | 'signup'>('login');
    const [notice, setNotice] = useState<Notice | null>(null);
    const [forgotOpen, setForgotOpen] = useState(false);
    const [busy, setBusy] = useState('');
    const [visible, setVisible] = useState<Record<string, boolean>>({});
    const [login, setLogin] = useState({ email: '', password: '' });
    const [signup, setSignup] = useState({ email: '', password: '', confirmPassword: '', terms: false });
    const [resetEmail, setResetEmail] = useState('');
    const menuRef = useRef<HTMLButtonElement>(null);

    const routes = {
        emailOTP: '/worker-email-otp/',
        profile: '/worker-create-profile/',
        dashboard: '/worker-dashboard/',
        passwordOTP: '/worker-password-reset-otp/'
    };

    const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const saveEmail = (email: string) => sessionStorage.setItem('workerEmail', email);
    const show = (title: string, message: string, action?: () => void, cooldown = false) =>
        setNotice({ title, message, action, cooldown });
    const toggle = (id: string) => setVisible(previous => ({ ...previous, [id]: !previous[id] }));

    const closeSidebar = () => {
        setSidebarOpen(false);
        menuRef.current?.focus();
    };

    const closeNotice = () => {
        const action = notice?.action;
        setNotice(null);
        action?.();
    };

    useEffect(() => {
        if (!sidebarOpen && !notice && !forgotOpen) return;

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSidebarOpen(false);
                setNotice(null);
                setForgotOpen(false);
            }
        };

        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen, notice, forgotOpen]);

    async function post(path: string, body: object) {
        const response = await API_REQUEST(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        let data: any = {};
        try { data = await response.json(); } catch {}

        return {
            ...data,
            success: data.success === true && response.ok,
            message: data.message || (response.ok
                ? 'Request completed successfully.'
                : 'Something went wrong. Please try again.')
        };
    }

    function requestError(data: any, fallback: string) {
        const date = data.cooldownUntil ? new Date(data.cooldownUntil) : null;
        const valid = date && !Number.isNaN(date.getTime());

        show('Notification', (data.message || fallback) +
            (valid ? `\n\nYou can try again after: ${date.toLocaleString()}` : ''), undefined, !!valid);
    }

    function redirect(data: any) {
        if (data.nextStep === 'email-verification') location.href = routes.emailOTP;
        else if (data.nextStep === 'profile') location.href = routes.profile;
        else if (data.nextStep === 'authenticated') location.href = routes.dashboard;
    }

    async function submitSignup(event: FormEvent) {
        event.preventDefault();

        const email = signup.email.trim().toLowerCase();
        const { password, confirmPassword, terms } = signup;

        if (!validEmail(email)) return show('Invalid Email', 'Please enter a valid email address.');
        if (password.length < 8) return show('Invalid Password', 'Password must be at least 8 characters.');
        if (!confirmPassword) return show('Confirm Password', 'Please confirm your password.');
        if (password !== confirmPassword) return show('Password Mismatch', 'Passwords do not match.');
        if (!terms) return show('Agreement Required', 'Please agree to the Terms and Privacy Policy.');

        setBusy('signup');

        try {
            const data = await post('/api/worker-authentication/signup', {
                email, password, confirmPassword, termsAccepted: terms
            });

            if (!data.success) return requestError(data, 'Unable to create your account.');

            saveEmail(data.email || email);
            show('Account Created', data.message || 'A verification code has been sent to your email.',
                () => location.href = routes.emailOTP);
        } catch (error) {
            console.error('Worker signup error:', error);
            show('Connection Error', 'Unable to connect. Please try again.');
        } finally { setBusy(''); }
    }

    async function submitLogin(event: FormEvent) {
        event.preventDefault();

        const email = login.email.trim().toLowerCase();

        if (!validEmail(email)) return show('Invalid Email', 'Please enter a valid email address.');
        if (!login.password) return show('Password Required', 'Please enter your password.');

        setBusy('login');

        try {
            const data = await post('/api/worker-authentication/login', {
                email, password: login.password
            });

            if (!data.success) return requestError(data, 'Unable to log in.');

            const result = { ...data, email: data.email || email };
            if (['email-verification', 'profile'].includes(data.nextStep)) saveEmail(result.email);

            const date = data.cooldownUntil ? new Date(data.cooldownUntil) : null;
            const valid = date && !Number.isNaN(date.getTime());

            show('Notification', (data.message || 'Login successful.') +
                (valid ? `\n\nYou can try again after: ${date.toLocaleString()}` : ''),
                () => redirect(result), !!valid);
        } catch (error) {
            console.error('Worker login error:', error);
            show('Connection Error', 'Unable to connect. Please try again.');
        } finally { setBusy(''); }
    }

    async function submitForgot(event: FormEvent) {
        event.preventDefault();

        const email = resetEmail.trim().toLowerCase();

        if (!validEmail(email)) return show('Invalid Email', 'Please enter a valid email address.');

        setBusy('forgot');

        try {
            const data = await post('/api/worker-authentication/forgot-password', { email });

            if (!data.success) return requestError(data, 'Unable to process your password reset request.');

            saveEmail(data.email || email);
            setForgotOpen(false);
            show('Check Your Email', data.message || 'A verification code has been sent to your email.',
                () => location.href = routes.passwordOTP);
        } catch (error) {
            console.error('Worker password reset error:', error);
            show('Connection Error', 'Unable to connect. Please try again.');
        } finally { setBusy(''); }
    }

    async function googleAuth() {
        setBusy('google');

        try {
            const data = await post('/api/worker-authentication/google', {});

            if (!data.success || !data.authorizationUrl)
                return requestError(data, 'Unable to start Google authentication.');

            location.href = data.authorizationUrl;
        } catch (error) {
            console.error('Worker Google authentication error:', error);
            show('Connection Error', 'Unable to connect to Google authentication. Please try again.');
        } finally { setBusy(''); }
    }

    useEffect(() => {
        const error = new URLSearchParams(location.search).get('error');
        if (!error) return;

        const messages: Record<string, string> = {
            'password-account': 'An account with this email already uses password authentication. Please log in with your email and password.',
            'google-authentication-failed': 'Google authentication failed. Please try again.'
        };

        show('Google Authentication', messages[error] || 'Unable to complete Google authentication.');
        history.replaceState({}, document.title, location.pathname);
    }, []);

    return <>
        <header className="header">
            <nav className="navbar" aria-label="Main navigation">
                <a href="/" className="logo">SKILLCONNECT</a>

                <div className="nav-links">
                    <a href="/home/">Home</a>
                    <a href="/about/">About us</a>
                    <a href="/contact/">Contact us</a>
                    <a href="/services/">Find a worker</a>
                </div>

                <button ref={menuRef} type="button" className="menu-toggle"
                    onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu"
                    aria-expanded={sidebarOpen} aria-controls="mobileSidebar">
                    <span/><span/><span/>
                </button>
            </nav>
        </header>

        <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
            onClick={closeSidebar} aria-hidden="true"/>

        <aside className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`}
            id="mobileSidebar" aria-label="Mobile navigation"
            aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
            <div className="sidebar-header">
                <span className="sidebar-title">Menu</span>
                <button type="button" className="sidebar-close"
                    onClick={closeSidebar} aria-label="Close navigation menu">×</button>
            </div>

            <nav className="sidebar-links">
                {['Home', 'About us', 'Contact us', 'Find a worker'].map((name, i) =>
                    <a key={name} href={['/home/', '/about/', '/contact/', '/services/'][i]}
                        onClick={closeSidebar}>{name}</a>
                )}
            </nav>
        </aside>

        <main className="auth-page">
            <section className="hero-section">
                <span className="hero-badge">Trusted • Verified • Nearby</span>
                <h1>Grow Your <span>Business</span> With SkillConnect</h1>
                <p className="hero-description">
                    Connect with nearby clients, showcase your skills and grow your service business.
                </p>

                <div className="benefits">
                    <div className="benefit-card">
                        <div className="benefit-icon">✓</div>
                        <div>
                            <h3>Find Clients</h3>
                            <p>Connect with people looking for your skills.</p>
                        </div>
                    </div>

                    <div className="benefit-card">
                        <div className="benefit-icon">✓</div>
                        <div>
                            <h3>Grow Your Business</h3>
                            <p>Get discovered by clients near you.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="auth-section">
                <div className="auth-card">
                    <div className="auth-header">
                        <h2>Worker Account</h2>
                        <p>Login or create your account</p>
                    </div>

                    <div className="tabs">
                        {(['login', 'signup'] as const).map(value =>
                            <button key={value} type="button"
                                className={`tab ${tab === value ? 'active' : ''}`}
                                onClick={() => setTab(value)}>
                                {value === 'login' ? 'Login' : 'Create Account'}
                            </button>
                        )}
                    </div>

                    {tab === 'login' ? (
                        <form className="auth-form active" onSubmit={submitLogin} noValidate>
                            <EmailField id="loginEmail" value={login.email}
                                onChange={e => setLogin({ ...login, email: e.target.value })}/>

                            <PasswordField id="loginPassword" label="Password"
                                value={login.password} placeholder="Enter your password"
                                autoComplete="current-password" visible={!!visible.loginPassword}
                                onToggle={() => toggle('loginPassword')}
                                onChange={e => setLogin({ ...login, password: e.target.value })}/>

                            <button type="button" className="forgot-password" onClick={() => {
                                setResetEmail(login.email);
                                setForgotOpen(true);
                            }}>Forgot Password?</button>

                            <button type="submit" className="auth-button" disabled={!!busy}>
                                {busy === 'login' ? 'Logging in…' : 'Login'}
                            </button>

                            <div className="auth-divider"><span>OR</span></div>
                            <GoogleButton busy={busy} onClick={googleAuth}/>
                        </form>
                    ) : (
                        <form className="auth-form active" onSubmit={submitSignup} noValidate>
                            <EmailField id="signupEmail" value={signup.email}
                                onChange={e => setSignup({ ...signup, email: e.target.value })}/>

                            <PasswordField id="signupPassword" label="Password"
                                value={signup.password} placeholder="Minimum 8 characters"
                                autoComplete="new-password" visible={!!visible.signupPassword}
                                onToggle={() => toggle('signupPassword')}
                                onChange={e => setSignup({ ...signup, password: e.target.value })}/>

                            <PasswordField id="confirmPassword" label="Confirm Password"
                                value={signup.confirmPassword} placeholder="Confirm your password"
                                autoComplete="new-password" visible={!!visible.confirmPassword}
                                onToggle={() => toggle('confirmPassword')}
                                onChange={e => setSignup({ ...signup, confirmPassword: e.target.value })}/>

                            <label className="terms-label">
                                <input type="checkbox" checked={signup.terms}
                                    onChange={e => setSignup({ ...signup, terms: e.target.checked })}/>
                                <span>I agree to the <a href="/about/">Terms and Privacy Policy</a></span>
                            </label>

                            <button type="submit" className="auth-button" disabled={!!busy}>
                                {busy === 'signup' ? 'Creating…' : 'Create Account'}
                            </button>

                            <div className="auth-divider"><span>OR</span></div>
                            <GoogleButton busy={busy} onClick={googleAuth}/>
                        </form>
                    )}
                </div>
            </section>
        </main>

        <footer>
            <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
        </footer>

        {notice && (
            <div className="modal show" role="dialog" aria-modal="true"
                aria-labelledby="notificationTitle">
                <div className="modal-overlay" onClick={closeNotice}/>
                <div className="modal-card">
                    <button type="button" className="modal-close"
                        onClick={closeNotice} aria-label="Close">×</button>
                    <div className={`modal-icon ${notice.cooldown ? 'cooldown-icon' : ''}`}>
                        {notice.cooldown ? '!' : '✓'}
                    </div>
                    <h3 id="notificationTitle">{notice.title}</h3>
                    <p className="notice-message">{notice.message}</p>
                    <button type="button" className="modal-button" onClick={closeNotice}>Continue</button>
                </div>
            </div>
        )}

        {forgotOpen && (
            <div className="modal show" role="dialog" aria-modal="true"
                aria-labelledby="forgotTitle">
                <div className="modal-overlay" onClick={() => setForgotOpen(false)}/>
                <div className="modal-card">
                    <button type="button" className="modal-close"
                        onClick={() => setForgotOpen(false)} aria-label="Close">×</button>
                    <div className="modal-icon">?</div>
                    <h3 id="forgotTitle">Forgot Password?</h3>
                    <p>Enter your email address to verify your account.</p>

                    <form onSubmit={submitForgot} noValidate>
                        <div className="form-group">
                            <input type="email" placeholder="Enter your email"
                                autoComplete="email" value={resetEmail}
                                onChange={e => setResetEmail(e.target.value)}/>
                        </div>
                        <button type="submit" className="modal-button" disabled={!!busy}>
                            {busy === 'forgot' ? 'Verifying…' : 'Verify Email'}
                        </button>
                    </form>
                </div>
            </div>
        )}
    </>;
}

export default WorkerAuthentication;