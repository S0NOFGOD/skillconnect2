import { useEffect, useRef, useState } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

// ==========================
// WORKER PASSWORD CHANGE
// ==========================

function WorkerPasswordChange() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading, setLoading] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'success' | 'error'>('success');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');
    const [redirectAfterModal, setRedirectAfterModal] = useState(false);

    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const passwordInputRef = useRef<HTMLInputElement>(null);

    const workerEmail = sessionStorage.getItem('workerEmail');

    // ==========================
    // SIDEBAR CONTROL
    // ==========================

    function openSidebar() {
        setSidebarOpen(true);
    }

    function closeSidebar() {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    }

    useEffect(() => {
        if (!sidebarOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') closeSidebar();
        }

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    // ==========================
    // NOTIFICATION MODAL
    // ==========================

    function showModal(
        type: 'success' | 'error',
        title: string,
        message: string,
        redirect = false
    ) {
        setModalType(type);
        setModalTitle(title);
        setModalMessage(message);
        setRedirectAfterModal(redirect);
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);

        if (redirectAfterModal) {
            setRedirectAfterModal(false);
            window.location.href = '/worker-authentication/';
        }
    }

    // ==========================
    // CHECK RESET SESSION
    // ==========================

    useEffect(() => {
        if (!workerEmail) {
            showModal(
                'error',
                'Reset Session Required',
                'Your password reset session is missing or expired. Please restart the password reset process.',
                true
            );
        } else {
            passwordInputRef.current?.focus();
        }
    }, []);

    // ==========================
    // PASSWORD VALIDATION
    // ==========================

    async function handleSubmit(
        event: React.FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        if (!password.trim()) {
            showModal(
                'error',
                'Password Required',
                'Please enter a new password.'
            );
            return;
        }

        if (password.length < 8) {
            showModal(
                'error',
                'Password Too Short',
                'Your password must contain at least 8 characters.'
            );
            return;
        }

        if (!confirmPassword.trim()) {
            showModal(
                'error',
                'Confirmation Required',
                'Please confirm your new password.'
            );
            return;
        }

        if (password !== confirmPassword) {
            showModal(
                'error',
                'Passwords Do Not Match',
                'The new password and confirmation password must be the same.'
            );
            return;
        }

        if (!workerEmail) {
            showModal(
                'error',
                'Reset Session Required',
                'Your password reset session is missing or expired. Please restart the password reset process.',
                true
            );
            return;
        }

        // ==========================
        // SEND PASSWORD CHANGE REQUEST
        // ==========================

        setLoading(true);

        try {
            const response = await API_REQUEST(
                '/api/worker-password-change',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: workerEmail,
                        password,
                        confirmPassword
                    })
                }
            );

            let data: { message?: string } = {};

            try {
                data = await response.json();
            } catch {
                data = {};
            }

            // ==========================
            // BACKEND VALIDATION ERRORS
            // ==========================

            if (!response.ok) {
                setLoading(false);

                if (
                    response.status === 401 &&
                    data.message?.toLowerCase().includes('authorization')
                ) {
                    showModal(
                        'error',
                        'Password Reset Expired',
                        data.message,
                        true
                    );

                    return;
                }

                showModal(
                    'error',
                    'Password Change Failed',
                    data.message ||
                    'Unable to change your password. Please try again.'
                );

                return;
            }

            // ==========================
            // PASSWORD CHANGE SUCCESSFUL
            // ==========================

            sessionStorage.removeItem('workerEmail');

            setLoading(false);

            showModal(
                'success',
                'Password Changed',
                data.message ||
                'Your password has been changed successfully. You can now log in with your new password.',
                true
            );

        } catch (error) {
            console.error('Worker password change error:', error);

            setLoading(false);

            showModal(
                'error',
                'Connection Error',
                'Unable to connect to the server. Please check your internet connection and try again.'
            );
        }
    }

    // ==========================
    // PAGE
    // ==========================

    return (
        <>
            {/* HEADER AND NAVIGATION */}

            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">
                        SKILLCONNECT
                    </a>

                    <div className="nav-links">
                        <a href="/home/">Home</a>
                        <a href="/about/">About us</a>
                        <a href="/contact/">Contact us</a>
                        <a href="/services/">Find a worker</a>
                    </div>

                    <button
                        ref={menuToggleRef}
                        type="button"
                        className="menu-toggle"
                        onClick={openSidebar}
                        aria-label="Open navigation menu"
                        aria-expanded={sidebarOpen}
                        aria-controls="mobileSidebar"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </nav>
            </header>

            {/* MOBILE SIDEBAR */}

            <div
                className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            <aside
                className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`}
                id="mobileSidebar"
                aria-label="Mobile navigation"
                aria-hidden={!sidebarOpen}
                inert={!sidebarOpen}
            >
                <div className="sidebar-header">
                    <span className="sidebar-title">Menu</span>

                    <button
                        type="button"
                        className="sidebar-close"
                        onClick={closeSidebar}
                        aria-label="Close navigation menu"
                    >
                        ×
                    </button>
                </div>

                <nav className="sidebar-links">
                    <a href="/home/" onClick={closeSidebar}>Home</a>
                    <a href="/about/" onClick={closeSidebar}>About us</a>
                    <a href="/contact/" onClick={closeSidebar}>Contact us</a>
                    <a href="/services/" onClick={closeSidebar}>Find a worker</a>
                </nav>
            </aside>

            {/* MAIN CONTENT */}

            <main className="password-page">
                <section className="password-section">
                    <div className="password-card">

                        <div className="password-header">
                            <div className="password-badge">
                                Password Reset
                            </div>

                            <h1>Create New Password</h1>

                            <p>
                                Create a new password to secure your
                                SkillConnect worker account.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} noValidate>

                            {/* NEW PASSWORD */}

                            <div className="input-group">
                                <label htmlFor="password">
                                    New Password
                                </label>

                                <div className="password-box">
                                    <input
                                        ref={passwordInputRef}
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        placeholder="Enter your new password"
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(event) =>
                                            setPassword(event.target.value)
                                        }
                                        disabled={loading || !workerEmail}
                                    />

                                    <button
                                        type="button"
                                        className="toggle"
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        aria-label={
                                            showPassword
                                                ? 'Hide password'
                                                : 'Show password'
                                        }
                                        disabled={loading}
                                    >
                                        {showPassword ? '🙈' : '👁'}
                                    </button>
                                </div>
                            </div>

                            {/* CONFIRM PASSWORD */}

                            <div className="input-group">
                                <label htmlFor="confirmPassword">
                                    Confirm Password
                                </label>

                                <div className="password-box">
                                    <input
                                        type={
                                            showConfirmPassword
                                                ? 'text'
                                                : 'password'
                                        }
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        placeholder="Confirm your new password"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(event) =>
                                            setConfirmPassword(event.target.value)
                                        }
                                        disabled={loading || !workerEmail}
                                    />

                                    <button
                                        type="button"
                                        className="toggle"
                                        onClick={() =>
                                            setShowConfirmPassword(
                                                !showConfirmPassword
                                            )
                                        }
                                        aria-label={
                                            showConfirmPassword
                                                ? 'Hide confirm password'
                                                : 'Show confirm password'
                                        }
                                        disabled={loading}
                                    >
                                        {showConfirmPassword ? '🙈' : '👁'}
                                    </button>
                                </div>
                            </div>

                            {/* SECURITY NOTE */}

                            <div className="security-note">
                                🔒 Your password is securely hashed before being stored.
                            </div>

                            {/* SUBMIT BUTTON */}

                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={loading || !workerEmail}
                            >
                                {loading ? 'Changing…' : 'Change Password'}
                            </button>

                        </form>

                        <div className="login-link">
                            Remember your password?

                            <a href="/worker-authentication/">
                                Back to Login
                            </a>
                        </div>

                    </div>
                </section>
            </main>

            {/* FOOTER */}

            <footer>
                <p>
                    © {new Date().getFullYear()} SkillConnect. All rights reserved.
                </p>
            </footer>

            {/* NOTIFICATION MODAL */}

            <div
                className={`modal ${modalOpen ? 'show' : ''} ${modalType}`}
                aria-hidden={!modalOpen}
                role="dialog"
                aria-modal="true"
                aria-labelledby="notificationTitle"
                aria-describedby="notificationMessage"
            >
                <div
                    className="modal-overlay"
                    onClick={() => setModalOpen(false)}
                />

                <div className="modal-card">
                    <button
                        type="button"
                        className="modal-close"
                        onClick={closeModal}
                        aria-label="Close notification"
                    >
                        ×
                    </button>

                    <div className="modal-icon">
                        {modalType === 'success' ? '✓' : '!'}
                    </div>

                    <h3 id="notificationTitle">
                        {modalTitle}
                    </h3>

                    <p id="notificationMessage">
                        {modalMessage}
                    </p>

                    <button
                        type="button"
                        className="modal-button"
                        onClick={closeModal}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </>
    );
}

export default WorkerPasswordChange;