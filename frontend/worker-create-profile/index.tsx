import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

type NoticeType = 'success' | 'error' | 'info';
interface Notice { type: NoticeType; title: string; message: string }

const ENDPOINT = '/api/worker/create-profile';
const AUTH = '/worker-authentication';
const SERVICES = '/worker-services';
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function WorkerCreateProfile() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [gettingLocation, setGettingLocation] = useState(false);
    const [creating, setCreating] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [progress, setProgress] = useState(0);

    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const notificationButtonRef = useRef<HTMLButtonElement>(null);
    const modalCallback = useRef<(() => void) | null>(null);
    const photoUrlRef = useRef('');

    function showNotification(type: NoticeType, title: string, message: string, callback: (() => void) | null = null) {
        modalCallback.current = callback;
        setNotice({ type, title, message });
    }

    function closeNotification() {
        setNotice(null);
        const callback = modalCallback.current;
        modalCallback.current = null;
        callback?.();
    }

    function closeSidebar() {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    }

    useEffect(() => {
        if (!sidebarOpen) return;
        const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSidebar();
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    useEffect(() => {
        if (!notice) return;
        const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNotification();
        document.addEventListener('keydown', handleKey);
        document.body.classList.add('modal-open');
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.classList.remove('modal-open');
        };
    }, [notice]);

    useEffect(() => {
        if (notice) notificationButtonRef.current?.focus();
    }, [notice]);

    // INITIALIZE EMAIL

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const googleEmail = params.get('email');

        if (googleEmail?.trim()) {
            const email = googleEmail.trim().toLowerCase();

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                sessionStorage.removeItem('workerEmail');
                showNotification('error', 'Invalid Registration', 'The email address received from Google is invalid.', () => window.location.href = AUTH);
                return;
            }

            sessionStorage.setItem('workerEmail', email);
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (!sessionStorage.getItem('workerEmail')?.trim()) {
            showNotification('error', 'Registration Session Missing', 'Your registration session could not be found. Please register or log in again.', () => window.location.href = AUTH);
            return;
        }

        setInitialized(true);
    }, []);

    // AUTHENTICATION EXPIRY

    useEffect(() => {
        function handleSessionExpired() {
            setCreating(false);
            if (!notice) showNotification('error', 'Authentication Required', 'Your session has expired. Please log in again.', () => window.location.href = AUTH);
        }

        window.addEventListener('authSessionExpired', handleSessionExpired);
        return () => window.removeEventListener('authSessionExpired', handleSessionExpired);
    }, [notice]);

    // PROFILE PHOTO

    function validatePhoto(file: File | null) {
        if (!file) return 'Please upload your profile photo.';
        if (!TYPES.includes(file.type)) return 'Profile photo must be a JPG, PNG, or WebP image.';
        if (file.size > MAX_SIZE) return 'Profile photo must not exceed 10 MB.';
        return '';
    }

    function updatePhoto(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] || null;

        if (!file) {
            setPhoto(null);
            setPhotoPreview('');
            return;
        }

        const error = validatePhoto(file);

        if (error) {
            e.target.value = '';
            setPhoto(null);
            setPhotoPreview('');
            showNotification('error', 'Invalid Profile Photo', error);
            return;
        }

        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = URL.createObjectURL(file);
        setPhoto(file);
        setPhotoPreview(photoUrlRef.current);
    }

    useEffect(() => () => {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    }, []);

    // FORM PROGRESS

    useEffect(() => {
        const fields = [photo, fullName.trim(), phone.trim(), latitude.trim(), longitude.trim()];
        setProgress(Math.round(fields.filter(Boolean).length / fields.length * 100));
    }, [photo, fullName, phone, latitude, longitude]);

    // LOCATION

    function getWorkerLocation() {
        if (gettingLocation) return;

        if (!navigator.geolocation) {
            showNotification('error', 'Location Unavailable', 'Your browser does not support location services.');
            return;
        }

        setGettingLocation(true);

        navigator.geolocation.getCurrentPosition(
            position => {
                setLatitude(position.coords.latitude.toFixed(7));
                setLongitude(position.coords.longitude.toFixed(7));
                setGettingLocation(false);
            },
            error => {
                setGettingLocation(false);
                const messages: Record<number, string> = {
                    1: 'Location permission was denied. Please allow location access in your browser settings and try again.',
                    2: 'Your current location is unavailable. Please try again.',
                    3: 'Getting your location took too long. Please try again.'
                };
                showNotification('error', 'Location Error', messages[error.code] || 'Unable to retrieve your location. Please try again.');
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }

    // FRONTEND VALIDATION

    function validateForm(): string {
        const photoError = validatePhoto(photo);
        if (photoError) return photoError;

        const names = fullName.trim().replace(/\s+/g, ' ').split(' ');
        const namePattern = /^[A-Za-zÀ-ÿ]+(?:[-'][A-Za-zÀ-ÿ]+)*$/;

        if (names.length !== 2 || !namePattern.test(names[0]) || !namePattern.test(names[1])) {
            return 'Please enter exactly two names with a space between them, for example: Destiny Okpone.';
        }

        const cleanPhone = phone.trim().replace(/[\s\-()]/g, '');
        if (!/^0[789]\d{9}$/.test(cleanPhone) && !/^\+?234[789]\d{9}$/.test(cleanPhone)) {
            return 'Please enter a valid Nigerian phone number.';
        }

        const lat = Number(latitude);
        const lng = Number(longitude);

        if (!latitude.trim() || !longitude.trim()) return 'Please get your location before creating your profile.';
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Your latitude is invalid. Please get your location again.';
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Your longitude is invalid. Please get your location again.';

        return '';
    }

    // CREATE PROFILE

    async function createWorkerProfile(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (creating) return;

        const error = validateForm();

        if (error) {
            showNotification('error', 'Invalid Profile Information', error);
            return;
        }

        // CHANGE BUTTON FIRST

        setCreating(true);

        // GET WORKER EMAIL

        const email = sessionStorage.getItem('workerEmail');

        if (!email?.trim()) {
            setCreating(false);
            showNotification('error', 'Authentication Required', 'Your registration session could not be found. Please register or log in again.', () => window.location.href = AUTH);
            return;
        }

        // SEND PROFILE TO BACKEND

        try {
            const formData = new FormData();
            formData.append('email', email);
            formData.append('profilePhoto', photo!);
            formData.append('fullName', fullName.trim());
            formData.append('phone', phone.trim());
            formData.append('latitude', latitude.trim());
            formData.append('longitude', longitude.trim());

            const response = await API_REQUEST(ENDPOINT, {
                method: 'POST',
                body: formData
            });

            let data: { message?: string; code?: string };

            try {
                data = await response.json();
            } catch {
                data = { message: 'Something went wrong. Please try again.' };
            }

            // EMAIL NOT VERIFIED / AUTHENTICATION ERROR

            if (response.status === 401 || data.code === 'EMAIL_NOT_VERIFIED') {
                setCreating(false);
                showNotification(
                    'error',
                    data.code === 'EMAIL_NOT_VERIFIED' ? 'Email Verification Required' : 'Authentication Required',
                    data.message || 'Please verify your email address before completing your profile.',
                    () => window.location.href = AUTH
                );
                return;
            }

            // BACKEND VALIDATION ERROR

            if (!response.ok) {
                setCreating(false);
                showNotification('error', 'Unable To Create Profile', data.message || 'Unable to create your profile. Please try again.');
                return;
            }

            // SUCCESS

            sessionStorage.removeItem('workerEmail');
            setCreating(false);

            showNotification(
                'success',
                'Profile Created Successfully',
                data.message || 'Your worker profile has been completed successfully.',
                () => window.location.href = SERVICES
            );

        } catch (error) {
            console.error('Create worker profile request failed:', error);
            setCreating(false);
            showNotification('error', 'Request Failed', 'Something went wrong. Please check your internet connection and try again.');
        }
    }

    const links = [
        ['Home', '/home/'],
        ['About us', '/about/'],
        ['Contact us', '/contact/'],
        ['Find a worker', '/services/']
    ];

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>
                    <div className="nav-links">
                        {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
                    </div>
                    <button ref={menuToggleRef} type="button" className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="mobileSidebar">
                        <span></span><span></span><span></span>
                    </button>
                </nav>
            </header>

            <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={closeSidebar} aria-hidden="true" />

            <aside className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`} id="mobileSidebar" aria-label="Mobile navigation" aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
                <div className="sidebar-header">
                    <span className="sidebar-title">Menu</span>
                    <button type="button" className="sidebar-close" onClick={closeSidebar} aria-label="Close navigation menu">×</button>
                </div>
                <nav className="sidebar-links">
                    {links.map(([label, href]) => <a key={href} href={href} onClick={closeSidebar}>{label}</a>)}
                </nav>
            </aside>

            {initialized && (
                <main className="profile-page">
                    <section className="profile-section">
                        <div className="profile-card">
                            <div className="profile-header">
                                <span className="profile-badge">Worker Profile</span>
                                <h1>Create Your Profile</h1>
                                <p>Tell clients about yourself and the services you offer.</p>
                            </div>

                            <div className="progress-container">
                                <div className="progress-info">
                                    <span>Profile completion</span>
                                    <span id="progressPercentage">{progress}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                                </div>
                            </div>

                            <form className="profile-form" onSubmit={createWorkerProfile} noValidate>
                                <div className="form-section">
                                    <div className="section-heading">
                                        <h2>Profile Photo</h2>
                                        <p>Upload a clear photo clients can use to recognize you.</p>
                                    </div>
                                    <div className="profile-photo-container">
                                        <label htmlFor="profilePhoto" className="profile-photo-upload-label">
                                            <div className="profile-photo-preview">
                                                {!photoPreview && <><span className="profile-photo-placeholder">+</span><span className="profile-photo-add-text">Add Image</span></>}
                                                {photoPreview && <img src={photoPreview} alt="Profile photo preview" />}
                                            </div>
                                        </label>
                                        <input type="file" id="profilePhoto" name="profilePhoto" className="profile-photo-input" accept="image/jpeg,image/png,image/webp" onChange={updatePhoto} />
                                    </div>
                                    <small className="profile-photo-help">JPG, PNG, or WebP. Maximum file size: 10 MB.</small>
                                </div>

                                <div className="form-section">
                                    <div className="section-heading">
                                        <h2>Personal Information</h2>
                                        <p>Basic information clients will see.</p>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="fullName">Full Name</label>
                                        <input type="text" id="fullName" placeholder="Enter your first and last name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="phone">Phone Number</label>
                                        <input type="tel" id="phone" placeholder="Enter your phone number" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
                                    </div>
                                </div>

                                <div className="form-section">
                                    <div className="section-heading"><h2>Location Information</h2></div>
                                    <div className="form-group">
                                        <button type="button" className="get-location-btn" onClick={getWorkerLocation} disabled={gettingLocation}>
                                            {gettingLocation ? 'Getting Location...' : 'Get My Location'}
                                        </button>
                                        <small className="location-help">Tap the button and allow location access when your browser asks for permission.</small>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="latitude">Latitude</label>
                                        <input type="text" id="latitude" placeholder="Latitude will appear here" value={latitude} readOnly required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="longitude">Longitude</label>
                                        <input type="text" id="longitude" placeholder="Longitude will appear here" value={longitude} readOnly required />
                                    </div>
                                </div>

                                <button type="submit" className={`continue-btn ${creating ? 'loading' : ''}`} disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Profile'}
                                </button>
                            </form>
                        </div>
                    </section>
                </main>
            )}

            {notice && (
                <div className="notification-overlay">
                    <div className={`notification-card ${notice.type}`} role="alertdialog" aria-modal="true" aria-labelledby="notificationTitle" aria-describedby="notificationText">
                        <div className="notification-icon">{notice.type === 'success' ? '✓' : notice.type === 'error' ? '!' : 'i'}</div>
                        <h2 id="notificationTitle">{notice.title}</h2>
                        <p id="notificationText">{notice.message}</p>
                        <button ref={notificationButtonRef} type="button" className="notification-button" onClick={closeNotification}>Continue</button>
                    </div>
                </div>
            )}

            <footer><p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p></footer>
        </>
    );
}

export default WorkerCreateProfile;