/* Foodies — storefront: menu, cart, checkout and order placement */
(function () {
    'use strict';

    const CART_KEY = 'foodies_cart_v1';
    const CUSTOMER_KEY = 'foodies_customer';
    const LAST_ORDER_KEY = 'foodies_last_order';

    const DEFAULT_CONFIG = {
        delivery: { fee: 2.99, freeAt: 35 },
        estimatedDeliveryMinutes: 45,
        maxItemQuantity: 20
    };

    const state = {
        cart: [],
        config: DEFAULT_CONFIG,
        menu: [],
        customer: null,
        category: 'All',
        query: ''
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const els = {
        header: $('#site-header'),
        menu: $('#menu'),
        menuToggle: $('#menu-toggle'),
        cartDrawer: $('#cart-drawer'),
        cartBackdrop: $('#cart-backdrop'),
        cartOpen: $('#cart-open'),
        cartClose: $('#cart-close'),
        cartItems: $('#cart-items'),
        cartEmpty: $('#cart-empty'),
        cartFoot: $('#cart-foot'),
        cartCount: $('#cart-count'),
        cartSubtotal: $('#cart-subtotal'),
        cartDelivery: $('#cart-delivery'),
        cartTotal: $('#cart-total'),
        cartHint: $('#cart-hint'),
        cartFreeAt: $('#cart-free-at'),
        cartCheckout: $('#cart-checkout'),
        cartBrowse: $('#cart-browse'),
        pageCartTotal: $('#page-cart-total'),
        pageCheckout: $('#page-checkout'),
        toast: $('#toast'),
        menuGrid: $('#page3'),
        offerGrid: $('#offer-grid'),
        categoryFilters: $('#category-filters'),
        menuSearch: $('#menu-search'),
        checkoutModal: $('#checkout-modal'),
        checkoutForm: $('#checkout-form'),
        checkoutSummary: $('#checkout-summary'),
        checkoutError: $('#checkout-error'),
        placeOrderBtn: $('#place-order-btn'),
        successModal: $('#success-modal'),
        successName: $('#success-name'),
        successOrderNumber: $('#success-order-number'),
        successEta: $('#success-eta'),
        successTrack: $('#success-track'),
        copyOrderNumber: $('#copy-order-number'),
        trackForm: $('#track-form'),
        trackError: $('#track-error')
    };

    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    let toastTimer;
    let searchTimer;

    /* ---------------------------------------------------------
       Helpers
       --------------------------------------------------------- */
    function money(value) {
        return currency.format(Number(value) || 0);
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value).replace(
            /[&<>"']/g,
            (character) =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])
        );
    }

    function imgSrc(path) {
        if (!path) return '/image/logo.png';
        if (/^(https?:\/\/|\/)/i.test(path)) return path;
        return '/' + path.replace(/^\.?\//, '');
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
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

    function showToast(message, type) {
        if (!els.toast) return;

        els.toast.textContent = message;
        els.toast.classList.toggle('toast-error', type === 'error');
        els.toast.classList.add('show');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
    }

    function starsHtml(rating) {
        const value = Number(rating) || 0;
        let markup = '';

        for (let index = 1; index <= 5; index += 1) {
            if (value >= index - 0.25) {
                markup += "<i class='bx bxs-star' aria-hidden='true'></i>";
            } else if (value >= index - 0.75) {
                markup += "<i class='bx bxs-star-half' aria-hidden='true'></i>";
            } else {
                markup += "<i class='bx bx-star' aria-hidden='true'></i>";
            }
        }

        return markup;
    }

    /* ---------------------------------------------------------
       Cart storage
       --------------------------------------------------------- */
    function normalizeCartItem(item) {
        if (!item || typeof item.id !== 'string' || !item.name) return null;

        const price = Number(item.price);
        const qty = Number(item.qty);

        if (!Number.isFinite(price) || price < 0 || !Number.isInteger(qty) || qty < 1) return null;

        return {
            id: item.id,
            name: String(item.name).slice(0, 80),
            price,
            image: String(item.image || ''),
            qty: Math.min(qty, state.config.maxItemQuantity)
        };
    }

    function loadCart() {
        try {
            const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            state.cart = Array.isArray(saved) ? saved.map(normalizeCartItem).filter(Boolean) : [];
        } catch (_error) {
            state.cart = [];
        }
    }

    function saveCart() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
        } catch (_error) {
            /* Storage can be unavailable in private mode. */
        }
    }

    function cartQuantity() {
        return state.cart.reduce((sum, item) => sum + item.qty, 0);
    }

    function cartSubtotal() {
        return Math.round(state.cart.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    }

    function totals() {
        const subtotal = cartSubtotal();
        const delivery = state.config.delivery;
        const fee = subtotal === 0 || subtotal >= delivery.freeAt ? 0 : delivery.fee;

        return {
            subtotal,
            fee,
            total: Math.round((subtotal + fee) * 100) / 100
        };
    }

    function addToCart(id) {
        const food = state.menu.find((item) => item.id === id);
        if (!food) return;

        const existing = state.cart.find((item) => item.id === id);
        const max = state.config.maxItemQuantity;

        if (existing) {
            if (existing.qty >= max) {
                showToast(`You can order up to ${max} of ${food.name}.`, 'error');
                return;
            }
            existing.qty += 1;
        } else {
            state.cart.push({
                id: food.id,
                name: food.name,
                price: food.price,
                image: food.image,
                qty: 1
            });
        }

        saveCart();
        renderCart();
        bumpBadge();
        showToast(`${food.name} added to cart`);
    }

    function changeQuantity(id, delta) {
        const item = state.cart.find((line) => line.id === id);
        if (!item) return;

        if (delta > 0) {
            item.qty = Math.min(item.qty + 1, state.config.maxItemQuantity);
        } else {
            item.qty -= 1;
        }

        if (item.qty <= 0) {
            state.cart = state.cart.filter((line) => line.id !== id);
        }

        saveCart();
        renderCart();
    }

    function removeFromCart(id) {
        state.cart = state.cart.filter((line) => line.id !== id);
        saveCart();
        renderCart();
    }

    function bumpBadge() {
        if (!els.cartCount) return;
        els.cartCount.classList.remove('bump');
        void els.cartCount.offsetWidth;
        els.cartCount.classList.add('bump');
    }

    function updateBadge() {
        if (els.cartCount) els.cartCount.textContent = String(cartQuantity());
    }

    /* ---------------------------------------------------------
       Cart drawer
       --------------------------------------------------------- */
    function renderCartItem(item) {
        const article = document.createElement('article');
        article.className = 'cart-item';
        article.innerHTML = `
            <img src="${escapeHtml(imgSrc(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy">
            <div class="cart-item-info">
                <h4>${escapeHtml(item.name)}</h4>
                <p class="cart-item-price">${money(item.price)}</p>
                <div class="qty-control">
                    <button type="button" data-action="dec" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity of ${escapeHtml(item.name)}">−</button>
                    <span aria-live="polite">${item.qty}</span>
                    <button type="button" data-action="inc" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity of ${escapeHtml(item.name)}">+</button>
                </div>
            </div>
            <div class="cart-item-side">
                <strong>${money(item.price * item.qty)}</strong>
                <button type="button" class="cart-remove" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button>
            </div>
        `;
        return article;
    }

    function renderCart() {
        if (!els.cartItems) return;

        els.cartItems.replaceChildren();
        els.cartItems.hidden = state.cart.length === 0;

        if (state.cart.length === 0) {
            els.cartEmpty.hidden = false;
            els.cartFoot.hidden = true;
        } else {
            els.cartEmpty.hidden = true;
            els.cartFoot.hidden = false;

            state.cart.forEach((item) => els.cartItems.appendChild(renderCartItem(item)));
        }

        const { subtotal, fee, total } = totals();

        els.cartSubtotal.textContent = money(subtotal);
        els.cartDelivery.textContent = fee === 0 ? 'Free' : money(fee);
        els.cartTotal.textContent = money(total);
        if (els.pageCartTotal) els.pageCartTotal.textContent = money(total);

        if (els.cartFreeAt) els.cartFreeAt.textContent = money(state.config.delivery.freeAt);

        if (subtotal > 0 && subtotal < state.config.delivery.freeAt) {
            els.cartHint.textContent = `Add ${money(state.config.delivery.freeAt - subtotal)} more for free delivery.`;
        } else if (subtotal >= state.config.delivery.freeAt) {
            els.cartHint.textContent = 'You unlocked free delivery!';
        } else {
            els.cartHint.textContent = '';
        }

        updateBadge();
    }

    function openCart() {
        if (!els.cartDrawer) return;

        els.cartDrawer.classList.add('open');
        els.cartDrawer.setAttribute('aria-hidden', 'false');
        if (els.cartBackdrop) els.cartBackdrop.hidden = false;
        els.cartOpen.setAttribute('aria-expanded', 'true');
        document.body.classList.add('no-scroll');
        els.cartClose.focus({ preventScroll: true });
    }

    function closeCart() {
        if (!els.cartDrawer) return;

        els.cartDrawer.classList.remove('open');
        els.cartDrawer.setAttribute('aria-hidden', 'true');
        if (els.cartBackdrop) els.cartBackdrop.hidden = true;
        els.cartOpen.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('no-scroll');
    }

    /* ---------------------------------------------------------
       Menu
       --------------------------------------------------------- */
    function renderCategories(categories) {
        if (!els.categoryFilters) return;

        els.categoryFilters.replaceChildren();

        ['All', ...categories].forEach((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chip' + (state.category === category ? ' is-active' : '');
            button.dataset.category = category;
            button.textContent = category;
            els.categoryFilters.appendChild(button);
        });
    }

    function filteredMenu() {
        const query = state.query.trim().toLowerCase();

        return state.menu.filter((item) => {
            const matchesCategory = state.category === 'All' || item.category === state.category;
            if (!matchesCategory) return false;

            if (!query) return true;

            return [item.name, item.description, item.category]
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }

    function foodCard(item) {
        const article = document.createElement('article');
        article.className = 'card food-card';

        const hasOffer = Number(item.oldPrice) > Number(item.price);

        article.innerHTML = `
            <div class="card-media">
                ${hasOffer ? `<span class="offer-badge card-badge">Save ${money(item.oldPrice - item.price)}</span>` : ''}
                <img src="${escapeHtml(imgSrc(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy">
            </div>
            <span class="card-category">${escapeHtml(item.category)}</span>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <div class="rating" aria-label="Rated ${Number(item.rating).toFixed(1)} out of 5">${starsHtml(item.rating)}</div>
            <div class="price">${money(item.price)}${hasOffer ? ` <small>${money(item.oldPrice)}</small>` : ''}</div>
            <button type="button" class="add-to-cart" data-id="${escapeHtml(item.id)}">Add to Cart</button>
        `;

        return article;
    }

    function renderMenu() {
        if (!els.menuGrid) return;

        const items = filteredMenu();
        els.menuGrid.replaceChildren();

        if (items.length === 0) {
            const message = document.createElement('p');
            message.className = 'menu-status';
            message.textContent = state.menu.length
                ? 'No dishes match your search. Try another keyword or category.'
                : 'The menu is empty right now. Please check back soon.';
            els.menuGrid.appendChild(message);
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach((item) => fragment.appendChild(foodCard(item)));
        els.menuGrid.appendChild(fragment);
    }

    function renderOffers() {
        if (!els.offerGrid) return;

        const offers = state.menu.filter((item) => item.isOffer);
        els.offerGrid.replaceChildren();

        if (offers.length === 0) {
            const message = document.createElement('p');
            message.className = 'menu-status';
            message.textContent = 'No special offers right now — check the full menu above.';
            els.offerGrid.appendChild(message);
            return;
        }

        const fragment = document.createDocumentFragment();

        offers.forEach((item) => {
            const discount = item.oldPrice
                ? Math.round((1 - item.price / item.oldPrice) * 100)
                : 0;

            const article = document.createElement('article');
            article.className = 'offer-card';
            article.innerHTML = `
                <span class="offer-badge">${discount > 0 ? `Save ${discount}%` : 'Deal'}</span>
                <img src="${escapeHtml(imgSrc(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy">
                <div class="offer-body">
                    <h2>${escapeHtml(item.name)}</h2>
                    <p>${escapeHtml(item.description)}</p>
                    <div class="offer-footer">
                        <span class="offer-price">${money(item.price)}${item.oldPrice ? ` <small>${money(item.oldPrice)}</small>` : ''}</span>
                        <button type="button" class="add-to-cart" data-id="${escapeHtml(item.id)}">Add to Cart</button>
                    </div>
                </div>
            `;
            fragment.appendChild(article);
        });

        els.offerGrid.appendChild(fragment);
    }

    async function loadConfig() {
        try {
            state.config = await api('/api/config');
        } catch (_error) {
            state.config = DEFAULT_CONFIG;
        }

        renderCart();
    }

    async function loadCustomer() {
        try {
            const data = await api('/api/customers/me');
            state.customer = data.customer || null;
        } catch (_error) {
            state.customer = null;
        }
    }

    async function loadMenu() {
        if (!els.menuGrid) return;

        try {
            const data = await api('/api/menu');
            state.menu = data.items || [];
            renderCategories(data.categories || []);
            renderMenu();
            renderOffers();
        } catch (error) {
            els.menuGrid.replaceChildren();
            const message = document.createElement('p');
            message.className = 'menu-status';
            message.textContent = 'Could not load the menu. Please make sure the server is running.';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn btn-ghost';
            retry.textContent = 'Try again';
            retry.addEventListener('click', loadMenu);
            message.appendChild(document.createElement('br'));
            message.appendChild(retry);
            els.menuGrid.appendChild(message);
            console.error(error);
        }
    }

    /* ---------------------------------------------------------
       Checkout
       --------------------------------------------------------- */
    function renderCheckoutSummary() {
        const { subtotal, fee, total } = totals();
        const lines = state.cart
            .map(
                (item) => `
                <div class="summary-line">
                    <span>${item.qty} × ${escapeHtml(item.name)}</span>
                    <span>${money(item.price * item.qty)}</span>
                </div>`
            )
            .join('');

        els.checkoutSummary.innerHTML = `
            ${lines}
            <div class="summary-line summary-sub"><span>Subtotal</span><span>${money(subtotal)}</span></div>
            <div class="summary-line summary-sub"><span>Delivery</span><span>${fee === 0 ? 'Free' : money(fee)}</span></div>
            <div class="summary-line summary-total"><span>Total</span><strong>${money(total)}</strong></div>
        `;
    }

    function prefillCheckout() {
        let saved = null;

        try {
            saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null');
        } catch (_error) {
            saved = null;
        }

        const customer = { ...(state.customer || {}), ...(saved || {}) };
        if (!customer || Object.keys(customer).length === 0) return;

        ['name', 'phone', 'email', 'address'].forEach((field) => {
            const input = els.checkoutForm.elements[field];
            if (input && !input.value) input.value = customer[field] || '';
        });
    }

    function openCheckout() {
        if (state.cart.length === 0) {
            showToast('Your cart is empty — add something tasty first.', 'error');
            return;
        }

        closeCart();
        prefillCheckout();
        renderCheckoutSummary();
        els.checkoutError.textContent = '';
        openModal(els.checkoutModal);
    }

    function openModal(modal) {
        if (!modal) return;
        modal.hidden = false;
        document.body.classList.add('no-scroll');

        const focusable = modal.querySelector('input, button, textarea, a');
        if (focusable) focusable.focus({ preventScroll: true });
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.hidden = true;

        const anyOpen = $$('.modal').some((element) => !element.hidden);
        if (!anyOpen) document.body.classList.remove('no-scroll');
    }

    async function placeOrder(event) {
        event.preventDefault();

        const form = els.checkoutForm;
        const customer = {
            name: form.elements.name.value.trim(),
            phone: form.elements.phone.value.trim(),
            email: form.elements.email.value.trim(),
            address: form.elements.address.value.trim()
        };
        const note = form.elements.note.value.trim();

        if (!state.cart.length) {
            els.checkoutError.textContent = 'Your cart is empty.';
            return;
        }

        if (!customer.name || !customer.phone || !customer.address) {
            els.checkoutError.textContent = 'Please fill in your name, phone number and address.';
            return;
        }

        els.checkoutError.textContent = '';
        els.placeOrderBtn.disabled = true;
        const originalLabel = els.placeOrderBtn.textContent;
        els.placeOrderBtn.textContent = 'Placing order…';

        try {
            const data = await api('/api/orders', {
                method: 'POST',
                body: JSON.stringify({
                    items: state.cart.map((item) => ({ foodId: item.id, qty: item.qty })),
                    customer,
                    note
                })
            });

            const order = data.order;

            try {
                localStorage.setItem(
                    CUSTOMER_KEY,
                    JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email, address: customer.address })
                );
                localStorage.setItem(
                    LAST_ORDER_KEY,
                    JSON.stringify({
                        orderNumber: order.orderNumber,
                        phone: customer.phone,
                        total: order.total,
                        createdAt: order.createdAt
                    })
                );
            } catch (_error) {
                /* Ignore storage errors. */
            }

            state.cart = [];
            saveCart();
            renderCart();

            els.successName.textContent = customer.name.split(/\s+/)[0];
            els.successOrderNumber.textContent = order.orderNumber;
            els.successEta.textContent = String(state.config.estimatedDeliveryMinutes || 45);
            els.successTrack.href = `/track.html?order=${encodeURIComponent(order.orderNumber)}`;
            els.successTrack.dataset.order = order.orderNumber;

            closeModal(els.checkoutModal);
            openModal(els.successModal);

            showToast('Order placed successfully!');
        } catch (error) {
            els.checkoutError.textContent = error.message;
            showToast(error.message, 'error');
        } finally {
            els.placeOrderBtn.disabled = false;
            els.placeOrderBtn.textContent = originalLabel;
        }
    }

    /* ---------------------------------------------------------
       Events
       --------------------------------------------------------- */
    function bindEvents() {
        document.addEventListener('click', (event) => {
            const addButton = event.target.closest('.add-to-cart');
            if (addButton && addButton.dataset.id) {
                addToCart(addButton.dataset.id);
                return;
            }

            const closeTrigger = event.target.closest('[data-close-modal]');
            if (closeTrigger) {
                const modal = closeTrigger.closest('.modal');
                closeModal(modal || els.checkoutModal);
            }
        });

        if (els.cartOpen) {
            els.cartOpen.addEventListener('click', (event) => {
                event.preventDefault();
                openCart();
            });
        }

        if (els.cartClose) els.cartClose.addEventListener('click', closeCart);
        if (els.cartBackdrop) els.cartBackdrop.addEventListener('click', closeCart);

        if (els.cartBrowse) {
            els.cartBrowse.addEventListener('click', () => {
                closeCart();
                document.getElementById('menu-title').scrollIntoView({ behavior: 'smooth' });
            });
        }

        if (els.cartItems) {
            els.cartItems.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-action]');
                if (!button) return;

                const { action, id } = button.dataset;
                if (action === 'inc') changeQuantity(id, 1);
                if (action === 'dec') changeQuantity(id, -1);
                if (action === 'remove') removeFromCart(id);
            });
        }

        if (els.cartCheckout) els.cartCheckout.addEventListener('click', openCheckout);
        if (els.pageCheckout) els.pageCheckout.addEventListener('click', openCheckout);

        if (els.categoryFilters) {
            els.categoryFilters.addEventListener('click', (event) => {
                const chip = event.target.closest('.chip');
                if (!chip) return;

                state.category = chip.dataset.category;
                $$('.chip', els.categoryFilters).forEach((button) =>
                    button.classList.toggle('is-active', button === chip)
                );
                renderMenu();
            });
        }

        if (els.menuSearch) {
            els.menuSearch.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    state.query = els.menuSearch.value;
                    renderMenu();
                }, 150);
            });
        }

        const searchLink = document.getElementById('search-link');
        if (searchLink) {
            searchLink.addEventListener('click', (event) => {
                event.preventDefault();
                document.getElementById('menu-title').scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => els.menuSearch && els.menuSearch.focus(), 350);
            });
        }

        if (els.checkoutForm) els.checkoutForm.addEventListener('submit', placeOrder);

        if (els.copyOrderNumber) {
            els.copyOrderNumber.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(els.successOrderNumber.textContent);
                    showToast('Order number copied');
                } catch (_error) {
                    showToast('Could not copy — please note it down.', 'error');
                }
            });
        }

        if (els.trackForm) {
            els.trackForm.addEventListener('submit', (event) => {
                event.preventDefault();

                const orderNumber = els.trackForm.elements.orderNumber.value.trim().toUpperCase();
                const phone = els.trackForm.elements.phone.value.trim();

                if (!orderNumber || !phone) {
                    els.trackError.textContent = 'Enter both your order number and phone number.';
                    return;
                }

                if (phone.replace(/\D/g, '').length < 7) {
                    els.trackError.textContent = 'Please enter a valid phone number.';
                    return;
                }

                try {
                    localStorage.setItem('foodies_track_phone', phone);
                    localStorage.setItem('foodies_last_order', JSON.stringify({ orderNumber, phone }));
                } catch (_error) {
                    /* Ignore storage errors. */
                }

                els.trackError.textContent = '';
                window.location.href = `/track.html?order=${encodeURIComponent(orderNumber)}`;
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;

            const openModals = $$('.modal').filter((modal) => !modal.hidden);
            if (openModals.length > 0) {
                closeModal(openModals[openModals.length - 1]);
            } else {
                closeCart();
            }
        });
    }

    /* ---------------------------------------------------------
       Init
       --------------------------------------------------------- */
    function init() {
        loadCart();
        renderCart();
        bindEvents();
        loadConfig();
        loadMenu();
        loadCustomer();
    }

    init();
})();
