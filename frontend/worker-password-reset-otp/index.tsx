import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ClipboardEvent, KeyboardEvent, MouseEvent } from 'react';
import { API_REQUEST } from '../config';
import '../homepage/style.css';
import './style.css';

interface Notice {
    type: 'success' | 'error';
    title: string;
    message: string;
    callback?: () => void;
}

function WorkerPasswordResetOTP() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [workerEmail, setWorkerEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [seconds, setSeconds] = useState(60);
    const [countdown, setCountdown] = useState('');
    const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const busyRef = useRef(false);

    const WORKER_AUTH_URL = '../worker-authentication/';
    const PASSWORD_CHANGE_URL = '../worker-password-change/';

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    }, []);

    const showModal = (type: 'success' | 'error', title: string, message: string, callback?: () => void) => {
        setNotice({ type, title, message, callback });
    };

    const closeModal = () => {
        const callback = notice?.callback;
        setNotice(null);
        callback?.();
    };

    useEffect(() => {
        const email = sessionStorage.getItem('workerEmail');
        if (!email) {
            showModal('error', 'Session Expired', 'Your password reset session has expired. Please start the password reset process again.', () => {
                window.location.href = WORKER_AUTH_URL;
            });
            return;
        }
        setWorkerEmail(email);
        inputRefs.current[0]?.focus();
    }, []);

    useEffect(() => {
        if (!sidebarOpen && !notice) return;

        function handleKeyDown(event: globalThis.KeyboardEvent) {
            if (event.key === 'Escape') {
                if (notice) closeModal();
                else closeSidebar();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        if (sidebarOpen) document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen, notice, closeSidebar]);

    useEffect(() => {
        if (cooldownUntil) return;
        if (seconds <= 0) {
            setCountdown('You can resend the OTP now.');
            return;
        }

        setCountdown(`Resend available in ${seconds}s`);
        const timer = window.setTimeout(() => setSeconds(previous => previous - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [seconds, cooldownUntil]);

    useEffect(() => {
        if (!cooldownUntil) return;

        const cooldownDate = new Date(cooldownUntil);
        if (Number.isNaN(cooldownDate.getTime())) {
            setCooldownUntil(null);
            return;
        }

        const updateCountdown = () => {
            const remaining = cooldownDate.getTime() - Date.now();
            if (remaining <= 0) {
                setCooldownUntil(null);
                setCountdown('You can request another OTP now.');
                return;
            }

            const total = Math.ceil(remaining / 1000);
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            const secs = total % 60;
            setCountdown(`Time remaining: ${hours}h ${minutes}m ${secs}s`);
        };

        updateCountdown();
        const timer = window.setInterval(updateCountdown, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownUntil]);

    const clearOTP = () => {
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
    };

    const handleOTPChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        setOtp(previous => {
            const updated = [...previous];
            updated[index] = digit;
            return updated;
        });
        if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (event.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
        if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
        if (event.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;

        const updated = Array.from({ length: 6 }, (_, index) => pasted[index] || '');
        setOtp(updated);
        const nextEmpty = updated.findIndex(value => !value);
        inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
    };

    const postRequest = async (endpoint: string, body: Record<string, string>) => {
        const response = await API_REQUEST(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        let data: any;
        try {
            data = await response.json();
        } catch {
            data = {
                success: false,
                message: response.ok ? 'The server returned an invalid response.' : 'The server could not process your request.'
            };
        }

        return {
            response,
            data: { ...data, success: data.success === true && response.ok }
        };
    };

    const handleVerification = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busyRef.current) return;

        const code = otp.join('');
        if (!/^\d{6}$/.test(code)) {
            showModal('error', code ? 'Invalid OTP' : 'OTP Required', 'Please enter the complete 6-digit password reset code.');
            return;
        }

        busyRef.current = true;
        setLoading(true);

        try {
            const email = sessionStorage.getItem('workerEmail');
            if (!email) {
                showModal('error', 'Session Expired', 'Your password reset session has expired. Please start the process again.', () => {
                    window.location.href = WORKER_AUTH_URL;
                });
                return;
            }

            const { data } = await postRequest('/api/worker-password-reset-otp/verify', { email, otp: code });

            if (!data.success) {
                showModal('error', data.title || 'Verification Failed', data.message || 'The password reset code could not be verified.');
                return;
            }

            clearOTP();
            window.location.href = PASSWORD_CHANGE_URL;
        } catch (error) {
            console.error('Password reset OTP verification error:', error);
            showModal('error', 'Connection Error', 'Unable to connect to the server. Please check your internet connection and try again.');
        } finally {
            busyRef.current = false;
            setLoading(false);
        }
    };

    const handleResend = async (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        if (busyRef.current || resending || seconds > 0 || cooldownUntil) return;

        busyRef.current = true;
        setResending(true);

        try {
            const email = sessionStorage.getItem('workerEmail');
            if (!email) {
                showModal('error', 'Session Expired', 'Your password reset session has expired. Please start the process again.', () => {
                    window.location.href = WORKER_AUTH_URL;
                });
                return;
            }

            const { data } = await postRequest('/api/worker-password-reset-otp/resend', { email });

            if (!data.success) {
                if (data.cooldownUntil) {
                    const date = new Date(data.cooldownUntil);
                    if (!Number.isNaN(date.getTime()) && date.getTime() > Date.now()) {
                        setCooldownUntil(data.cooldownUntil);
                        showModal('error', 'Resend Cooldown Active', 'You have reached the password reset OTP resend limit. You must wait until the cooldown expires.');
                        return;
                    }
                }

                showModal('error', data.title || 'Unable To Resend OTP', data.message || 'We could not send a new password reset code.');
                return;
            }

            clearOTP();
            showModal('success', 'OTP Sent', data.message || 'A new password reset code has been sent to your email.', () => {
                setSeconds(60);
            });
        } catch (error) {
            console.error('Password reset OTP resend error:', error);
            showModal('error', 'Connection Error', 'Unable to connect to the server. Please check your internet connection and try again.');
        } finally {
            busyRef.current = false;
            setResending(false);
        }
    };

    return (
        <>
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>
                    <div className="nav-links">
                        <a href="/home/">Home</a>
                        <a href="/about/">About us</a>
                        <a href="/contact/">Contact us</a>
                        <a href="/services/">Find a worker</a>
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
                    <a href="/home/">Home</a>
                    <a href="/about/" onClick={closeSidebar}>About us</a>
                    <a href="/contact/" onClick={closeSidebar}>Contact us</a>
                    <a href="/services/" onClick={closeSidebar}>Find a worker</a>
                </nav>
            </aside>

            <main className="otp-page">
                <section className="otp-section">
                    <div className="otp-card">
                        <div className="otp-header">
                            <span className="otp-badge">Password Reset</span>
                            <h1>Verify Reset Code</h1>
                            <p>Enter the 6-digit password reset code sent to your email address.</p>
                            <p className="worker-email">{workerEmail || 'Loading email...'}</p>
                        </div>

                        <form id="otpForm" onSubmit={handleVerification} noValidate>
                            <div className="otp-box">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={element => { inputRefs.current[index] = element; }}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                        maxLength={1}
                                        className="otp-input"
                                        value={digit}
                                        onChange={event => handleOTPChange(index, event.target.value)}
                                        onKeyDown={event => handleKeyDown(event, index)}
                                        onPaste={handlePaste}
                                        aria-label={`OTP digit ${index + 1}`}
                                        required
                                    />
                                ))}
                            </div>

                            <button type="submit" className="submit-btn" disabled={loading || !workerEmail}>
                                {loading ? <><span className="loading-spinner"></span>Verifying...</> : 'Verify OTP'}
                            </button>
                        </form>

                        <p className="resend">
                            Didn't receive the code?{' '}
                            <a href="#" onClick={handleResend} className={seconds > 0 || resending || !!cooldownUntil ? 'disabled' : ''} aria-disabled={seconds > 0 || resending || !!cooldownUntil}>
                                {resending ? 'Resending...' : 'Resend OTP'}
                            </a>
                        </p>

                        <p className="countdown" aria-live="polite">{countdown}</p>
                    </div>
                </section>
            </main>

            <footer>
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>

            {notice && (
                <div className={`message-modal show ${notice.type}`} aria-hidden="false">
                    <div className="message-modal-overlay" onClick={closeModal} />
                    <div className="message-modal-content" role="dialog" aria-modal="true" aria-labelledby="messageModalTitle">
                        <button type="button" className="modal-close" onClick={closeModal} aria-label="Close notification">×</button>
                        <div className="modal-icon">{notice.type === 'success' ? '✓' : '!'}</div>
                        <h2 id="messageModalTitle">{notice.title}</h2>
                        <p>{notice.message}</p>
                        <button type="button" className="modal-button" onClick={closeModal}>Continue</button>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkerPasswordResetOTP;