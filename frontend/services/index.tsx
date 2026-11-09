import { useEffect, useRef, useState } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Worker {
    workerId: string | number;
    serviceId: string | number;
    fullName?: string;
    skill?: string;
    profilePhoto?: string;
}

interface Notice {
    title: string;
    message: string;
    type: 'success' | 'error';
}

function Services() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [loading, setLoading] = useState(true);
    const [skillFilter, setSkillFilter] = useState('');
    const [skillSearch, setSkillSearch] = useState('');
    const [notice, setNotice] = useState<Notice | null>(null);
    const [locationDenied, setLocationDenied] = useState(false);
    const [locationMessage, setLocationMessage] = useState('');
    const menuToggleRef = useRef<HTMLButtonElement>(null);

    function closeSidebar() {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    }

    function showNotification(message: string, type: 'success' | 'error' = 'error') {
        setNotice({
            title: type === 'success' ? 'Success' : 'Notification',
            message,
            type
        });
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

    useEffect(() => {
        if (!notice) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setNotice(null);
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [notice]);

    async function getDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
        if (!navigator.geolocation) {
            throw new Error('Your browser does not support location services.');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const { latitude, longitude } = position.coords;

                    if (
                        !Number.isFinite(latitude) ||
                        !Number.isFinite(longitude) ||
                        latitude < -90 || latitude > 90 ||
                        longitude < -180 || longitude > 180
                    ) {
                        reject(new Error('Your device returned invalid coordinates.'));
                        return;
                    }

                    resolve({ latitude, longitude });
                },
                error => {
                    let message = 'Unable to retrieve your location. Please try again.';

                    if (error.code === error.PERMISSION_DENIED) {
                        message = 'Location permission denied. Please allow location access to find nearby workers.';
                    } else if (error.code === error.POSITION_UNAVAILABLE) {
                        message = 'Your device location is currently unavailable. Please try again.';
                    } else if (error.code === error.TIMEOUT) {
                        message = 'Location request timed out. Please try again.';
                    }

                    reject(
                        error.code === error.PERMISSION_DENIED
                            ? Object.assign(new Error(message), { locationDenied: true })
                            : new Error(message)
                    );
                },
                {
                    enableHighAccuracy: false,
                    timeout: 30000,
                    maximumAge: 60000
                }
            );
        });
    }

    async function loadWorkers() {
        setLoading(true);
        setWorkers([]);
        setLocationDenied(false);
        setLocationMessage('');

        try {
            const { latitude, longitude } = await getDeviceLocation();

            const result = await API_REQUEST('/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude })
            });

            let data: { success?: boolean; message?: string; workers?: Worker[] };

            if (result && typeof (result as Response).json === 'function') {
                const response = result as Response;
                data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Unable to load nearby workers.');
                }
            } else {
                data = result as typeof data;

                if (data.success === false) {
                    throw new Error(data.message || 'Unable to load nearby workers.');
                }
            }

            if (!Array.isArray(data.workers)) {
                throw new Error('Unable to load workers. Please try again.');
            }

            setWorkers(data.workers);
        } catch (error) {
            if (
                error instanceof Error &&
                'locationDenied' in error &&
                error.locationDenied === true
            ) {
                setLocationDenied(true);
                setLocationMessage(error.message);
            } else {
                showNotification(
                    error instanceof Error
                        ? error.message
                        : 'Unable to load nearby workers.'
                );
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadWorkers();
    }, []);

    const skills = [...new Set(
        workers.map(worker => String(worker.skill || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const filteredWorkers = workers.filter(worker => {
        const skill = String(worker.skill || '').toLowerCase();

        return (
            (!skillFilter || skill === skillFilter.toLowerCase()) &&
            (!skillSearch || skill.includes(skillSearch.trim().toLowerCase()))
        );
    });

    function openWorker(worker: Worker) {
        if (!worker.workerId || worker.serviceId === undefined || worker.serviceId === null) {
            showNotification("This worker's service information is unavailable.");
            return;
        }

        sessionStorage.setItem('workerId', String(worker.workerId));
        sessionStorage.setItem('serviceId', String(worker.serviceId));
        window.location.href = '/worker-details/';
    }

    function createPhotoPlaceholder() {
        return (
            <div className="worker-photo-placeholder" aria-label="Worker photo unavailable">
                👤
            </div>
        );
    }

    return (
        <div className="services-page">
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>

                    <div className="nav-links">
                        <a href="/home/">Home</a>
                        <a href="/about/">About us</a>
                        <a href="/contact/">Contact us</a>
                        <a href="/worker-authentication/">Become a worker</a>
                    </div>

                    <button
                        ref={menuToggleRef}
                        type="button"
                        className="menu-toggle"
                        onClick={() => setSidebarOpen(true)}
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
                    <a href="/worker-authentication/" onClick={closeSidebar}>Become a worker</a>
                </nav>
            </aside>

            <main className="dashboard">
                <section className="dashboard-header">
                    <div className="welcome-content">
                        <h1>Available <span>Workers</span></h1>
                        <p className="page-description">
                            Find skilled workers near your location.
                        </p>
                    </div>
                </section>

                <section className="dashboard-section">
                    <div className="filter-bar">
                        <div className="filter-group">
                            <select
                                value={skillFilter}
                                onChange={event => setSkillFilter(event.target.value)}
                                aria-label="Filter workers by skill"
                            >
                                <option value="">All Skills</option>
                                {skills.map(skill => (
                                    <option key={skill} value={skill}>{skill}</option>
                                ))}
                            </select>
                        </div>

                        <div className="search-group">
                            <span className="search-icon" aria-hidden="true">⌕</span>
                            <input
                                type="search"
                                value={skillSearch}
                                onChange={event => setSkillSearch(event.target.value)}
                                placeholder="Search by skill name..."
                                aria-label="Search workers by skill name"
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    {loading && (
                        <div className="workers-loading" role="status" aria-live="polite">
                            <div className="loading-spinner"></div>
                            <p>Connecting…</p>
                        </div>
                    )}

                    {!loading && locationDenied && (
                        <div className="workers-empty location-permission">
                            <div className="empty-icon">📍</div>
                            <h3>Location Access Required</h3>
                            <p>{locationMessage}</p>
                            <button
                                type="button"
                                className="location-retry-button"
                                onClick={loadWorkers}
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {!loading && !locationDenied && workers.length > 0 && filteredWorkers.length > 0 && (
                        <div className="workers-container">
                            {filteredWorkers.map((worker, index) => (
                                <div
                                    className="worker-card"
                                    key={`${worker.workerId}-${worker.serviceId}-${index}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`View ${worker.fullName || 'worker'}'s service`}
                                    onClick={() => openWorker(worker)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            openWorker(worker);
                                        }
                                    }}
                                >
                                    <div className="worker-info">
                                        <h3 className="worker-name">
                                            {worker.fullName || 'Worker'}
                                        </h3>
                                        <div className="worker-details">
                                            <span className="worker-skill">
                                                {worker.skill || 'Skill not specified'}
                                            </span>
                                        </div>
                                    </div>

                                    {worker.profilePhoto ? (
                                        <img
                                            className="worker-photo"
                                            src={worker.profilePhoto}
                                            alt={`${worker.fullName || 'Worker'}'s profile`}
                                            loading="lazy"
                                            onError={event => {
                                                event.currentTarget.replaceWith(
                                                    createPhotoPlaceholder()
                                                );
                                            }}
                                        />
                                    ) : createPhotoPlaceholder()}
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !locationDenied && workers.length === 0 && (
                        <div className="workers-empty">
                            <div className="empty-icon">🔎</div>
                            <h3>No Workers Found</h3>
                            <p>No workers found within your location.</p>
                        </div>
                    )}

                    {!loading && !locationDenied && workers.length > 0 && filteredWorkers.length === 0 && (
                        <div className="workers-empty">
                            <div className="empty-icon">🔎</div>
                            <h3>No Workers Found</h3>
                            <p>
                                {skillFilter
                                    ? 'No workers found for this skill.'
                                    : 'No workers found for your search.'}
                            </p>
                        </div>
                    )}
                </section>
            </main>

            {notice && (
                <div
                    className="notification-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="notificationTitle"
                    onClick={event => {
                        if (event.target === event.currentTarget) setNotice(null);
                    }}
                >
                    <div className={`notification-card ${notice.type}`}>
                        <div className="notification-icon">
                            {notice.type === 'success' ? '✓' : '!'}
                        </div>
                        <h2 id="notificationTitle">{notice.title}</h2>
                        <p>{notice.message}</p>
                        <div className="notification-actions">
                            <button type="button" onClick={() => setNotice(null)}>
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <footer>
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>
        </div>
    );
}

export default Services;