import { useEffect, useRef, useState } from 'react';
import './style.css';

function About() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const menuToggleRef = useRef<HTMLButtonElement>(null);

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

    return (
        <>
            {/* HEADER */}
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>

                    <div className="nav-links">
                        <a href="/services/">Services</a>
                        <a href="/about/">About</a>
                        <a href="/contact/">Contact</a>
                    </div>

                    <button
                        ref={menuToggleRef}
                        className="menu-toggle"
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open navigation menu"
                        aria-expanded={sidebarOpen}
                        aria-controls="mobileSidebar"
                    >
                        <span></span><span></span><span></span>
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
                        className="sidebar-close"
                        type="button"
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
                    <a href="/worker-authentication/" onClick={closeSidebar}>Become a worker</a>
                </nav>
            </aside>

            {/* MAIN CONTENT */}
            <main>
                <section className="about-hero">
                    <div className="about-content">
                        <span className="hero-badge">About SkillConnect</span>
                        <h1>Connecting Skills <span>With Opportunities</span></h1>
                        <p>
                            SkillConnect makes it easier for clients to find skilled
                            workers nearby while helping talented workers reach more customers.
                        </p>
                    </div>
                </section>

                <section className="about-section">
                    <h2>Who We Are</h2>
                    <p className="section-intro">
                        SkillConnect is a platform designed to bring clients and skilled
                        workers together. Whether someone needs a professional or wants
                        to offer their skills, we make that connection easier.
                    </p>
                </section>

                <section className="about-section">
                    <div className="about-cards">
                        <article className="about-card">
                            <div className="about-icon">🎯</div>
                            <h3>Our Mission</h3>
                            <p>
                                To make it easier for people to find reliable skilled
                                workers while creating more opportunities for workers.
                            </p>
                        </article>

                        <article className="about-card">
                            <div className="about-icon">🌍</div>
                            <h3>Our Vision</h3>
                            <p>
                                To become a trusted platform connecting skilled workers
                                and clients across communities around the world.
                            </p>
                        </article>

                        <article className="about-card">
                            <div className="about-icon">🤝</div>
                            <h3>Our Values</h3>
                            <p>
                                We believe in trust, transparency, accessibility and
                                creating meaningful opportunities for everyone.
                            </p>
                        </article>
                    </div>
                </section>

                <section className="about-section">
                    <h2>How We Make A Difference</h2>
                    <div className="about-cards">
                        <article className="about-card">
                            <h3>For Clients</h3>
                            <p>
                                Find skilled professionals based on their services
                                and proximity to your location.
                            </p>
                        </article>

                        <article className="about-card">
                            <h3>For Workers</h3>
                            <p>
                                Showcase your skills, reach potential customers
                                and grow your opportunities.
                            </p>
                        </article>

                        <article className="about-card">
                            <h3>For Communities</h3>
                            <p>
                                Help connect local talent with people who need
                                their skills and services.
                            </p>
                        </article>
                    </div>
                </section>

                <section className="about-cta">
                    <h2>Be Part Of SkillConnect</h2>
                    <p>
                        Whether you need a skilled worker or have a skill to offer,
                        there's a place for you here.
                    </p>
                    <div className="hero-buttons">
                        <a href="/services/" className="client-btn">Find Workers</a>
                        <a href="/worker-authentication/" className="worker-btn">
                            Become a Worker
                        </a>
                    </div>
                </section>
            </main>

            {/* FOOTER */}
            <footer>
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>
        </>
    );
}

export default About;