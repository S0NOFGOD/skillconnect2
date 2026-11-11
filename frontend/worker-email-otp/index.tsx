import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { API_REQUEST } from '../config';
import './style.css';

interface Notice {
    type: 'success' | 'error';
    title: string;
    message: string;
    callback?: () => void;
}

interface APIResponse {
    success?: boolean;
    message?: string;
    coolDownUntil?: string;
}

function WorkerEmailOTP() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [workerEmail, setWorkerEmail] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [invalid, setInvalid] = useState(false);
    const [cooldownMessage, setCooldownMessage] = useState('');
    const [cooldownActive, setCooldownActive] = useState(false);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const notificationCallback = useRef<(() => void) | undefined>(undefined);

    const authenticationPage = '/worker-authentication/';
    const profilePage = '/worker-create-profile/';

    const showNotification = (type: 'success' | 'error', title: string, message: string, callback?: () => void) => {
        notificationCallback.current = callback;
        setNotice({ type, title, message });
    };

    const closeNotification = () => {
        const callback = notificationCallback.current;
        notificationCallback.current = undefined;
        setNotice(null);
        callback?.();
    };

    const stopTimers = () => {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        if (cooldownTimer.current) clearInterval(cooldownTimer.current);
        countdownTimer.current = cooldownTimer.current = null;
    };

    const startCountdown = () => {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        setCountdown(60);
        countdownTimer.current = setInterval(() => {
            setCountdown(previous => {
                if (previous <= 1) {
                    if (countdownTimer.current) clearInterval(countdownTimer.current);
                    countdownTimer.current = null;
                    return 0;
                }
                return previous - 1;
            });
        }, 1000);
    };

    const startCooldown = (until: string) => {
        if (cooldownTimer.current) clearInterval(cooldownTimer.current);
        const endTime = new Date(until).getTime();

        if (!Number.isFinite(endTime)) {
            showNotification('error', 'Resend Limit Reached', 'You have reached the maximum resend attempts. Please try again later.');
            return;
        }

        setCooldownActive(true);

        const update = () => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            const hours = Math.floor(remaining / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const seconds = remaining % 60;

            setCooldownMessage(remaining > 0
                ? `You have reached the maximum resend attempts. Please try again in ${hours}h ${minutes}m ${seconds}s.`
                : 'Your cooldown has ended. You can request a new OTP.');

            if (remaining <= 0) {
                setCooldownActive(false);
                if (cooldownTimer.current) clearInterval(cooldownTimer.current);
                cooldownTimer.current = null;
            }
        };

        update();
        showNotification('error', 'Resend Limit Reached', '');
        cooldownTimer.current = setInterval(update, 1000);
    };

    useEffect(() => {
        const email = sessionStorage.getItem('workerEmail');

        if (!email) {
            showNotification('error', 'Session Expired', 'Your verification session has expired. Please return to the authentication page.', () => {
                window.location.href = authenticationPage;
            });
        } else {
            setWorkerEmail(email);
            startCountdown();
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }

        return stopTimers;
    }, []);

    useEffect(() => {
        if (!sidebarOpen) return;

        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') closeSidebar();
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    const openSidebar = () => setSidebarOpen(true);

    const closeSidebar = () => {
        setSidebarOpen(false);
        menuToggleRef.current?.focus();
    };

    const clearOTP = () => {
        setOtp(['', '', '', '', '', '']);
        setInvalid(false);
        inputRefs.current[0]?.focus();
    };

    const handleOTPChange = (value: string, index: number) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        setOtp(previous => previous.map((item, i) => i === index ? digit : item));
        setInvalid(false);
        if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handleOTPKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (event.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
        if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
        if (event.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        setOtp(Array.from({ length: 6 }, (_, i) => pasted[i] || ''));
        setInvalid(false);
        inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
    };

    const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (verifying) return;

        const code = otp.join('');

        if (!/^\d{6}$/.test(code)) {
            setInvalid(true);
            showNotification('error', 'Invalid OTP', 'Please enter the complete 6-digit verification code.');
            return;
        }

        if (!workerEmail) {
            showNotification('error', 'Session Expired', 'Your verification session has expired.', () => {
                window.location.href = authenticationPage;
            });
            return;
        }

        setVerifying(true);

        try {
            const response = await API_REQUEST('/api/worker-email-otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: workerEmail, otp: code })
            });

            const data: APIResponse = await response.json();

            if (!response.ok || !data.success) {
                showNotification('error', 'Verification Failed', data.message || 'The verification code could not be verified.', response.status === 404 ? () => {
                    window.location.href = authenticationPage;
                } : undefined);
                return;
            }

            showNotification('success', 'Email Verified', data.message || 'Your email has been successfully verified.', () => {
                window.location.href = profilePage;
            });
        } catch (error) {
            console.error('Email OTP verification error:', error);
            showNotification('error', 'Connection Error', 'Unable to connect to the server. Please check your internet connection and try again.');
        } finally {
            setVerifying(false);
        }
    };

    const handleResend = async () => {
        if (resending || countdown > 0 || cooldownActive) return;

        if (!workerEmail) {
            showNotification('error', 'Session Expired', 'Your verification session has expired.', () => {
                window.location.href = authenticationPage;
            });
            return;
        }

        setResending(true);

        try {
            const response = await API_REQUEST('/api/worker-email-otp/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: workerEmail })
            });

            const data: APIResponse = await response.json();

            if (!response.ok || !data.success) {
                if (response.status === 429 && data.coolDownUntil) {
                    startCooldown(data.coolDownUntil);
                    return;
                }

                showNotification('error', 'Unable to Resend OTP', data.message || 'We could not send a new verification code.', response.status === 404 ? () => {
                    window.location.href = authenticationPage;
                } : undefined);
                return;
            }

            clearOTP();
            showNotification('success', 'OTP Sent', data.message || 'A new verification code has been sent to your email.', startCountdown);
        } catch (error) {
            console.error('Resend OTP error:', error);
            showNotification('error', 'Connection Error', 'Unable to connect to the server. Please try again.');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="worker-email-otp-page">
            <header className="header">
                <nav className="navbar" aria-label="Main navigation">
                    <a href="/" className="logo">SKILLCONNECT</a>
                    <div className="nav-links">
                        <a href="/home/">Home</a>
                        <a href="/about/">About us</a>
                        <a href="/contact/">Contact us</a>
                        <a href="/services/">Find a worker</a>
                    </div>
                    <button ref={menuToggleRef} type="button" className="menu-toggle" onClick={openSidebar} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="otpMobileSidebar">
                        <span /><span /><span />
                    </button>
                </nav>
            </header>

            <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={closeSidebar} aria-hidden="true" />

            <aside className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`} id="otpMobileSidebar" aria-label="Mobile navigation" aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
                <div className="sidebar-header">
                    <span className="sidebar-title">Menu</span>
                    <button type="button" className="sidebar-close" onClick={closeSidebar} aria-label="Close navigation menu">×</button>
                </div>
                <nav className="sidebar-links">
                    <a href="/home/" onClick={closeSidebar}>Home</a>
                    <a href="/about/" onClick={closeSidebar}>About us</a>
                    <a href="/contact/" onClick={closeSidebar}>Contact us</a>
                    <a href="/services/" onClick={closeSidebar}>Find a worker</a>
                </nav>
            </aside>

            <main className="otp-page">
                <section className="otp-section">
                    <div className="otp-card">
                        <div className="otp-header">
                            <span className="otp-badge">Email Verification</span>
                            <h1>Verify Your Email</h1>
                            <p>Enter the 6-digit verification code sent to:</p>
                            <p className="worker-email">{workerEmail || 'Loading email...'}</p>
                            <p className="spam-notice">Didn't receive the email? Check your <strong>Spam or Junk folder</strong>.</p>
                        </div>

                        <form onSubmit={handleVerify} noValidate>
                            <div className="otp-box">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={element => { inputRefs.current[index] = element; }}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                        maxLength={1}
                                        className={`otp-input ${invalid ? 'invalid' : ''}`}
                                        aria-label={`OTP digit ${index + 1}`}
                                        value={digit}
                                        onChange={event => handleOTPChange(event.target.value, index)}
                                        onKeyDown={event => handleOTPKeyDown(event, index)}
                                        onPaste={handlePaste}
                                        required
                                    />
                                ))}
                            </div>

                            <button type="submit" className="submit-btn" disabled={verifying}>
                                {verifying ? <><span className="loading-spinner" /> Verifying...</> : 'Verify OTP'}
                            </button>
                        </form>

                        <p className="resend">
                            Didn't receive the code?{' '}
                            <button type="button" className={countdown > 0 || resending || cooldownActive ? 'disabled' : ''} onClick={handleResend} disabled={countdown > 0 || resending || cooldownActive}>
                                {resending ? 'Resending...' : 'Resend OTP'}
                            </button>
                        </p>

                        <p className="countdown">
                            {cooldownActive ? cooldownMessage : countdown > 0 ? `Resend available in ${countdown}s` : 'You can request a new OTP.'}
                        </p>
                    </div>
                </section>
            </main>

            <footer>
                <p>© {new Date().getFullYear()} SkillConnect. All rights reserved.</p>
            </footer>

            {notice && (
                <div className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle">
                    <div className="notification-card">
                        <div className={`notification-icon ${notice.type}`}>{notice.type === 'success' ? '✓' : '!'}</div>
                        <h2 id="notificationTitle">{notice.title}</h2>
                        <p>{notice.message || cooldownMessage}</p>
                        <button type="button" className="notification-close-button" onClick={closeNotification}>Continue</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default WorkerEmailOTP;