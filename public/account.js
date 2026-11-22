/* Foodies — customer account page */
(function () {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);

    const els = {
        wrap: $('#account-wrap'),
        name: $('#account-name'),
        email: $('#account-email'),
        profileForm: $('#profile-form'),
        profileError: $('#profile-error'),
        profileSave: $('#profile-save'),
        orderList: $('#order-list'),
        signout: $('#signout-btn')
    };

    const STATUS_LABELS = {
        placed: 'Order placed',
        confirmed: 'Confirmed',
        preparing: 'Preparing',
        out_for_delivery: 'Out for delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };

    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let customer = null;

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

    function formatDate(value) {
        if (!value) return '—';
        return new Date(value).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
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
            const error = new Error((data && data.error) || 'Something went wrong. Please try again.');
            error.status = response.status;
            throw error;
        }

        return data;
    }

    function fillProfile(profile) {
        els.name.textContent = profile.name;
        els.email.textContent = profile.email;
        els.profileForm.elements.name.value = profile.name || '';
        els.profileForm.elements.email.value = profile.email || '';
        els.profileForm.elements.phone.value = profile.phone || '';
        els.profileForm.elements.address.value = profile.address || '';
        els.wrap.hidden = false;
    }

    function renderOrders(orders) {
        if (!orders.length) {
            els.orderList.innerHTML = `
                <div class="account-empty">
                    <p>You have not placed an order yet.</p>
                    <a class="btn" href="/#menu-title">Browse the menu</a>
                </div>
            `;
            return;
        }

        els.orderList.innerHTML = orders
            .map((order) => {
                const itemCount = (order.items || []).reduce((sum, item) => sum + item.qty, 0);
                const items = (order.items || [])
                    .map((item) => `${item.qty} × ${escapeHtml(item.name)}`)
                    .join(', ');
                const label = STATUS_LABELS[order.status] || order.status;

                return `
                    <article class="account-order">
                        <div class="account-order-top">
                            <div>
                                <div class="account-order-number">${escapeHtml(order.orderNumber)}</div>
                                <div class="account-order-meta">${formatDate(order.createdAt)} · ${itemCount} item${itemCount === 1 ? '' : 's'}</div>
                            </div>
                            <span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(label)}</span>
                        </div>
                        <p class="account-order-items">${items}</p>
                        <div class="account-order-bottom">
                            <span class="account-order-total">Total <strong>${money(order.total)}</strong></span>
                            <a class="btn" href="/track.html?order=${encodeURIComponent(order.orderNumber)}">Track order</a>
                        </div>
                    </article>
                `;
            })
            .join('');
    }

    async function loadOrders() {
        try {
            const data = await api('/api/customers/orders');
            renderOrders(data.orders || []);
        } catch (error) {
            if (error.status === 401) {
                window.location.href = '/signin.html?next=/account.html';
                return;
            }

            els.orderList.innerHTML = `<p class="account-empty">${escapeHtml(error.message)}</p>`;
        }
    }

    async function init() {
        try {
            const data = await api('/api/customers/me');
            customer = data.customer;

            if (!customer) {
                window.location.href = '/signin.html?next=/account.html';
                return;
            }

            fillProfile(customer);
            await loadOrders();
        } catch (_error) {
            window.location.href = '/signin.html?next=/account.html';
        }
    }

    if (els.profileForm) {
        els.profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            els.profileError.textContent = '';

            const payload = {
                name: els.profileForm.elements.name.value.trim(),
                phone: els.profileForm.elements.phone.value.trim(),
                address: els.profileForm.elements.address.value.trim()
            };

            if (!payload.name) {
                els.profileError.textContent = 'Enter your full name.';
                return;
            }

            const label = els.profileSave.textContent;
            els.profileSave.disabled = true;
            els.profileSave.textContent = 'Saving…';

            try {
                const data = await api('/api/customers/me', {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });

                customer = data.customer;
                fillProfile(customer);
                els.profileError.textContent = '';
                els.profileSave.textContent = 'Saved';

                setTimeout(() => {
                    els.profileSave.textContent = label;
                }, 1500);
            } catch (error) {
                els.profileError.textContent = error.message;
                els.profileSave.textContent = label;
            } finally {
                els.profileSave.disabled = false;
            }
        });
    }

    if (els.signout) {
        els.signout.addEventListener('click', async () => {
            try {
                await api('/api/customers/signout', { method: 'POST' });
            } catch (_error) {
                /* Redirect anyway. */
            }

            window.location.href = '/';
        });
    }

    init();
})();
