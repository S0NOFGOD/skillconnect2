import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Notification {
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    action: (() => void) | null;
}

interface ValidationResult {
    valid: boolean;
    message?: string;
}

const CREATE_SERVICE_ENDPOINT = '/api/worker/create-service';
const DASHBOARD_REDIRECT = '../worker-dashboard/';
const AUTHENTICATION_REDIRECT = '../worker-authentication/';
const SERVICES_REDIRECT = '../worker-services/';
const MAX_DESCRIPTION_WORDS = 150;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp'
]);

const LOCAL_SKILLS = [
    'Swimming Instructor', 'Barber', 'Hairdresser', 'Makeup Artist',
    'Tailor', 'Bricklayer', 'Plumber', 'Electrician', 'Painter', 'Welder',
    'Carpenter', 'Cleaner', 'Laundry Service', 'Mechanic', 'Auto Electrician',
    'Phone Repair', 'Computer Repair', 'Graphic Designer', 'Web Developer',
    'Photographer', 'Videographer', 'Caterer', 'Baker', 'Cook', 'Event Planner',
    'Interior Decorator', 'AC Technician', 'Generator Repair', 'POP Installer',
    'Tiler', 'Furniture Maker', 'Driver', 'Tutor', 'Fitness Trainer', 'Other'
];

const EXPERIENCES = [
    'Less than 1 year', '1 year', '2 years', '3 years', '4 years', '5 years+'
];

