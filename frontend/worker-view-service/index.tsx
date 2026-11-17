import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

type Review = { fullName?: string; rating?: number; review?: string; date?: string };
type Service = {
    skill?: string; experience?: string; description?: string;
    adminApproval?: string; adminResponse?: string;
    portfolios?: (string | { url?: string; secure_url?: string })[];
    ratingAndReview?: Review[];
};
type Notification = {
    title: string; message: string; type: 'success' | 'error' | 'info';
    action?: () => void; loading?: boolean;
};
type ValidationResult = { valid: boolean; message?: string };

const ENDPOINT = '/api/worker/view-service';
const SERVICES = '../worker-services/', AUTH = '../worker-authentication/', REVIEWS = '../client-view-ratings/';
const MAX_IMAGES = 3, MAX_SIZE = 10 * 1024 * 1024, MAX_WORDS = 150;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SKILLS = [
    'Swimming Instructor', 'Barber', 'Hairdresser', 'Makeup Artist', 'Tailor',
    'Fashion Designer', 'Plumber', 'Electrician', 'Painter', 'Welder', 'Carpenter',
    'Bricklayer', 'Cleaner', 'Laundry Service', 'Mechanic', 'Auto Electrician',
    'Phone Repair', 'Computer Repair', 'Graphic Designer', 'Web Developer',
    'Photographer', 'Videographer', 'Caterer', 'Baker', 'Cook', 'Event Planner',
    'Interior Decorator', 'AC Technician', 'Generator Repair', 'POP Installer',
    'Tiler', 'Furniture Maker', 'Driver', 'Tutor', 'Fitness Trainer', 'Other'
];
const EXPERIENCES = ['Less than 1 year', '1 year', '2 years', '3 years', '4 years', '5 years+'];
const wordCount = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
const redirect = (path: string) => window.location.href = path;

function WorkerViewService() {
    const [skill, setSkill] = useState('');
    const [experience, setExperience] = useState('');
    const [description, setDescription] = useState('');
    const [photos, setPhotos] = useState<(File | null)[]>([null, null, null]);
    const [previews, setPreviews] = useState<(string | null)[]>([null, null, null]);
    const [adminApproval, setAdminApproval] = useState('Under Review');
    const [adminResponse, setAdminResponse] = useState('Your service is awaiting admin review.');
    const [reviews, setReviews] = useState<Review[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);
    const previewsRef = useRef<(string | null)[]>([null, null, null]);

    const showModal = (title: string, message: string, type: Notification['type'] = 'info', action?: () => void, loading = false) =>
        setNotification({ title, message, type, action, loading });

    const closeModal = () => {
        if (notification?.loading) return;
        const action = notification?.action;
        setNotification(null);
        action?.();
    };

    const goToServices = () => {
        sessionStorage.removeItem('serviceId');
        redirect(SERVICES);
    };

    const authenticationError = () => {
        setUpdating(false);
        showModal('Authentication Required', 'Your session has expired. Please log in again.', 'error', () => redirect(AUTH));
    };

    const readResponse = async (response: Response) => {
        const text = await response.text();
        try { return text ? JSON.parse(text) : {}; }
        catch { throw new Error('The server returned an invalid response. Please try again.'); }
    };

    const validateImage = (file: File): Promise<boolean> => new Promise(resolve => {
        const url = URL.createObjectURL(file), image = new Image();
        const finish = (valid: boolean) => { URL.revokeObjectURL(url); resolve(valid); };
        image.onload = () => finish(!!image.naturalWidth && !!image.naturalHeight);
        image.onerror = () => finish(false);
        image.src = url;
    });

    const formatNumbers = (numbers: number[]) =>
        numbers.length > 1 ? `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}` : `${numbers[0]}`;

    useEffect(() => {
        let active = true;

        async function loadService() {
            showModal('Connecting...', 'Please wait while we load your service.', 'info', undefined, true);
            const serviceId = sessionStorage.getItem('serviceId');

            if (!serviceId) {
                setPageLoading(false);
                showModal('Service Not Found', 'The service ID could not be found. Please return to your services.', 'error', goToServices);
                return;
            }

            try {
                const response = await API_REQUEST(`${ENDPOINT}/${encodeURIComponent(serviceId)}`);
                if (response.status === 401) return active && authenticationError();

                const data = await readResponse(response);
                if (!response.ok) throw new Error(data.message || 'Unable to load this service.');
                if (!data.service) throw new Error('The server did not return service details.');
                if (!active) return;

                const service: Service = data.service;
                setSkill(service.skill || '');
                setExperience(service.experience || '');
                setDescription(service.description || '');
                setAdminApproval(service.adminApproval || 'Under Review');
                setAdminResponse(service.adminResponse || 'Your service is awaiting admin review.');
                setReviews(Array.isArray(service.ratingAndReview) ? service.ratingAndReview : []);

                const urls = Array.from({ length: MAX_IMAGES }, (_, i) => {
                    const item = service.portfolios?.[i];
                    return typeof item === 'string' ? item : item?.url || item?.secure_url || null;
                });

                previewsRef.current = urls;
                setPreviews(urls);
                setNotification(null);
            } catch (error) {
                if (active) showModal('Unable to Load Service', error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
            } finally {
                if (active) setPageLoading(false);
            }
        }

        loadService();
        return () => {
            active = false;
            previewsRef.current.forEach(url => url?.startsWith('blob:') && URL.revokeObjectURL(url));
        };
    }, []);

    useEffect(() => {
        if (!notification) return;
        const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && !notification.loading && closeModal();
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [notification]);

    async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>, index: number) {
        const file = event.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file), previous = previewsRef.current[index];
        if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
        previewsRef.current[index] = url;
        setPhotos(old => old.map((item, i) => i === index ? file : item));
        setPreviews([...previewsRef.current]);
        event.target.value = '';
    }

    async function validatePortfolioPhotos(): Promise<ValidationResult> {
        const decodeErrors: number[] = [], formatErrors: number[] = [], sizeErrors: number[] = [];

        await Promise.all(photos.map(async (file, index) => {
            if (!file) return;
            const number = index + 1;
            if (!IMAGE_TYPES.has(file.type)) formatErrors.push(number);
            if (file.size > MAX_SIZE) sizeErrors.push(number);
            if (!await validateImage(file)) decodeErrors.push(number);
        }));

        const errors: string[] = [];

        if (decodeErrors.length)
            errors.push(`Image decode error: please change portfolio ${formatNumbers(decodeErrors)}, and try again.`);
        if (formatErrors.length)
            errors.push(`Image format error: please change portfolio ${formatNumbers(formatErrors)}, and try again. JPG, PNG or WebP only.`);
        if (sizeErrors.length)
            errors.push(`Image size error: please change portfolio ${formatNumbers(sizeErrors)}, and try again. 10 MB max.`);

        return errors.length ? { valid: false, message: errors.join('\n\n') } : { valid: true };
    }

    async function validateServiceForm(): Promise<ValidationResult> {
        const portfolioValidation = await validatePortfolioPhotos();
        if (!portfolioValidation.valid) return portfolioValidation;

        if (!SKILLS.includes(skill)) return { valid: false, message: 'Please select a valid skill.' };
        if (!EXPERIENCES.includes(experience)) return { valid: false, message: 'Please select a valid experience level.' };
        if (!description.trim()) return { valid: false, message: 'Please describe the service you provide.' };
        if (wordCount(description) > MAX_WORDS) return { valid: false, message: 'Your description must not exceed 150 words.' };

        return { valid: true };
    }

    async function updateService(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (updating) return;

        try {
            const validation = await validateServiceForm();

            if (!validation.valid) {
                showModal(
                    validation.message?.includes('Image ') ? 'Portfolio Error' : 'Validation Error',
                    validation.message!,
                    'error'
                );
                return;
            }

            const serviceId = sessionStorage.getItem('serviceId');
            if (!serviceId) {
                showModal('Service Not Found', 'The service ID could not be found. Please return to your services.', 'error', goToServices);
                return;
            }

            setUpdating(true);

            const formData = new FormData();
            formData.append('serviceId', serviceId);
            formData.append('skill', skill.trim());
            formData.append('experience', experience.trim());
            formData.append('description', description.trim());

            photos.forEach((file, index) => {
                if (file) {
                    formData.append('portfolioPhotos', file);
                    formData.append('portfolioIndexes', String(index));
                }
            });

            const response = await API_REQUEST(`${ENDPOINT}/${encodeURIComponent(serviceId)}`, { method: 'PUT', body: formData });
            if (response.status === 401) return authenticationError();

            const data = await readResponse(response);
            if (!response.ok) throw new Error(data.message || 'Unable to update this service.');

            showModal('Service Updated', data.message || 'Your service has been updated successfully.', 'success', goToServices);
        } catch (error) {
            showModal('Update Failed', error instanceof Error ? error.message : 'Unable to update this service.', 'error');
        } finally {
            setUpdating(false);
        }
    }

    const totalReviews = reviews.length;
    const averageRating = totalReviews ? reviews.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) / totalReviews : 0;
    const roundedRating = Math.max(0, Math.min(5, Math.round(averageRating)));
    const status = adminApproval.trim().toLowerCase();
    const statusClass = status === 'approved' ? 'status-approved' : status === 'rejected' ? 'status-rejected' : 'status-in-review';

    return <>
        <header className="topbar">
            <nav className="topbar-inner" aria-label="Service navigation">
                <a href={SERVICES} className="back-navigation" onClick={() => sessionStorage.removeItem('serviceId')}>
                    <span className="back-icon" aria-hidden="true">←</span><span>Back</span>
                </a>
            </nav>
        </header>

        <main className="view-service-page">
            {!pageLoading && <>
                <section className="page-header">
                    <h1>View Service</h1>
                    <p>Keep your service you offer to clients up to date.</p>
                </section>

                <section className="service-form-section">
                    <form className="service-form" onSubmit={updateService} noValidate>
                        <div className={`admin-status-container ${statusClass}`}>
                            <h2>{adminApproval}</h2><p>{adminResponse}</p>
                        </div>

                        <div className="form-group">
                            <label htmlFor="skill" className="form-label">Skill</label>
                            <select id="skill" className="form-control" value={skill} onChange={e => setSkill(e.target.value)}>
                                <option value="" disabled>Select your skill</option>
                                {SKILLS.map(item => <option key={item}>{item}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="experience" className="form-label">Experience</label>
                            <select id="experience" className="form-control" value={experience} onChange={e => setExperience(e.target.value)}>
                                <option value="" disabled>Select your experience</option>
                                {EXPERIENCES.map(item => <option key={item}>{item}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <div className="label-row">
                                <label htmlFor="description" className="form-label">Description</label>
                                <span className={`word-counter ${wordCount(description) >= MAX_WORDS ? 'limit-reached' : ''}`}>{wordCount(description)} / 150 words</span>
                            </div>
                            <textarea id="description" className="form-control description-input" rows={7} placeholder="Describe the service you provide..." value={description} onChange={e => setDescription(e.target.value)} />
                        </div>

                        <div className="form-section-heading portfolio-heading">
                            <h2>Portfolio Images</h2><p>Update your images showing examples of your work.</p>
                        </div>

                        <div className="portfolio-grid">
                            {previews.map((preview, index) => <div className="portfolio-upload-card" key={index}>
                                <label htmlFor={`portfolioPhoto${index + 1}`} className="portfolio-upload-label">
                                    <div className="portfolio-preview">
                                        {preview ? <img src={preview} alt={`Portfolio ${index + 1}`} /> : <><span className="portfolio-placeholder">+</span><span>Add Image</span></>}
                                    </div>
                                    <input type="file" id={`portfolioPhoto${index + 1}`} className="portfolio-input" accept="image/jpeg,image/png,image/webp" onChange={e => handlePhotoChange(e, index)} />
                                </label>
                            </div>)}
                        </div>

                        <p className="portfolio-help">JPG, PNG or WebP. Maximum 10 MB per image.</p>
                        <div className="form-actions">
                            <button type="submit" className="update-service-button" disabled={updating}>{updating ? 'Updating...' : 'Update Service'}</button>
                        </div>
                    </form>
                </section>

                <section className="service-reviews-section">
                    <div className="reviews-header">
                        <h2>Ratings &amp; Reviews</h2><p>See what clients say about your service.</p>
                    </div>

                    <div className="rating-summary">
                        <div className="rating-average">
                            <span className="rating-average-number">{totalReviews ? averageRating.toFixed(1) : '—'}</span>
                            <div className="rating-summary-details">
                                <div className="rating-stars">{'★'.repeat(roundedRating)}{'☆'.repeat(5 - roundedRating)}</div>
                                <p>{totalReviews ? `${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="service-review-list" aria-live="polite">
                        {!totalReviews ? <p className="empty-service-reviews">Your customer reviews will appear here.</p> :
                            reviews.map((review, index) => {
                                const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
                                const date = review.date ? new Date(review.date) : null;
                                return <article className="service-review-item" key={index}>
                                    <div className="service-review-top">
                                        <div className="service-review-name">{review.fullName || 'Client'}</div>
                                        <div className="service-review-rating">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)} ({rating}/5)</div>
                                    </div>
                                    <p className="service-review-text">{review.review || 'No written review.'}</p>
                                    {date && Number.isFinite(date.getTime()) && <p className="service-review-date">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                                </article>;
                            })}
                    </div>

                    {totalReviews >= 3 && <button type="button" className="service-see-more-button" onClick={() => redirect(REVIEWS)}>See More</button>}
                </section>
            </>}
        </main>

        <footer className="page-footer"><p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p></footer>

        {notification && <div className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle" aria-describedby="notificationText" onClick={e => e.target === e.currentTarget && !notification.loading && closeModal()}>
            <div className={`notification-card ${notification.type}`}>
                {!notification.loading && <button type="button" className="notification-close-button" onClick={closeModal} aria-label="Close notification">×</button>}
                <div className="notification-icon" aria-hidden="true">{notification.loading ? '…' : notification.type === 'success' ? '✓' : notification.type === 'info' ? 'i' : '!'}</div>
                <h2 id="notificationTitle">{notification.title}</h2>
                <p id="notificationText">{notification.message}</p>
                {!notification.loading && <div className="notification-actions"><button type="button" onClick={closeModal}>Continue</button></div>}
            </div>
        </div>}
    </>;
}

export default WorkerViewService;