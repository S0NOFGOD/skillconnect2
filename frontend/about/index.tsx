import { useEffect, useRef, useState } from 'react';
import './style.css';

// ==========================
// ABOUT PAGE
// ==========================

function About() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const menuToggleRef = useRef<HTMLButtonElement>(null);

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

    // ==========================
    // REVEAL ANIMATIONS
    // ==========================

    useEffect(() => {
        const revealElements = document.querySelectorAll('.reveal');

        if (!('IntersectionObserver' in window)) {
            revealElements.forEach((element) => {
                element.classList.add('show');
            });

            return;
        }

        const observer = new IntersectionObserver(
            (entries, currentObserver) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('show');
                        currentObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        revealElements.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, []);

    return (
        <>
            {/* ==========================
                HEADER AND NAVIGATION
            ========================== */}

            <header className="header">
                <nav className="navbar" aria-label="Main navigation">

                    <a href="/" className="logo">
                        SKILLCONNECT
                    </a>

                    <div className="nav-links">
                        <a href="/home/" aria-current="page">Home</a>
                        <a href="/contact/">Contact</a>
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


            {/* ==========================
                MOBILE SIDEBAR
            ========================== */}

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

                    <span className="sidebar-title">
                        Menu
                    </span>

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

                    <a href="/home/" onClick={closeSidebar}>
                        Home
                    </a>

                    <a href="/contact/" onClick={closeSidebar}>
                        Contact
                    </a>

                    <a href="/services/" onClick={closeSidebar}>
                        Find a worker
                    </a>

                    <a href="/worker-authentication/" onClick={closeSidebar}>
                        Become a worker
                    </a>

                </nav>

            </aside>


            {/* ==========================
                MAIN CONTENT
            ========================== */}

            <main>

                {/* HERO SECTION */}

                <section className="hero">

                    <div className="hero-content">

                        <span className="hero-badge">
                            About SkillConnect
                        </span>

                        <h1>
                            Connecting
                            <span>Skills</span>
                            With Opportunities
                        </h1>

                        <p>
                            SkillConnect connects clients with trusted
                            skilled workers nearby while helping
                            professionals grow their services.
                        </p>

                    </div>

                </section>


                {/* WHO WE ARE */}

                <section className="section reveal">

                    <h2>Who We Are</h2>

                    <p className="description">
                        SkillConnect is a platform that helps people
                        discover trusted skilled professionals nearby.

                        We make it easier for clients to find reliable
                        workers while helping professionals showcase
                        their skills and grow their businesses.
                    </p>

                </section>


                {/* OUR MISSION */}

                <section className="section reveal">

                    <h2>Our Mission</h2>

                    <div className="cards">

                        <article className="card">
                            <div className="icon">👥</div>
                            <h3>For Clients</h3>
                            <p>
                                Help clients easily find skilled
                                professionals based on location,
                                skills and reviews.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">🛠️</div>
                            <h3>For Workers</h3>
                            <p>
                                Give skilled professionals a platform
                                to reach more customers and grow
                                their services.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">🌍</div>
                            <h3>For Communities</h3>
                            <p>
                                Connect local skills with local
                                opportunities and create stronger
                                communities.
                            </p>
                        </article>

                    </div>

                </section>


                {/* HOW IT WORKS */}

                <section className="section reveal">

                    <h2>How SkillConnect Works</h2>

                    <div className="cards">

                        <article className="card">
                            <div className="icon">👤</div>
                            <h3>Create Account</h3>
                            <p>
                                Workers create profiles while clients
                                register to find services.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">🔍</div>
                            <h3>Find Workers</h3>
                            <p>
                                Clients search skilled professionals
                                using skills, location and ratings.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">🤝</div>
                            <h3>Contact Securely</h3>
                            <p>
                                Clients contact services through
                                SkillConnect after registration.
                            </p>
                        </article>

                    </div>

                </section>


                {/* WHY CHOOSE SKILLCONNECT */}

                <section className="section reveal">

                    <h2>Why Choose SkillConnect?</h2>

                    <div className="cards">

                        <article className="card">
                            <h3>✓ Verified Workers</h3>
                            <p>
                                Workers complete email, phone and
                                admin verification.
                            </p>
                        </article>

                        <article className="card">
                            <h3>⭐ Ratings & Reviews</h3>
                            <p>
                                Make better decisions using customer
                                feedback.
                            </p>
                        </article>

                        <article className="card">
                            <h3>📍 Nearby Professionals</h3>
                            <p>
                                Find and contact skilled workers in your
                                location.
                            </p>
                        </article>

                    </div>

                </section>


                {/* CALL TO ACTION */}

                <section className="cta reveal">

                    <h2>Ready To Join SkillConnect?</h2>

                    <p>
                        Join workers and clients already using SkillConnect.
                    </p>

                    <div className="hero-buttons">

                        <a
                            href="/services/"
                            className="client-btn"
                        >
                            Find a worker
                        </a>

                        <a
                            href="/worker-authentication/"
                            className="worker-btn"
                        >
                            Become a worker
                        </a>

                    </div>

                </section>

            </main>


            {/* ==========================
                FOOTER
            ========================== */}

            <footer>
                <p>
                    © {new Date().getFullYear()} SkillConnect. All rights reserved.
                </p>
            </footer>

        </>
    );
}

export default About;