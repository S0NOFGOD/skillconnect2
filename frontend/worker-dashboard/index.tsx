import { useCallback, useEffect, useState } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Worker {
    fullName?: string | null;
    phone?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    totalSkills?: number | null;
    totalClients?: number | null;
    profilePhoto?: string | null;
    profileVerificationExpires?: string | null;
}

interface Notification {
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'confirm';
    buttonText: string;
    action?: (() => Promise<void>) | null;
    confirmation?: boolean;
    buttonHidden?: boolean;
    redirect?: string | null;
}

const DASHBOARD_ENDPOINT = '/api/worker/dashboard';
const SEND_PHONE_OTP_ENDPOINT = '/api/worker/send-phone-otp';
const LOGOUT_ENDPOINT = '/api/auth/logout';

function WorkerDashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [worker, setWorker] = useState<Worker | null>(null);
    const [notification, setNotification] = useState<Notification | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [otpSending, setOtpSending] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [verificationExpiry, setVerificationExpiry] = useState<number | null>(null);
    const [cooldownExpiry, setCooldownExpiry] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState(Date.now());

    const busy = dashboardLoading || otpSending || logoutLoading;

    const showModal = useCallback((
        title: string,
        message: string,
        type: Notification['type'] = 'info',
        action: Notification['action'] = null,
        buttonText = 'Continue',
        confirmation = false,
        redirect: string | null = null,
        buttonHidden = false
    ) => {
        setNotification({ title, message, type, action, buttonText, confirmation, redirect, buttonHidden });
    }, []);

    function hideModal() {
        if (busy) return;
        setNotification(null);
    }

    function navigateTo(path: string) {
        setSidebarOpen(false);
        window.location.href = path;
    }

    const redirectToLogin = useCallback(() => {
        window.location.href = '../worker-authentication/index.html';
    }, []);

    const authenticationError = useCallback((
        message = 'Your session has expired. Please log in again.'
    ) => {
        showModal('Authentication Required', message, 'error', null, 'Continue', false, '../worker-authentication/index.html');
    }, [showModal]);

    const loadDashboard = useCallback(async () => {
        setDashboardLoading(true);
        showModal('Connecting', 'Connecting to your dashboard...', 'info', null, 'Continue', false, null, true);

        try {
            const response = await API_REQUEST(DASHBOARD_ENDPOINT, { method: 'GET' });

            if (response.status === 401) {
                authenticationError();
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                showModal('Unable to Load Dashboard', data.message || 'Unable to load your dashboard. Please try again.', 'error');
                return;
            }

            setWorker(data.worker || data);
            setNotification(null);
        } catch (error) {
            console.error('Dashboard request failed:', error);
            showModal('Connection Error', 'Unable to connect to the server. Please try again.', 'error');
        } finally {
            setDashboardLoading(false);
        }
    }, [showModal, authenticationError]);

    const sendPhoneOtp = useCallback(async () => {
        if (otpSending) return;
        setOtpSending(true);

        try {
            const response = await API_REQUEST(SEND_PHONE_OTP_ENDPOINT, { method: 'POST' });
            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                authenticationError();
                return;
            }

            if (!response.ok) {
                const cooldown = data.phoneOtpResendAttempts?.coolDownUntil || data.coolDownUntil;

                if (cooldown) {
                    const expiry = new Date(cooldown).getTime();

                    if (Number.isFinite(expiry) && expiry > Date.now()) {
                        setCooldownExpiry(expiry);
                    }
                }

                showModal(
                    data.coolDownUntil || data.phoneOtpResendAttempts?.coolDownUntil ? 'Verification Cooldown' : 'Verification Error',
                    data.message || 'Unable to send the verification code.',
                    'error'
                );
                return;
            }

            if (data.phone) sessionStorage.setItem('workerPhone', data.phone);

            showModal(
                'OTP Sent',
                data.message || 'A verification code has been sent to your phone.',
                'success',
                null,
                'Continue',
                false,
                '../worker-phone-otp/index.html'
            );
        } catch (error) {
            console.error('Phone OTP request failed:', error);
            showModal('Connection Error', 'Unable to send the verification code. Please try again.', 'error');
        } finally {
            setOtpSending(false);
        }
    }, [otpSending, authenticationError, showModal]);

    const confirmVerification = useCallback(() => {
        if (verificationExpiry && verificationExpiry > Date.now()) return;

        showModal(
            'Verify Profile',
            'Are you sure you want to verify your profile?',
            'confirm',
            sendPhoneOtp,
            'Yes',
            true
        );
    }, [verificationExpiry, showModal, sendPhoneOtp]);

    const logoutWorker = useCallback(async () => {
        if (logoutLoading) return;
        setLogoutLoading(true);

        try {
            const response = await API_REQUEST(LOGOUT_ENDPOINT, { method: 'POST' });
            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                authenticationError();
                return;
            }

            if (!response.ok) {
                showModal('Logout Failed', data.message || 'Unable to log out. Please try again.', 'error');
                return;
            }

            redirectToLogin();
        } catch (error) {
            console.error('Logout request failed:', error);
            showModal('Connection Error', 'Unable to log out at this time. Please try again.', 'error');
        } finally {
            setLogoutLoading(false);
        }
    }, [logoutLoading, authenticationError, showModal, redirectToLogin]);

    function confirmLogout() {
        showModal('Logout', 'Are you sure you want to log out?', 'confirm', logoutWorker, 'Yes', true);
    }

    async function handleNotificationAction() {
        if (!notification || busy) return;

        if (notification.redirect) {
            window.location.href = notification.redirect;
            return;
        }

        if (notification.action) {
            try {
                await notification.action();
            } catch (error) {
                console.error('Notification action failed:', error);
                showModal('Something Went Wrong', 'Please try again.', 'error');
            }

            return;
        }

        setNotification(null);
    }

    function formatCountdown(expiry: number) {
        const seconds = Math.max(0, Math.ceil((expiry - currentTime) / 1000));
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor(seconds % 86400 / 3600);
        const minutes = Math.floor(seconds % 3600 / 60);

        return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
    }

    function formatCooldown(expiry: number) {
        const seconds = Math.max(0, Math.ceil((expiry - currentTime) / 1000));

        return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
    }

    const profileIsVerified = Boolean(verificationExpiry && verificationExpiry > currentTime);
    const firstName = worker?.fullName?.trim().split(/\s+/)[0] || 'Worker';

    useEffect(() => {
        if (!verificationExpiry && !cooldownExpiry) return;

        const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [verificationExpiry, cooldownExpiry]);

    useEffect(() => {
        if (!worker?.profileVerificationExpires) {
            setVerificationExpiry(null);
            return;
        }

        const expiry = new Date(worker.profileVerificationExpires).getTime();

        setVerificationExpiry(
            Number.isFinite(expiry) && expiry > Date.now() ? expiry : null
        );
    }, [worker?.profileVerificationExpires]);

    useEffect(() => {
        if (cooldownExpiry && cooldownExpiry <= currentTime) {
            setCooldownExpiry(null);
            showModal('Cooldown Expired', 'Your cooldown has expired. You can try requesting another OTP.', 'info');
        }
    }, [cooldownExpiry, currentTime, showModal]);

    useEffect(() => {
        function handleSessionExpired() {
            if (dashboardLoading) return;
            authenticationError();
        }

        window.addEventListener('authSessionExpired', handleSessionExpired);

        return () => window.removeEventListener('authSessionExpired', handleSessionExpired);
    }, [dashboardLoading, authenticationError]);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        if (!sidebarOpen && !notification) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;

            setSidebarOpen(false);

            if (notification && !busy) setNotification(null);
        }

        document.addEventListener('keydown', handleKeyDown);

        if (sidebarOpen) document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen, notification, busy]);

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Worker navigation">
                    <a href="../worker-dashboard/" className="logo">SKILLCONNECT</a>

                    <button
                        type="button"
                        className="menu-toggle"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open navigation menu"
                        aria-expanded={sidebarOpen}
                        aria-controls="workerSidebar"
                    >
                        <span></span><span></span><span></span>
                    </button>
                </nav>
            </header>

            <div
                className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
            />

            <aside
                className={`worker-sidebar ${sidebarOpen ? 'open' : ''}`}
                id="workerSidebar"
                aria-label="Worker dashboard navigation"
                aria-hidden={!sidebarOpen}
            >
                <div className="sidebar-header">
                    <span className="sidebar-title">Menu</span>
                    <button type="button" className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation menu">×</button>
                </div>

                <div className="sidebar-profile">
                    <div className="profile-photo-wrapper">
                        {worker?.profilePhoto
                            ? <img src={worker.profilePhoto} alt="Worker profile" className="profile-photo" />
                            : <div className="profile-photo-placeholder">👤</div>}
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <button type="button" className="nav-link active" onClick={() => setSidebarOpen(false)} aria-current="page">
                        <span className="nav-icon">🏠</span><span>Dashboard</span>
                    </button>

                    <button type="button" className="nav-link" onClick={() => navigateTo('../worker-services/')}>
                        <span className="nav-icon">🛠️</span><span>View Services</span>
                    </button>

                    <button type="button" className="nav-link" onClick={() => navigateTo('../worker-edit-profile/')}>
                        <span className="nav-icon">✏️</span><span>Edit Profile</span>
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <button type="button" className="nav-link logout-link" onClick={confirmLogout}>
                        <span className="nav-icon">↪</span><span>Logout</span>
                    </button>
                </div>
            </aside>

            <main className="dashboard" id="dashboardContent">
                <section className="dashboard-header">
                    <div className="welcome-content">
                        <h1>Welcome, <span>{firstName}</span></h1>
                        <p className="page-description">Verify your profile to connect with nearby clients.</p>
                    </div>

                    <button
                        type="button"
                        className={`verification-action-btn ${profileIsVerified ? 'verified' : ''}`}
                        onClick={confirmVerification}
                        disabled={dashboardLoading || profileIsVerified}
                    >
                        {profileIsVerified ? formatCountdown(verificationExpiry!) : 'Verify Profile'}
                    </button>
                </section>

                <section className="dashboard-section">
                    <div className="section-heading"><h2>Professional Information</h2></div>

                    <div className="information-grid">
                        <div className="information-card">
                            <span className="information-label">Total Skills</span>
                            <strong>{worker?.totalSkills ?? '—'}</strong>
                        </div>

                        <div className="information-card">
                            <span className="information-label">Total Nearby Clients</span>
                            <strong>{worker?.totalClients ?? '—'}</strong>
                        </div>
                    </div>
                </section>

                <section className="dashboard-section">
                    <div className="section-heading"><h2>Personal Information</h2></div>

                    <div className="information-grid">
                        <div className="information-card">
                            <span className="information-label">Full Name</span>
                            <strong>{worker?.fullName || '—'}</strong>
                        </div>

                        <div className="information-card">
                            <span className="information-label">Phone Number</span>
                            <strong>{worker?.phone || '—'}</strong>
                        </div>
                    </div>
                </section>

                <section className="dashboard-section">
                    <div className="section-heading"><h2>Location</h2></div>

                    <div className="information-grid">
                        <div className="information-card">
                            <span className="information-label">Latitude</span>
                            <strong>{worker?.latitude ?? '—'}</strong>
                        </div>

                        <div className="information-card">
                            <span className="information-label">Longitude</span>
                            <strong>{worker?.longitude ?? '—'}</strong>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="page-footer">
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>

            {notification && (
                <div
                    className="notification-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="notificationTitle"
                    aria-describedby="notificationText"
                    onClick={event => event.target === event.currentTarget && hideModal()}
                >
                    <div className={`notification-card ${notification.type}`}>
                        <button
                            type="button"
                            className="notification-close-button"
                            onClick={hideModal}
                            aria-label="Close notification"
                            hidden={notification.confirmation || busy}
                        >
                            ×
                        </button>

                        <div className="notification-icon" aria-hidden="true">
                            {notification.type === 'error' ? '!' : notification.type === 'info' ? 'i' : notification.type === 'confirm' ? '?' : '✓'}
                        </div>

                        <h2 id="notificationTitle">{notification.title}</h2>

                        <p id="notificationText">
                            {cooldownExpiry && cooldownExpiry > currentTime
                                ? `${notification.message}\n\n${formatCooldown(cooldownExpiry)}`
                                : notification.message}
                        </p>

                        <div className="notification-actions">
                            {notification.confirmation && (
                                <button
                                    type="button"
                                    className="notification-no-button"
                                    onClick={() => setNotification(null)}
                                    disabled={busy}
                                >
                                    No
                                </button>
                            )}

                            {!notification.buttonHidden && (
                                <button
                                    type="button"
                                    onClick={handleNotificationAction}
                                    disabled={busy}
                                >
                                    {dashboardLoading
                                        ? 'Connecting…'
                                        : otpSending
                                            ? 'Verifying…'
                                            : logoutLoading
                                                ? 'Logging Out…'
                                                : notification.buttonText}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkerDashboard;