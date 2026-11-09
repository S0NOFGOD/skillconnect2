import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_ENDPOINT } from '../config';
import './style.css';

function Contact() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [formMessage, setFormMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [invalidField, setInvalidField] = useState('');
    const [modal, setModal] = useState({
        open: false,
        title: '',
        message: '',
        success: false
    });

    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const sidebarCloseRef = useRef<HTMLButtonElement>(null);
    const modalContinueRef = useRef<HTMLButtonElement>(null);
    const lastFocusedRef = useRef<HTMLElement | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    function openSidebar() {
        setSidebarOpen(true);
    }

    function closeSidebar() {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    }

    function showModal(title: string, message: string, success = false) {
        lastFocusedRef.current = document.activeElement as HTMLElement;
        setModal({ open: true, title, message, success });
    }

    function closeModal() {
        setModal({ open: false, title: '', message: '', success: false });
        lastFocusedRef.current?.focus();
    }

    useEffect(() => {
        if (sidebarOpen) sidebarCloseRef.current?.focus();
    }, [sidebarOpen]);

    useEffect(() => {
        document.body.style.overflow =
            sidebarOpen || modal.open ? 'hidden' : '';

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;

            if (modal.open) {
                closeModal();
            } else if (sidebarOpen) {
                closeSidebar();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [sidebarOpen, modal.open]);

    useEffect(() => {
        if (modal.open) modalContinueRef.current?.focus();
    }, [modal.open]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isSending) return;

        const form = formRef.current;
        if (!form) return;

        const formData = new FormData(form);
        const email = String(formData.get('email') || '').trim();
        const message = String(formData.get('message') || '').trim();

        setInvalidField('');

        let error = '';
        let field = '';

        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            error = 'Please enter a valid email address.';
            field = 'email';
        } else if (!message || message.length > 5000) {
            error = 'Please enter a message of 1–5,000 characters.';
            field = 'message';
        }

        if (field) {
            setInvalidField(field);
            showModal('Please check your details', error);
            return;
        }

        setIsSending(true);
        setFormMessage('');
        setMessageType('');

        try {
            const response = await fetch(API_ENDPOINT('/api/contact'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, message })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.message || 'Unable to send your message. Please try again.'
                );
            }

            form.reset();

            const successMessage =
                result.message || 'Thank you for contacting SkillConnect. We will get back to you soon.';

            setFormMessage(result.message || 'Your message was sent successfully.');
            setMessageType('success');

            showModal('Message Sent Successfully!', successMessage, true);

        } catch (error) {
            showModal(
                'Message Not Sent',
                error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please check your connection and try again.'
            );
        } finally {
            setIsSending(false);
        }
    }

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>

                    <div className="nav-links">
                        <a href="/home/">Home</a>
                        <a href="/about/">About</a>
                        <a href="/services/">Find a worker</a>
                        <a href="/worker-authentication/">Become a worker</a>
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
                        ref={sidebarCloseRef}
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
                    <a href="/about/" onClick={closeSidebar}>About</a>
                    <a href="/services/" onClick={closeSidebar}>Find a worker</a>
                    <a href="/worker-authentication/" onClick={closeSidebar}>
                        Become a worker
                    </a>
                </nav>
            </aside>

            <main>
                <section className="hero">
                    <div className="hero-content">
                        <span className="hero-badge">Contact SkillConnect</span>
                        <h1>Let's <span>Connect</span> Together</h1>
                        <p>
                            Have questions, suggestions, or need support?
                            We're always ready to help you.
                        </p>
                    </div>
                </section>

                <section className="section">
                    <h2>Contact Information</h2>

                    <div className="cards">
                        <article className="card">
                            <div className="icon">📧</div>
                            <h3>Email</h3>
                            <p>support@skillconnect.com</p>
                        </article>

                        <article className="card">
                            <div className="icon">📞</div>
                            <h3>Phone</h3>
                            <p>+234 800 000 0000</p>
                        </article>

                        <article className="card">
                            <div className="icon">📍</div>
                            <h3>Location</h3>
                            <p>Nigeria</p>
                        </article>
                    </div>
                </section>

                <section className="section">
                    <h2>Send Us A Message</h2>

                    <form
                        ref={formRef}
                        className="contact-form"
                        onSubmit={handleSubmit}
                        noValidate
                    >
                        <div className="form-group">
                            <label htmlFor="email">Your Email</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="Enter your email"
                                autoComplete="email"
                                className={invalidField === 'email' ? 'invalid' : ''}
                                onChange={() => setInvalidField('')}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="message">Your Message</label>
                            <textarea
                                id="message"
                                name="message"
                                rows={6}
                                placeholder="Write your message..."
                                className={invalidField === 'message' ? 'invalid' : ''}
                                onChange={() => setInvalidField('')}
                                required
                            />
                        </div>

                        <div className={`form-message ${messageType}`} role="status">
                            {formMessage}
                        </div>

                        <button type="submit" disabled={isSending}>
                            {isSending ? 'Sending…' : 'Send Message'}
                        </button>
                    </form>
                </section>

                <section className="section">
                    <h2>How Can We Help?</h2>

                    <div className="cards">
                        <article className="card">
                            <h3>For Clients</h3>
                            <p>
                                Need help finding skilled workers or making bookings?
                                Our support team is ready to assist you.
                            </p>
                        </article>

                        <article className="card">
                            <h3>For Workers</h3>
                            <p>
                                Need help with your service, verification, or profile?
                                We're here for you.
                            </p>
                        </article>

                        <article className="card">
                            <h3>Platform Support</h3>
                            <p>
                                Report bugs, ask questions, or send us suggestions
                                to improve SkillConnect.
                            </p>
                        </article>
                    </div>
                </section>

                <section className="cta">
                    <h2>Ready To Get Started?</h2>
                    <p>
                        Join SkillConnect today and connect with trusted workers
                        or new customers.
                    </p>

                    <div className="hero-buttons">
                        <a href="/services/" className="client-btn">Find a worker</a>
                        <a href="/worker-authentication/" className="worker-btn">
                            Become a worker
                        </a>
                    </div>
                </section>
            </main>

            <footer>
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>

            {modal.open && (
                <div
                    className={`contact-modal ${modal.success ? 'success' : ''}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modalTitle"
                    aria-describedby="modalText"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) closeModal();
                    }}
                >
                    <div className="modal-box">
                        <div className="modal-icon" aria-hidden="true">
                            {modal.success ? '✓' : '!'}
                        </div>

                        <h2 id="modalTitle">{modal.title}</h2>
                        <p id="modalText">{modal.message}</p>

                        <button
                            ref={modalContinueRef}
                            type="button"
                            onClick={closeModal}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default Contact;