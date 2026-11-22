/* Foodies — customer sign in / sign up */
(function () {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const signinForm = $('#signin-form');
    const signupForm = $('#signup-form');
    const errorBox = $('#auth-error');
    const submitButton = $('#auth-submit');

    function nextUrl() {
        const next = new URLSearchParams(window.location.search).get('next');
        if (!next || !next.startsWith('/') || next.startsWith('//')) return '/account.html';
        return next;
    }

    function setError(message) {
        if (errorBox) errorBox.textContent = message || '';
    }

    function setBusy(busy, loadingLabel) {
        if (!submitButton) return;
        if (!submitButton.dataset.label) submitButton.dataset.label = submitButton.textContent;
        submitButton.disabled = busy;
        submitButton.textContent = busy ? loadingLabel : submitButton.dataset.label;
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            ...options
        });

        let data = null;
        try {
            data = await response.json();
        } catch (_error) {
            data = null;
        }

        if (!response.ok) {
            throw new Error((data && data.error) || 'Something went wrong. Please try again.');
        }

        return data;
    }

    function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    }

    if (signinForm) {
        signinForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setError('');

            const email = signinForm.elements.email.value.trim();
            const password = signinForm.elements.password.value;

            if (!validEmail(email)) {
                setError('Enter a valid email address.');
                return;
            }

            if (!password) {
                setError('Enter your password.');
                return;
            }

            setBusy(true, 'Signing in…');

            try {
                await api('/api/customers/signin', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });

                window.location.href = nextUrl();
            } catch (error) {
                setError(error.message);
                setBusy(false);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setError('');

            const payload = {
                name: signupForm.elements.name.value.trim(),
                email: signupForm.elements.email.value.trim(),
                phone: signupForm.elements.phone.value.trim(),
                address: signupForm.elements.address.value.trim(),
                password: signupForm.elements.password.value
            };
            const confirmPassword = signupForm.elements.confirmPassword.value;

            if (!payload.name) {
                setError('Enter your full name.');
                return;
            }

            if (!validEmail(payload.email)) {
                setError('Enter a valid email address.');
                return;
            }

            if (payload.password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
            }

            if (payload.password !== confirmPassword) {
                setError('The two passwords do not match.');
                return;
            }

            setBusy(true, 'Creating account…');

            try {
                await api('/api/customers/signup', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                window.location.href = nextUrl();
            } catch (error) {
                setError(error.message);
                setBusy(false);
            }
        });
    }

    $$('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = button.parentElement.querySelector('input');
            if (!input) return;

            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            button.innerHTML = show
                ? "<i class='bx bx-hide' aria-hidden='true'></i>"
                : "<i class='bx bx-show' aria-hidden='true'></i>";
        });
    });
})();
