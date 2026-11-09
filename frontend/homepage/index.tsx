import { useEffect, useRef, useState } from 'react';
import './style.css';

// ==========================
// ANIMATED STATISTICS
// ==========================

interface CounterProps {
    target: number;
}

function Counter({ target }: CounterProps) {
    const [count, setCount] = useState(0);
    const counterRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        const element = counterRef.current;

        if (!element) return;

        if (!('IntersectionObserver' in window)) {
            setCount(target);
            return;
        }

        let animationFrame = 0;
        let animated = false;

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting || animated) return;

                animated = true;
                observer.unobserve(element);

                if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    setCount(target);
                    return;
                }

                const duration = 1200;
                const start = performance.now();

                function update(now: number) {
                    const progress = Math.min((now - start) / duration, 1);

                    setCount(Math.floor(target * progress));

                    if (progress < 1) {
                        animationFrame = requestAnimationFrame(update);
                    }
                }

                animationFrame = requestAnimationFrame(update);
            },
            { threshold: 0.3 }
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(animationFrame);
        };
    }, [target]);

    return <h2 ref={counterRef}>{count.toLocaleString()}</h2>;
}


// ==========================
// HOMEPAGE
// ==========================

function Homepage() {
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
                        <a href="/about/">About us</a>
                        <a href="/contact/">Contact us</a>
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

                    <a href="/about/" onClick={closeSidebar}>
                        About us
                    </a>

                    <a href="/contact/" onClick={closeSidebar}>
                        Contact us
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
                            Trusted • Verified • Nearby
                        </span>

                        <h1>
                            Find Trusted <span>Skilled Workers</span> Near You
                        </h1>

                        <p>
                            SkillConnect connects clients with verified skilled
                            workers nearby while helping workers grow through bookings.
                        </p>

                        <div className="hero-buttons">

                            <a href="/services/" className="client-btn">
                                Find a worker
                            </a>

                            <a href="/worker-authentication/" className="worker-btn">
                                Become a worker
                            </a>

                        </div>

                    </div>

                </section>


                {/* STATISTICS */}

                <section className="stats" aria-label="SkillConnect statistics">

                    <div className="stat-card">
                        <Counter target={5000} />
                        <p>Skilled Workers</p>
                    </div>

                    <div className="stat-card">
                        <Counter target={10000} />
                        <p>Happy Clients</p>
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
                                Register as a worker or client in a few simple steps.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">🔍</div>
                            <h3>Find Workers</h3>
                            <p>
                                Search verified professionals based on skills and location.
                            </p>
                        </article>

                        <article className="card">
                            <div className="icon">💳</div>
                            <h3>Contact Workers</h3>
                            <p>
                                Contact workers safely through SkillConnect.
                            </p>
                        </article>

                    </div>

                </section>


                {/* POPULAR SKILLS */}

                <section className="section reveal">

                    <h2>Popular Skills</h2>

                    <div className="skills">
                        <span>Electrician</span>
                        <span>Plumber</span>
                        <span>Mechanic</span>
                        <span>Welder</span>
                        <span>Painter</span>
                        <span>Carpenter</span>
                        <span>Barber</span>
                        <span>Tailor</span>
                        <span>Cleaner</span>
                        <span>Generator Repair</span>
                    </div>

                </section>


                {/* WHY CHOOSE SKILLCONNECT */}

                <section className="section reveal">

                    <h2>Why Choose SkillConnect?</h2>

                    <div className="cards">

                        <article className="card">
                            <h3>✓ Triple Verification</h3>
                            <p>
                                Email, phone and admin verification increase trust.
                            </p>
                        </article>

                        <article className="card">
                            <h3>⭐ Honest Reviews</h3>
                            <p>
                                See customer ratings before hiring.
                            </p>
                        </article>

                        <article className="card">
                            <h3>📍 Nearby Workers</h3>
                            <p>
                                Find and contact professionals close to your location.
                            </p>
                        </article>

                    </div>

                </section>


                {/* CALL TO ACTION */}

                <section className="cta reveal">

                    <h2>Ready To Start?</h2>

                    <p>
                        Join workers and clients already using SkillConnect.
                    </p>

                    <div className="hero-buttons">

                        <a href="/services/" className="client-btn">
                            Find a worker
                        </a>

                        <a href="/worker-authentication/" className="worker-btn">
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

export default Homepage;