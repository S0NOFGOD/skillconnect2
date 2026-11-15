import { useCallback, useEffect, useRef, useState } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Worker {
    fullName?: string | null;
    phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    totalSkills?: number | null;
    totalClients?: number | null;
    profilePhoto?: string | null;
    profileVerificationExpires?: string | null;
}

interface DashboardResponse {
    worker?: Worker;
    message?: string;
}

interface Notification {
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'confirm';
    buttonText: string;
    action: (() => void | Promise<void>) | null;
    confirmation: boolean;
    redirect: string | null;
}

const DASHBOARD_ENDPOINT = '/api/worker/dashboard';
const SEND_PHONE_OTP_ENDPOINT = '/api/worker/send-phone-otp';
const LOGOUT_ENDPOINT = '/api/auth/logout';

function WorkerDashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [worker, setWorker] = useState<Worker | null>(null);
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState(false);
    const [verificationLabel, setVerificationLabel] = useState('Verify Profile');
    const [verified, setVerified] = useState(false);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [otpSending, setOtpSending] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);

    const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const showModal = useCallback((
        title: string,
        message: string,
        type: Notification['type'] = 'info',
        action: Notification['action'] = null,
        buttonText = 'Continue',
        confirmation = false,
        redirect: string | null = null
    ) => setNotification({ title, message, type, action, buttonText, confirmation, redirect }), []);

    const hideModal = useCallback(() => {
        if (logoutLoading || otpSending) return;
        if (cooldownTimer.current) clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
        setNotification(null);
    }, [logoutLoading, otpSending]);

    const redirectToAuthentication = useCallback(() => {
        window.location.href = '../worker-authentication/index.html';
    }, []);

    const authenticationError = useCallback((
        message = 'Your session has expired. Please log in again.'
    ) => showModal('Authentication Required', message, 'error', redirectToAuthentication), [showModal, redirectToAuthentication]);

    const closeSidebar = () => setSidebarOpen(false);
    const navigateTo = (path: string) => {
        closeSidebar();
        window.location.href = path;
    };

    const formatCooldown = (milliseconds: number) => {
        const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
        return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
    };

    const showCooldownModal = useCallback((coolDownUntil: string, message: string) => {
        if (cooldownTimer.current) clearInterval(cooldownTimer.current);

        const expiryTime = new Date(coolDownUntil).getTime();

        if (!Number.isFinite(expiryTime)) {
            showModal('Verification Cooldown', message || 'You cannot request another OTP yet.', 'error');
            return;
        }

        if (expiryTime <= Date.now()) {
            showModal('Cooldown Expired', 'Your cooldown has expired. You can try requesting another OTP.', 'info');
            return;
        }

        const updateCountdown = () => {
            const remaining = expiryTime - Date.now();

            if (remaining <= 0) {
                if (cooldownTimer.current) clearInterval(cooldownTimer.current);
                cooldownTimer.current = null;
                setNotification(previous => previous ? {
                    ...previous,
                    message: 'Your cooldown has expired. You can try requesting another OTP.'
                } : null);
                return;
            }

            setNotification(previous => previous ? {
                ...previous,
                message: `${message || 'You cannot request another OTP yet.'}\n\n${formatCooldown(remaining)}`
            } : null);
        };

        showModal('Verification Cooldown', message || 'You cannot request another OTP yet.', 'error');
        updateCountdown();
        cooldownTimer.current = setInterval(updateCountdown, 1000);
    }, [showModal]);

    const loadDashboard = useCallback(async () => {
        setDashboardLoading(true);
        showModal('Connecting', 'Connecting to your dashboard...', 'info');

        try {
            const response = await API_REQUEST(DASHBOARD_ENDPOINT, { method: 'GET' });

            if (response.status === 401) {
                setNotification(null);
                authenticationError();
                return;
            }

            const data: DashboardResponse = await response.json();

            if (!response.ok) {
                setNotification(null);
                showModal('Unable to Load Dashboard', data.message || 'Unable to load your dashboard. Please try again.', 'error');
                return;
            }

            const workerData = data.worker || {};
            setWorker(workerData);
            setProfilePhoto(workerData.profilePhoto || null);
            setPhotoError(false);
            setNotification(null);
        } catch (error) {
            console.error('Dashboard request failed:', error);
            setNotification(null);
            showModal('Connection Error', 'Unable to connect to the server. Please try again.', 'error');
        } finally {
            setDashboardLoading(false);
        }
    }, [showModal, authenticationError]);

    function checkProfileVerification(expiresAt?: string | null) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        countdownTimer.current = null;

        const expiryTime = expiresAt ? new Date(expiresAt).getTime() : NaN;

        if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
            setVerified(false);
            setVerificationLabel('Verify Profile');
            return;
        }

        setVerified(true);

        const updateCountdown = () => {
            const remaining = expiryTime - Date.now();

            if (remaining <= 0) {
                if (countdownTimer.current) clearInterval(countdownTimer.current);
                countdownTimer.current = null;
                setVerified(false);
                setVerificationLabel('Verify Profile');
                return;
            }

            const seconds = Math.floor(remaining / 1000);
            setVerificationLabel(`${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`);
        };

        updateCountdown();
        countdownTimer.current = setInterval(updateCountdown, 1000);
    }

    useEffect(() => {
        if (worker) checkProfileVerification(worker.profileVerificationExpires);
    }, [worker]);

    const sendPhoneOtp = useCallback(async () => {
        if (otpSending) return;
        setOtpSending(true);

        try {
            const response = await API_REQUEST(SEND_PHONE_OTP_ENDPOINT, { method: 'POST' });
            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                setNotification(null);
                authenticationError();
                return;
            }

            if (!response.ok) {
                setNotification(null);

                if (data.coolDownUntil) {
                    showCooldownModal(data.coolDownUntil, data.message || 'You have reached the OTP request limit.');
                    return;
                }

                showModal('Verification Error', data.message || 'Unable to send the verification code.', 'error');
                return;
            }

            if (data.phone) sessionStorage.setItem('workerPhone', data.phone);

            showModal('OTP Sent', data.message || 'A verification code has been sent to your phone.', 'success', null, 'Continue', false, '../worker-phone-otp/index.html');
        } catch (error) {
            console.error('Phone OTP request failed:', error);
            setNotification(null);
            showModal('Connection Error', 'Unable to send the verification code. Please try again.', 'error');
        } finally {
            setOtpSending(false);
        }
    }, [otpSending, authenticationError, showCooldownModal, showModal]);

    function confirmVerification() {
        if (verified || otpSending || verificationLabel !== 'Verify Profile') return;
        showModal('Verify Profile', 'Are you sure you want to verify your profile?', 'confirm', sendPhoneOtp, 'Yes', true);
    }

    const logoutWorker = useCallback(async () => {
        if (logoutLoading) return;
        setLogoutLoading(true);

        try {
            const response = await API_REQUEST(LOGOUT_ENDPOINT, { method: 'POST' });

            if (response.status === 401) {
                setNotification(null);
                authenticationError();
                return;
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setNotification(null);
                showModal('Logout Failed', data.message || 'Unable to log out. Please try again.', 'error');
                return;
            }

            redirectToAuthentication();
        } catch (error) {
            console.error('Logout request failed:', error);
            setNotification(null);
            showModal('Connection Error', 'Unable to log out at this time. Please try again.', 'error');
        } finally {
            setLogoutLoading(false);
        }
    }, [logoutLoading, authenticationError, showModal, redirectToAuthentication]);

    function confirmLogout() {
        showModal('Logout', 'Are you sure you want to log out?', 'confirm', logoutWorker, 'Yes', true);
    }

    async function handleNotificationAction() {
        if (!notification) return;
        if (notification.redirect) {
            window.location.href = notification.redirect;
            return;
        }

        if (!notification.action) {
            hideModal();
            return;
        }

        if (!['Logout', 'Verify Profile'].includes(notification.title)) hideModal();
        await notification.action();
    }

    useEffect(() => {
        function handleSessionExpired() {
            if (dashboardLoading) return;
            setNotification(null);
            authenticationError();
        }

        window.addEventListener('authSessionExpired', handleSessionExpired);
        return () => window.removeEventListener('authSessionExpired', handleSessionExpired);
    }, [authenticationError, dashboardLoading]);

    useEffect(() => {
        loadDashboard();
        return () => {
            if (countdownTimer.current) clearInterval(countdownTimer.current);
            if (cooldownTimer.current) clearInterval(cooldownTimer.current);
        };
    }, [loadDashboard]);

    useEffect(() => {
        if (!sidebarOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeSidebar();
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    const fullName = worker?.fullName?.trim() || '';
    const firstName = fullName.split(/\s+/)[0] || 'Worker';
    const displayValue = (value: unknown) => value == null || value === '' ? 'Not provided' : String(value);
    const displayCount = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value)) ? 0 : value;

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Worker navigation">
                    <a href="../worker-dashboard/" className="logo">SKILLCONNECT</a>
                    <button type="button" className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="workerSidebar">
                        <span></span><span></span><span></span>
                    </button>
                </nav>
            </header>

            <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={closeSidebar} aria-hidden="true" />

            <aside className={`worker-sidebar ${sidebarOpen ? 'open' : ''}`} id="workerSidebar" aria-label="Worker dashboard navigation" aria-hidden={sidebarOpen ? undefined : true}>
                <div className="sidebar-header">
                    <span className="sidebar-title">Menu</span>
                    <button type="button" className="sidebar-close" onClick={closeSidebar} aria-label="Close navigation menu">×</button>
                </div>

                <div className="sidebar-profile">
                    <div className="profile-photo-wrapper">
                        {profilePhoto && !photoError
                            ? <img src={profilePhoto} alt="Worker profile photo" className="profile-photo" onError={() => setPhotoError(true)} />
                            : <div className="profile-photo-placeholder" aria-hidden="true">👤</div>}
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <button type="button" className="nav-link active" onClick={closeSidebar} aria-current="page">
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
                    <button type="button" className={`verification-button ${verified ? 'verified' : ''}`} onClick={confirmVerification} disabled={dashboardLoading || otpSending || verified}>
                        {verificationLabel}
                    </button>
                </section>

                {[
                    {
                        title: 'Professional Information',
                        items: [
                            ['Total Skills', displayCount(worker?.totalSkills)],
                            ['Total Nearby Clients', displayCount(worker?.totalClients)]
                        ]
                    },
                    {
                        title: 'Personal Information',
                        items: [
                            ['Full Name', displayValue(worker?.fullName)],
                            ['Phone Number', displayValue(worker?.phone)]
                        ]
                    },
                    {
                        title: 'Location',
                        items: [
                            ['Latitude', displayValue(worker?.latitude)],
                            ['Longitude', displayValue(worker?.longitude)]
                        ]
                    }
                ].map(section => (
                    <section className="dashboard-section" key={section.title}>
                        <div className="section-heading"><h2>{section.title}</h2></div>
                        <div className="information-grid">
                            {section.items.map(([label, value]) => (
                                <div className="information-card" key={label}>
                                    <span className="information-label">{label}</span>
                                    <strong className="information-value">{value}</strong>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </main>

            <footer className="page-footer">
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>

            {notification && (
                <div className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle" aria-describedby="notificationText"
                    onClick={event => {
                        if (event.target === event.currentTarget && !logoutLoading && !otpSending) hideModal();
                    }}>
                    <div className={`notification-card ${notification.type}`}>
                        <button type="button" className="notification-close-button" onClick={hideModal} aria-label="Close notification" hidden={notification.confirmation} disabled={logoutLoading || otpSending}>×</button>
                        <div className="notification-icon" aria-hidden="true">
                            {notification.type === 'error' ? '!' : notification.type === 'info' ? 'i' : notification.type === 'confirm' ? '?' : '✓'}
                        </div>
                        <h2 id="notificationTitle">{notification.title}</h2>
                        <p id="notificationText">{notification.message}</p>
                        <div className="notification-actions">
                            <button type="button" className="cancel-button" onClick={hideModal} disabled={logoutLoading || otpSending} hidden={!notification.confirmation}>No</button>
                            <button type="button" className="confirm-button" onClick={handleNotificationAction} disabled={logoutLoading || otpSending}>
                                {logoutLoading ? 'Logging Out…' : otpSending ? 'Verifying…' : notification.buttonText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkerDashboard;