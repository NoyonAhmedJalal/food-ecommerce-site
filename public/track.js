/* Foodies — public order tracking page */
(function () {
    'use strict';

    const LAST_ORDER_KEY = 'foodies_last_order';
    const TRACK_PHONE_KEY = 'foodies_track_phone';

    const FLOW = ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
    const LABELS = {
        placed: 'Order placed',
        confirmed: 'Confirmed',
        preparing: 'Preparing',
        out_for_delivery: 'Out for delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };

    const $ = (selector, root = document) => root.querySelector(selector);

    const els = {
        form: $('#track-form'),
        orderNumber: $('#order-number'),
        phone: $('#phone'),
        button: $('#track-btn'),
        error: $('#track-error'),
        result: $('#track-result'),
        header: $('#site-header'),
        menu: $('#menu'),
        menuToggle: $('#menu-toggle')
    };

    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    let currentOrder = null;
    let currentCustomer = null;
    let pollTimer = null;

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

    function formatDate(value) {
        if (!value) return '—';
        return new Date(value).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    function label(status) {
        return LABELS[status] || status;
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

    function setError(message) {
        els.error.textContent = message || '';
    }

    function readStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (_error) {
            return null;
        }
    }

    async function lookup(orderNumber, phone) {
        setError('');
        els.button.disabled = true;
        els.button.textContent = 'Looking up…';

        try {
            const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
            const response = await fetch(
                `/api/orders/track/${encodeURIComponent(orderNumber)}${query}`
            );

            let data = null;
            try {
                data = await response.json();
            } catch (_error) {
                data = null;
            }

            if (!response.ok) {
                throw new Error((data && data.error) || 'Could not find that order.');
            }

            currentOrder = data.order;
            render(currentOrder);
            startPolling(orderNumber, phone);
            history.replaceState(null, '', `/track.html?order=${encodeURIComponent(orderNumber)}`);
        } catch (error) {
            els.result.hidden = true;
            setError(error.message);
        } finally {
            els.button.disabled = false;
            els.button.textContent = 'Track order';
        }
    }

    /* Refresh the status every 15 seconds while the order is still active. */
    function startPolling(orderNumber, phone) {
        stopPolling();

        pollTimer = setInterval(async () => {
            if (!currentOrder || ['delivered', 'cancelled'].includes(currentOrder.status)) {
                stopPolling();
                return;
            }

            try {
                const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
                const response = await fetch(
                    `/api/orders/track/${encodeURIComponent(orderNumber)}${query}`
                );

                if (!response.ok) return;

                const data = await response.json();
                const previous = currentOrder;
                const changed =
                    data.order.status !== previous.status ||
                    (data.order.statusHistory || []).length !== (previous.statusHistory || []).length;

                currentOrder = data.order;

                if (changed) render(currentOrder);
            } catch (_error) {
                /* Keep the last known state; the next tick will retry. */
            }
        }, 15000);
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function render(order) {
        const cancelled = order.status === 'cancelled';
        const reached = new Set((order.statusHistory || []).map((event) => event.status));
        const currentIndex = FLOW.indexOf(order.status);

        const steps = FLOW.map((status, index) => {
            let className = '';

            if (order.status === 'delivered') {
                className = index <= currentIndex ? 'done' : '';
            } else if (cancelled) {
                className = reached.has(status) ? 'done' : '';
            } else if (index < currentIndex) {
                className = 'done';
            } else if (index === currentIndex) {
                className = 'current';
            }

            return `
                <div class="timeline-step ${className}">
                    <span>${label(status)}</span>
                </div>
            `;
        }).join('');

        const items = (order.items || [])
            .map(
                (item) => `
                <div class="track-item">
                    <img src="${escapeHtml(imgSrc(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy">
                    <p>${escapeHtml(item.name)}<br><small>${item.qty} × ${money(item.price)}</small></p>
                    <strong>${money(item.price * item.qty)}</strong>
                </div>
            `
            )
            .join('');

        const history = (order.statusHistory || [])
            .slice()
            .reverse()
            .map(
                (event) => `
                <li>
                    <strong>${label(event.status)}</strong>
                    <span>${escapeHtml(event.note || '')}</span>
                    <span>· ${formatDate(event.at)}</span>
                </li>
            `
            )
            .join('');

        const canCancel = ['placed', 'confirmed'].includes(order.status);
        const etaText =
            order.status === 'delivered'
                ? `Delivered ${formatDate(order.deliveredAt)}`
                : cancelled
                  ? `Cancelled ${formatDate(order.cancelledAt)}`
                  : `Estimated arrival ${formatDate(order.estimatedDelivery)}`;

        els.result.innerHTML = `
            <div class="track-result-head">
                <div>
                    <h2>Order ${escapeHtml(order.orderNumber)}</h2>
                    <p>Placed ${formatDate(order.createdAt)} · ${escapeHtml(etaText)}</p>
                </div>
                <span class="status-badge status-${escapeHtml(order.status)}">${label(order.status)}</span>
            </div>

            ${cancelled ? '<p class="track-cancelled">This order was cancelled. If this is unexpected, please contact the restaurant.</p>' : `<div class="timeline">${steps}</div>`}

            <div class="track-meta">
                <div>
                    <h3>Customer</h3>
                    <p>${escapeHtml(order.customer.name)}</p>
                </div>
                <div>
                    <h3>Phone</h3>
                    <p>${escapeHtml(order.customer.phone)}</p>
                </div>
                <div>
                    <h3>Delivery address</h3>
                    <p>${escapeHtml(order.customer.address)}</p>
                </div>
                <div>
                    <h3>Payment</h3>
                    <p>Cash on delivery</p>
                </div>
            </div>

            <div class="track-items">${items}</div>

            <div class="track-totals">
                <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
                <div><span>Delivery</span><span>${order.deliveryFee === 0 ? 'Free' : money(order.deliveryFee)}</span></div>
                <div class="grand"><span>Total</span><strong>${money(order.total)}</strong></div>
            </div>

            ${order.note ? `<p class="track-note">Note for the kitchen: ${escapeHtml(order.note)}</p>` : ''}

            <div class="track-history">
                <h3>Order updates</h3>
                <ul>${history || '<li>No updates yet.</li>'}</ul>
            </div>

            <div class="track-actions">
                ${canCancel ? '<button type="button" class="btn btn-ghost" id="cancel-order">Cancel order</button>' : ''}
                <a class="btn" href="/#menu-title">Order again</a>
            </div>
        `;

        els.result.hidden = false;

        const cancelButton = $('#cancel-order');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => cancelOrder(order));
        }
    }

    async function cancelOrder(order) {
        const confirmed = window.confirm(
            'Cancel this order? This cannot be undone. Orders already being prepared cannot be cancelled.'
        );
        if (!confirmed) return;

        try {
            const data = await api(`/api/orders/${encodeURIComponent(order.orderNumber)}/cancel`, {
                method: 'PATCH',
                body: JSON.stringify({ phone: els.phone.value.trim() })
            });

            currentOrder = data.order;
            render(currentOrder);
            if (currentOrder.status === 'cancelled') stopPolling();
        } catch (error) {
            setError(error.message);
        }
    }

    function init() {
        const params = new URLSearchParams(window.location.search);
        const orderParam = params.get('order');
        const lastOrder = readStorage(LAST_ORDER_KEY);
        const savedPhone = localStorage.getItem(TRACK_PHONE_KEY);

        if (orderParam) els.orderNumber.value = orderParam;

        let phone = '';

        if (lastOrder && lastOrder.orderNumber === els.orderNumber.value && lastOrder.phone) {
            phone = lastOrder.phone;
        } else if (savedPhone) {
            phone = savedPhone;
        }

        if (phone) els.phone.value = phone;

        els.form.addEventListener('submit', (event) => {
            event.preventDefault();

            const orderNumber = els.orderNumber.value.trim().toUpperCase();
            const phoneValue = els.phone.value.trim();

            if (!orderNumber) {
                setError('Enter your order number.');
                return;
            }

            if (!phoneValue && !currentCustomer) {
                setError('Enter the phone number used for the order.');
                return;
            }

            if (phoneValue && phoneValue.replace(/\D/g, '').length < 7) {
                setError('Enter the phone number used for the order.');
                return;
            }

            try {
                if (phoneValue) localStorage.setItem(TRACK_PHONE_KEY, phoneValue);
            } catch (_error) {
                /* Ignore storage errors. */
            }

            lookup(orderNumber, phoneValue);
        });

        loadCustomer().then(() => {
            if (orderParam && (phone || currentCustomer)) {
                lookup(orderParam.trim().toUpperCase(), phone);
            }
        });
    }

    async function loadCustomer() {
        try {
            const response = await fetch('/api/customers/me', {
                headers: { Accept: 'application/json' }
            });

            if (!response.ok) return;

            const data = await response.json();
            currentCustomer = data.customer || null;

            if (currentCustomer) {
                els.phone.required = false;
                els.phone.placeholder = 'Optional — you are signed in';

                if (!els.phone.value && currentCustomer.phone) {
                    els.phone.value = currentCustomer.phone;
                }
            }
        } catch (_error) {
            currentCustomer = null;
        }
    }

    init();
})();