function WorkerCreateService() {
    const [skill, setSkill] = useState('');
    const [experience, setExperience] = useState('');
    const [description, setDescription] = useState('');
    const [photos, setPhotos] = useState<(File | null)[]>([null, null, null]);
    const [previews, setPreviews] = useState<(string | null)[]>([null, null, null]);
    const [addingService, setAddingService] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);

    const previewsRef = useRef<(string | null)[]>([null, null, null]);

    const redirectTo = (path: string) => window.location.href = path;

    const getWordCount = (value: string) =>
        value.trim() ? value.trim().split(/\s+/).length : 0;

    function showModal(
        title: string,
        message: string,
        type: Notification['type'] = 'info',
        action: (() => void) | null = null
    ) {
        setNotification({ title, message, type, action });
    }

    function closeModal() {
        const action = notification?.action;
        setNotification(null);
        action?.();
    }

    function authenticationError(
        message = 'Your session has expired or is invalid. Please log in again.'
    ) {
        setAddingService(false);
        showModal(
            'Authentication Required',
            message,
            'error',
            () => redirectTo(AUTHENTICATION_REDIRECT)
        );
    }

    function validateImageIntegrity(file: File): Promise<boolean> {
        return new Promise(resolve => {
            const image = new Image();
            const url = URL.createObjectURL(file);

            function finish(valid: boolean) {
                URL.revokeObjectURL(url);
                resolve(valid);
            }

            image.onload = () => finish(
                !!image.naturalWidth && !!image.naturalHeight
            );

            image.onerror = () => finish(false);
            image.src = url;
        });
    }

    async function handlePhotoChange(
        event: ChangeEvent<HTMLInputElement>,
        index: number
    ) {
        const file = event.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        if (previewsRef.current[index])
            URL.revokeObjectURL(previewsRef.current[index]!);

        previewsRef.current[index] = url;

        setPhotos(previous =>
            previous.map((photo, i) => i === index ? file : photo)
        );

        setPreviews([...previewsRef.current]);
    }

    useEffect(() => {
        return () => {
            previewsRef.current.forEach(url => url && URL.revokeObjectURL(url));
        };
    }, []);

    async function validatePortfolioPhotos(): Promise<ValidationResult> {
        const decodeErrors: number[] = [];
        const formatErrors: number[] = [];
        const sizeErrors: number[] = [];
        const missingPhotos: number[] = [];

        await Promise.all(photos.map(async (file, index) => {
            const number = index + 1;

            if (!file) {
                missingPhotos.push(number);
                return;
            }

            if (!ALLOWED_IMAGE_TYPES.has(file.type))
                formatErrors.push(number);

            if (file.size > MAX_IMAGE_SIZE)
                sizeErrors.push(number);

            if (!await validateImageIntegrity(file))
                decodeErrors.push(number);
        }));

        const formatNumbers = (numbers: number[]) =>
            numbers.length > 1
                ? `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`
                : `${numbers[0]}`;

        const errors: string[] = [];

        if (decodeErrors.length)
            errors.push(
                `Image decode error: please change portfolio ${formatNumbers(decodeErrors)}, and try again.`
            );

        if (formatErrors.length)
            errors.push(
                `Image format error: please change portfolio ${formatNumbers(formatErrors)}, and try again. JPG, PNG or WebP only.`
            );

        if (sizeErrors.length)
            errors.push(
                `Image size error: please change portfolio ${formatNumbers(sizeErrors)}, and try again. 10 MB max.`
            );

        if (missingPhotos.length)
            errors.push(
                `Please select portfolio ${formatNumbers(missingPhotos)}, and try again.`
            );

        return errors.length
            ? { valid: false, message: errors.join('\n\n') }
            : { valid: true };
    }

    async function validateServiceForm(): Promise<ValidationResult> {
        const portfolioValidation = await validatePortfolioPhotos();

        if (!portfolioValidation.valid)
            return portfolioValidation;

        if (!skill.trim())
            return { valid: false, message: 'Please select your skill.' };

        if (!experience.trim())
            return { valid: false, message: 'Please select your experience.' };

        if (!description.trim())
            return {
                valid: false,
                message: 'Please enter a description for the service.'
            };

        if (getWordCount(description) > MAX_DESCRIPTION_WORDS)
            return {
                valid: false,
                message: 'Your service description cannot contain more than 150 words.'
            };

        return { valid: true };
    }

    async function createService(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (addingService) return;

        try {
            const validation = await validateServiceForm();

            if (!validation.valid) {
                showModal(
                    photos.some(photo => !photo) ||
                    validation.message?.includes('Image ')
                        ? 'Portfolio Error'
                        : 'Invalid Service',
                    validation.message!,
                    'error'
                );
                return;
            }

            setAddingService(true);

            const formData = new FormData();

            formData.append('skill', skill.trim());
            formData.append('experience', experience.trim());
            formData.append('description', description.trim());

            photos.forEach(photo => {
                if (photo) formData.append('portfolioPhotos', photo);
            });

            const response = await API_REQUEST(CREATE_SERVICE_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            if (response.status === 401) {
                authenticationError();
                return;
            }

            if (!response.ok) {
                let message = 'Something went wrong. Please try again.';

                try {
                    const data = await response.json();
                    message = data.message || data.error || data.errorMessage || data.msg || message;
                } catch {
                    message = 'The server returned an unexpected response. Please try again.';
                }

                const verificationRequired = response.status === 403;

                showModal(
                    verificationRequired
                        ? 'Profile Verification Required'
                        : 'Unable To Create Service',
                    message,
                    'error',
                    verificationRequired
                        ? () => redirectTo(DASHBOARD_REDIRECT)
                        : null
                );

                return;
            }

            let message = 'Your service has been added successfully.';

            try {
                const data = await response.json();
                if (data.message) message = data.message;
            } catch {}

            showModal(
                'Service Added',
                message,
                'success',
                () => redirectTo(SERVICES_REDIRECT)
            );

        } catch (error) {
            console.error('Create service request failed:', error);

            showModal(
                'Request Failed',
                error instanceof Error && error.name === 'AbortError'
                    ? 'The request took too long. Please try again.'
                    : 'Unable to connect to the server. Please check your internet connection and try again.',
                'error'
            );

        } finally {
            setAddingService(false);
        }
    }

    useEffect(() => {
        const handleSessionExpired = () => authenticationError();

        window.addEventListener('authSessionExpired', handleSessionExpired);

        return () => window.removeEventListener(
            'authSessionExpired',
            handleSessionExpired
        );
    }, []);

    useEffect(() => {
        if (!notification) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') closeModal();
        }

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [notification]);

    return (
        <>
            <header className="topbar">
                <nav className="topbar-inner" aria-label="Service navigation">
                    <a
                        href="../worker-services/"
                        className="back-navigation"
                        aria-label="Go back to Worker Services"
                    >
                        <span className="back-icon" aria-hidden="true">←</span>
                        <span>Back</span>
                    </a>
                </nav>
            </header>

            <main className="create-service-page">
                <section className="page-header">
                    <h1>Create A Service</h1>
                    <p>Create a service so clients can discover what you offer.</p>
                </section>

                <section className="service-form-section">
                    <form className="service-form" onSubmit={createService} noValidate>
                        <div className="form-group">
                            <label htmlFor="skill" className="form-label">Skill</label>
                            <select
                                id="skill"
                                className="form-control"
                                value={skill}
                                onChange={event => setSkill(event.target.value)}
                                required
                            >
                                <option value="" disabled>Select your skill</option>
                                {LOCAL_SKILLS.map(item => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="experience" className="form-label">Experience</label>
                            <select
                                id="experience"
                                className="form-control"
                                value={experience}
                                onChange={event => setExperience(event.target.value)}
                                required
                            >
                                <option value="" disabled>Select your experience</option>
                                {EXPERIENCES.map(item => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="description" className="form-label">
                                Description
                            </label>

                            <textarea
                                id="description"
                                className="form-control description-input"
                                rows={7}
                                placeholder="Describe the service you provide..."
                                value={description}
                                onChange={event => setDescription(event.target.value)}
                                required
                            />

                            <span className={`word-counter ${
                                getWordCount(description) >= MAX_DESCRIPTION_WORDS
                                    ? 'limit-reached'
                                    : ''
                            }`}>
                                {getWordCount(description)} / 150 words
                            </span>
                        </div>

                        <div className="form-section-heading portfolio-heading">
                            <h2>Portfolio Images</h2>
                            <p>Add 3 images showing examples of your work.</p>
                        </div>

                        <div className="portfolio-grid">
                            {photos.map((photo, index) => (
                                <div className="portfolio-upload-card" key={index}>
                                    <label
                                        htmlFor={`portfolioPhoto${index + 1}`}
                                        className="portfolio-upload-label"
                                    >
                                        <div className="portfolio-preview">
                                            {previews[index] ? (
                                                <img
                                                    src={previews[index]!}
                                                    alt={`Portfolio preview ${index + 1}`}
                                                />
                                            ) : (
                                                <>
                                                    <span className="portfolio-placeholder">+</span>
                                                    <span>Add Image</span>
                                                </>
                                            )}
                                        </div>

                                        <input
                                            type="file"
                                            id={`portfolioPhoto${index + 1}`}
                                            className="portfolio-input"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={event => handlePhotoChange(event, index)}
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>

                        <div className="form-actions">
                            <button
                                type="submit"
                                className="add-service-button"
                                disabled={addingService}
                            >
                                {addingService ? 'Creating...' : 'Create Service'}
                            </button>
                        </div>
                    </form>
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
                    onClick={event =>
                        event.target === event.currentTarget && closeModal()
                    }
                >
                    <div className={`notification-card ${notification.type}`}>
                        <button
                            type="button"
                            className="notification-close-button"
                            onClick={closeModal}
                            aria-label="Close notification"
                        >
                            ×
                        </button>

                        <div className="notification-icon" aria-hidden="true">
                            {notification.type === 'error'
                                ? '!'
                                : notification.type === 'info'
                                    ? 'i'
                                    : '✓'}
                        </div>

                        <h2 id="notificationTitle">{notification.title}</h2>
                        <p id="notificationText">{notification.message}</p>

                        <div className="notification-actions">
                            <button type="button" onClick={closeModal}>
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkerCreateService;