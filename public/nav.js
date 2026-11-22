/* Foodies — shared header navigation (mobile menu + scroll state) */
(function () {
    'use strict';

    function init() {
        const menu = document.getElementById('menu');
        const toggle = document.getElementById('menu-toggle');
        const header = document.getElementById('site-header');

        if (menu && toggle && !toggle.dataset.navReady) {
            toggle.dataset.navReady = '1';

            const isOpen = () => menu.classList.contains('open');

            const setOpen = (open) => {
                menu.classList.toggle('open', open);
                toggle.setAttribute('aria-expanded', String(open));
                toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
                toggle.classList.toggle('is-active', open);
                toggle.innerHTML = open
                    ? "<i class='bx bx-x' aria-hidden='true'></i>"
                    : "<i class='bx bx-menu' aria-hidden='true'></i>";

                if (open) document.dispatchEvent(new CustomEvent('foodies:close-account'));
            };

            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(!isOpen());
            });

            menu.addEventListener('click', (event) => {
                if (event.target.closest('a')) setOpen(false);
            });

            document.addEventListener('click', (event) => {
                if (!isOpen()) return;
                if (menu.contains(event.target) || toggle.contains(event.target)) return;
                setOpen(false);
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && isOpen()) {
                    setOpen(false);
                    toggle.focus();
                }
            });

            document.addEventListener('foodies:close-menu', () => setOpen(false));

            window.addEventListener('resize', () => {
                if (window.innerWidth > 900 && isOpen()) setOpen(false);
            });
        }

        if (header && !header.dataset.scrollReady) {
            header.dataset.scrollReady = '1';

            const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 8);
            updateHeader();
            window.addEventListener('scroll', updateHeader, { passive: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
