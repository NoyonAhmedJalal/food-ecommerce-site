/* Foodies — header profile menu: session state, dropdown and sign out */
(function () {
    'use strict';

    function init() {
        const root = document.getElementById('account-menu');
        const toggle = document.getElementById('account-toggle');
        const panel = document.getElementById('account-panel');
        const signout = document.querySelector('[data-signout]');

        let customer = null;

        function setOpen(open) {
            if (!toggle || !panel) return;

            toggle.setAttribute('aria-expanded', String(open));
            panel.hidden = !open;
            if (root) root.classList.toggle('is-open', open);
        }

        function applyCustomer(value) {
            customer = value || null;

            if (root) root.classList.toggle('is-signed-in', Boolean(customer));

            document.querySelectorAll('[data-auth="guest"]').forEach((element) => {
                element.hidden = Boolean(customer);
            });

            document.querySelectorAll('[data-auth="customer"]').forEach((element) => {
                element.hidden = !customer;
            });

            document.querySelectorAll('[data-customer-name]').forEach((element) => {
                element.textContent = customer ? customer.name : '';
            });

            if (toggle) {
                const label = customer ? `Account menu for ${customer.name}` : 'Sign in or create an account';
                toggle.setAttribute('aria-label', label);
                toggle.setAttribute('title', label);
            }
        }

        if (toggle && panel) {
            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const willOpen = panel.hidden;
                setOpen(willOpen);

                if (willOpen) document.dispatchEvent(new CustomEvent('foodies:close-menu'));
            });

            document.addEventListener('click', (event) => {
                if (!root || panel.hidden) return;
                if (root.contains(event.target)) return;
                setOpen(false);
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !panel.hidden) {
                    setOpen(false);
                    toggle.focus();
                }
            });

            document.addEventListener('foodies:close-account', () => setOpen(false));

            panel.addEventListener('click', (event) => {
                if (event.target.closest('a')) setOpen(false);
            });
        }

        if (signout) {
            signout.addEventListener('click', async () => {
                signout.disabled = true;

                try {
                    await fetch('/api/customers/signout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
                    });
                } catch (_error) {
                    /* Redirect anyway. */
                }

                window.location.href = '/';
            });
        }

        applyCustomer(null);

        fetch('/api/customers/me', { headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => applyCustomer(data && data.customer))
            .catch(() => applyCustomer(null));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
