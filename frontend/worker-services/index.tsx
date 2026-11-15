import { useCallback, useEffect, useState } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface WorkerService {
    id: string;
    skill: string;
    date: string;
    adminApproval: string;
}

interface Notification {
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'confirm';
    buttonText: string;
    action: (() => void) | null;
    confirmation: boolean;
}

interface ServicesResponse {
    profilePhoto?: string | null;
    services?: WorkerService[] | null;
    message?: string;
}

const SERVICES_ENDPOINT = '/api/worker/services';
const LOGOUT_ENDPOINT = '/api/auth/logout';

function WorkerServices() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [services, setServices] = useState<WorkerService[]>([]);
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);

    const showModal = useCallback((
        title: string,
        message: string,
        type: Notification['type'] = 'info',
        action: (() => void) | null = null,
        buttonText = 'Continue',
        confirmation = false
    ) => {
        setNotification({
            title,
            message,
            type,
            action,
            buttonText,
            confirmation
        });
    }, []);

    function hideModal() {
        if (!logoutLoading) {
            setNotification(null);
        }
    }

    function handleNotificationAction() {
        const action = notification?.action;

        if (action) {
            action();
        } else {
            hideModal();
        }
    }

    const redirectToLogin = useCallback(() => {
        window.location.href = '../worker-authentication/index.html';
    }, []);

    const authenticationError = useCallback((
        message = 'Your session has expired. Please log in again.'
    ) => {
        setServicesLoading(false);
        showModal(
            'Authentication Required',
            message,
            'error',
            redirectToLogin
        );
    }, [showModal, redirectToLogin]);

    const loadServices = useCallback(async () => {
        setServicesLoading(true);

        try {
            const response = await API_REQUEST(
                SERVICES_ENDPOINT,
                { method: 'GET' }
            );

            if (response.status === 401) {
                authenticationError();
                return;
            }

            const data: ServicesResponse = await response.json();

            if (!response.ok) {
                showModal(
                    'Unable to Load Services',
                    data.message || 'Unable to load your services. Please try again.',
                    'error'
                );
                return;
            }

            setProfilePhoto(data.profilePhoto || null);

            const loadedServices = Array.isArray(data.services)
                ? [...data.services]
                : [];

            loadedServices.sort((a, b) => {
                const aDate = new Date(a.date).getTime();
                const bDate = new Date(b.date).getTime();

                return (
                    (Number.isFinite(bDate) ? bDate : 0) -
                    (Number.isFinite(aDate) ? aDate : 0)
                );
            });

            setServices(loadedServices);

        } catch (error) {
            console.error('Services request failed:', error);

            showModal(
                'Connection Error',
                'Unable to connect to the server. Please try again.',
                'error'
            );

        } finally {
            setServicesLoading(false);
        }
    }, [showModal, authenticationError]);

    function formatServiceDate(dateValue: string) {
        if (!dateValue) return 'Date unavailable';

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return 'Date unavailable';
        }

        return date.toLocaleDateString('en-NG', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function openService(serviceId: string) {
        if (!serviceId) {
            showModal(
                'Service Error',
                'This service could not be opened.',
                'error'
            );
            return;
        }

        sessionStorage.setItem('serviceId', String(serviceId));

        window.location.href = '../worker-view-service/';
    }

    function closeSidebar() {
        setSidebarOpen(false);
    }

    function navigateTo(path: string) {
        closeSidebar();
        window.location.href = path;
    }

    async function logoutWorker() {
        setLogoutLoading(true);

        try {
            const response = await API_REQUEST(
                LOGOUT_ENDPOINT,
                { method: 'POST' }
            );

            if (response.status === 401) {
                setLogoutLoading(false);
                authenticationError();
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                setLogoutLoading(false);

                showModal(
                    'Logout Failed',
                    data.message || 'Unable to log out. Please try again.',
                    'error'
                );

                return;
            }

            window.location.href = '../worker-authentication/index.html';

        } catch (error) {
            console.error('Logout request failed:', error);

            setLogoutLoading(false);

            showModal(
                'Connection Error',
                'Unable to log out at this time. Please try again.',
                'error'
            );
        }
    }

    function confirmLogout() {
        showModal(
            'Logout',
            'Are you sure you want to log out?',
            'confirm',
            logoutWorker,
            'Yes',
            true
        );
    }

    useEffect(() => {
        function handleSessionExpired() {
            setServicesLoading(false);
            setLogoutLoading(false);
            setNotification(null);

            authenticationError();
        }

        window.addEventListener(
            'authSessionExpired',
            handleSessionExpired
        );

        return () => {
            window.removeEventListener(
                'authSessionExpired',
                handleSessionExpired
            );
        };
    }, [authenticationError]);

    useEffect(() => {
        if (!sidebarOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                closeSidebar();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    useEffect(() => {
        loadServices();
    }, [loadServices]);

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Worker navigation">
                    <a href="../worker-dashboard/" className="logo">
                        SKILLCONNECT
                    </a>

                    <button
                        type="button"
                        className="menu-toggle"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open navigation menu"
                        aria-expanded={sidebarOpen}
                        aria-controls="workerSidebar"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </nav>
            </header>

            <div
                className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
                onClick={closeSidebar}
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

                    <button
                        type="button"
                        className="sidebar-close"
                        onClick={closeSidebar}
                        aria-label="Close navigation menu"
                    >
                        ×
                    </button>
                </div>

                <div className="sidebar-profile">
                    <div className="profile-photo-wrapper">
                        {profilePhoto ? (
                            <img
                                src={profilePhoto}
                                alt="Worker profile"
                                className="profile-photo"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%'
                                }}
                            />
                        ) : (
                            <div
                                className="profile-photo-placeholder"
                                aria-hidden="true"
                            >
                                👤
                            </div>
                        )}
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <button
                        type="button"
                        className="nav-link"
                        onClick={() => navigateTo('../worker-dashboard/')}
                    >
                        <span className="nav-icon">🏠</span>
                        <span>Dashboard</span>
                    </button>

                    <button
                        type="button"
                        className="nav-link active"
                        onClick={closeSidebar}
                    >
                        <span className="nav-icon">🛠️</span>
                        <span>View Services</span>
                    </button>

                    <button
                        type="button"
                        className="nav-link"
                        onClick={() => navigateTo('../worker-edit-profile/')}
                    >
                        <span className="nav-icon">✏️</span>
                        <span>Edit Profile</span>
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <button
                        type="button"
                        className="nav-link logout-link"
                        onClick={confirmLogout}
                    >
                        <span className="nav-icon">↪</span>
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <main className="dashboard" id="servicesPage">
                <section className="dashboard-header">
                    <div>
                        <h1>My Services</h1>
                        <p className="page-description">
                            Manage the services you offer to clients
                        </p>
                    </div>

                    <button
                        type="button"
                        className="add-service-btn"
                        onClick={() => navigateTo('../worker-create-service/')}
                    >
                        Add A Service
                    </button>
                </section>

                <section className="dashboard-section">
                    <div className="section-heading">
                        <h2>Your Services</h2>
                    </div>

                    {servicesLoading && (
                        <div className="services-loading">
                            <div
                                className="loading-spinner"
                                aria-hidden="true"
                            />
                            <p>Connecting…</p>
                        </div>
                    )}

                    {!servicesLoading && services.length > 0 && (
                        <div className="services-container">
                            {services.map(service => {
                                const status = String(
                                    service.adminApproval || ''
                                ).toLowerCase();

                                const approvalClass =
                                    status === 'approved'
                                        ? 'approved'
                                        : status === 'rejected'
                                            ? 'rejected'
                                            : 'in-review';

                                return (
                                    <article
                                        key={service.id}
                                        className="service-card"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`View ${service.skill || 'service'}`}
                                        onClick={() => openService(service.id)}
                                        onKeyDown={event => {
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            ) {
                                                event.preventDefault();
                                                openService(service.id);
                                            }
                                        }}
                                    >
                                        <strong className="service-skill">
                                            {service.skill || 'Service'}
                                        </strong>

                                        <div className="service-info">
                                            <span className="service-date">
                                                {formatServiceDate(service.date)}
                                            </span>

                                            <span
                                                className={`service-approval ${approvalClass}`}
                                            >
                                                {service.adminApproval || 'Under Review'}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {!servicesLoading && services.length === 0 && (
                        <div className="services-empty">
                            <div
                                className="empty-icon"
                                aria-hidden="true"
                            >
                                🛠️
                            </div>

                            <h3>No Services Yet</h3>

                            <p>
                                Your services will be shown here
                            </p>
                        </div>
                    )}
                </section>
            </main>

            <footer className="page-footer">
                <p>
                    © {new Date().getFullYear()} SkillConnect. All rights reserved.
                </p>
            </footer>

            {notification && (
                <div
                    className="notification-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="notificationTitle"
                    aria-describedby="notificationText"
                    onClick={event => {
                        if (event.target === event.currentTarget) {
                            hideModal();
                        }
                    }}
                >
                    <div
                        className={`notification-card ${notification.type}`}
                    >
                        <button
                            type="button"
                            className="notification-close-button"
                            onClick={hideModal}
                            aria-label="Close notification"
                            hidden={notification.confirmation}
                        >
                            ×
                        </button>

                        <div
                            className="notification-icon"
                            aria-hidden="true"
                        >
                            {notification.type === 'error'
                                ? '!'
                                : notification.type === 'info'
                                    ? 'i'
                                    : notification.type === 'confirm'
                                        ? '?'
                                        : '✓'}
                        </div>

                        <h2 id="notificationTitle">
                            {notification.title}
                        </h2>

                        <p id="notificationText">
                            {notification.message}
                        </p>

                        <div className="notification-actions">
                            <button
                                type="button"
                                className="notification-no-button"
                                onClick={hideModal}
                                disabled={logoutLoading}
                                hidden={!notification.confirmation}
                            >
                                No
                            </button>

                            <button
                                type="button"
                                onClick={handleNotificationAction}
                                disabled={logoutLoading}
                            >
                                {logoutLoading
                                    ? 'Logging Out…'
                                    : notification.buttonText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkerServices;