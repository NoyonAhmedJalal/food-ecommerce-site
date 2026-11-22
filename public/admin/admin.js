/* Foodies — admin panel: auth, dashboard, orders and menu management */
(function () {
    'use strict';

    const STATUSES = [
        'placed',
        'confirmed',
        'preparing',
        'out_for_delivery',
        'delivered',
        'cancelled'
    ];

    const STATUS_LABELS = {
        placed: 'Placed',
        confirmed: 'Confirmed',
        preparing: 'Preparing',
        out_for_delivery: 'Out for delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };

    const STATUS_COLORS = {
        placed: '#f59e0b',
        confirmed: '#3b82f6',
        preparing: '#f97316',
        out_for_delivery: '#6366f1',
        delivered: '#22c55e',
        cancelled: '#ef4444'
    };

    const VIEW_META = {
        dashboard: {
            title: 'Dashboard',
            subtitle: "A snapshot of today's restaurant activity."
        },
        orders: {
            title: 'Orders',
            subtitle: 'Track, update and manage every delivery.'
        },
        menu: {
            title: 'Menu',
            subtitle: 'Add dishes, change prices and control availability.'
        }
    };

    const state = {
        admin: null,
        view: 'dashboard',
        stats: null,
        orders: {
            list: [],
            page: 1,
            pages: 1,
            total: 0,
            status: 'all',
            q: ''
        },
        menu: [],
        menuFilter: ''
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const els = {
        loginView: $('#login-view'),
        appView: $('#app-view'),
        loginForm: $('#login-form'),
        loginEmail: $('#login-email'),
        loginPassword: $('#login-password'),
        loginError: $('#login-error'),
        loginBtn: $('#login-btn'),
        togglePassword: $('#toggle-password'),

        adminName: $('#admin-name'),
        adminEmail: $('#admin-email'),
        logoutBtn: $('#logout-btn'),
        pageTitle: $('#page-title'),
        pageSubtitle: $('#page-subtitle'),
        refreshBtn: $('#refresh-btn'),

        sidebar: $('#sidebar'),
        sidebarBackdrop: $('#sidebar-backdrop'),
        sidebarToggle: $('#sidebar-toggle'),
        activeOrderBadge: $('#active-order-badge'),

        statsGrid: $('#stats-grid'),
        statTotalOrders: $('#stat-total-orders'),
        statTodayOrders: $('#stat-today-orders'),
        statActiveOrders: $('#stat-active-orders'),
        statRevenue: $('#stat-revenue'),
        statDeliveredRevenue: $('#stat-delivered-revenue'),
        statCustomers: $('#stat-customers'),
        statMenuItems: $('#stat-menu-items'),
        recentOrdersBody: $('#recent-orders-body'),
        statusBreakdown: $('#status-breakdown'),

        orderSearch: $('#order-search'),
        orderStatusFilter: $('#order-status-filter'),
        ordersRefresh: $('#orders-refresh'),
        ordersBody: $('#orders-body'),
        ordersCount: $('#orders-count'),
        ordersPage: $('#orders-page'),
        ordersPrev: $('#orders-prev'),
        ordersNext: $('#orders-next'),

        menuFilter: $('#menu-filter'),
        menuBody: $('#menu-body'),
        addMenuItem: $('#add-menu-item'),

        orderModal: $('#order-modal'),
        orderModalTitle: $('#order-modal-title'),
        orderModalSubtitle: $('#order-modal-subtitle'),
        orderModalBody: $('#order-modal-body'),

        menuModal: $('#menu-modal'),
        menuModalTitle: $('#menu-modal-title'),
        menuForm: $('#menu-form'),
        menuFormError: $('#menu-form-error'),
        menuSaveBtn: $('#menu-save-btn'),
        menuId: $('#menu-id'),
        menuName: $('#menu-name'),
        menuCategory: $('#menu-category'),
        menuPrice: $('#menu-price'),
        menuOldPrice: $('#menu-old-price'),
        menuRating: $('#menu-rating'),
        menuSort: $('#menu-sort'),
        menuImage: $('#menu-image'),
        menuDescription: $('#menu-description'),
        menuAvailable: $('#menu-available'),
        menuOffer: $('#menu-offer'),

        toast: $('#toast')
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

    function statusLabel(status) {
        return STATUS_LABELS[status] || status;
    }

    function statusOptions(selected) {
        return STATUSES.map(
            (status) =>
                `<option value="${status}"${status === selected ? ' selected' : ''}>${statusLabel(status)}</option>`
        ).join('');
    }

    function formatDate(value) {
        if (!value) return '—';
        return new Date(value).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function formatTime(value) {
        if (!value) return '';
        return new Date(value).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function toast(message, type) {
        if (!els.toast) return;

        els.toast.textContent = message;
        els.toast.classList.toggle('error', type === 'error');
        els.toast.classList.add('show');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
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

        if (response.status === 401 && !url.endsWith('/login')) {
            showLogin();
            throw new Error('Please sign in again.');
        }

        if (!response.ok) {
            throw new Error((data && data.error) || 'Something went wrong. Please try again.');
        }

        return data;
    }

    function openModal(modal) {
        if (!modal) return;
        modal.hidden = false;
        document.body.classList.add('no-scroll');
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.hidden = true;

        const anyOpen = $$('.modal').some((element) => !element.hidden);
        if (!anyOpen) document.body.classList.remove('no-scroll');
    }

    /* ---------------------------------------------------------
       Authentication
       --------------------------------------------------------- */
    function showLogin() {
        state.admin = null;
        els.appView.hidden = true;
        els.loginView.hidden = false;
        closeSidebar();
        setTimeout(() => els.loginEmail && els.loginEmail.focus(), 50);
    }

    function showApp() {
        els.loginView.hidden = true;
        els.appView.hidden = false;

        if (state.admin) {
            els.adminName.textContent = state.admin.name || 'Admin';
            els.adminEmail.textContent = state.admin.email || '';
            const avatar = $('.avatar');
            if (avatar) avatar.textContent = (state.admin.name || 'A').charAt(0).toUpperCase();
        }

        switchView('dashboard');
    }

    async function handleLogin(event) {
        event.preventDefault();

        els.loginError.textContent = '';
        els.loginBtn.disabled = true;
        els.loginBtn.textContent = 'Signing in…';

        try {
            const data = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: els.loginEmail.value.trim(),
                    password: els.loginPassword.value
                })
            });

            state.admin = data.admin;
            els.loginForm.reset();
            showApp();
            toast(`Welcome back, ${state.admin.name || 'admin'}.`);
        } catch (error) {
            els.loginError.textContent = error.message;
        } finally {
            els.loginBtn.disabled = false;
            els.loginBtn.textContent = 'Sign in';
        }
    }

    async function handleLogout() {
        try {
            await api('/api/auth/logout', { method: 'POST' });
        } catch (_error) {
            /* The local session is cleared anyway. */
        }

        showLogin();
        toast('Signed out.');
    }

    /* ---------------------------------------------------------
       Navigation
       --------------------------------------------------------- */
    function switchView(view) {
        state.view = view;

        $$('.side-link[data-view]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.view === view);
        });

        $$('.view').forEach((section) => {
            section.hidden = section.id !== `view-${view}`;
        });

        const meta = VIEW_META[view] || VIEW_META.dashboard;
        els.pageTitle.textContent = meta.title;
        els.pageSubtitle.textContent = meta.subtitle;

        closeSidebar();

        if (view === 'dashboard') loadDashboard();
        if (view === 'orders') loadOrders();
        if (view === 'menu') loadMenu();
    }

    function openSidebar() {
        els.sidebar.classList.add('open');
        els.sidebarBackdrop.hidden = false;
        els.sidebarToggle.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
        if (!els.sidebar) return;
        els.sidebar.classList.remove('open');
        if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = true;
        if (els.sidebarToggle) els.sidebarToggle.setAttribute('aria-expanded', 'false');
    }

    /* ---------------------------------------------------------
       Dashboard
       --------------------------------------------------------- */
    async function loadDashboard() {
        try {
            const data = await api('/api/admin/stats');
            state.stats = data.stats;

            els.statTotalOrders.textContent = data.stats.totalOrders;
            els.statTodayOrders.textContent = `${data.stats.todayOrders} today`;
            els.statActiveOrders.textContent = data.stats.activeOrders;
            els.statRevenue.textContent = money(data.stats.revenue);
            els.statDeliveredRevenue.textContent = `${money(data.stats.deliveredRevenue)} delivered`;
            els.statCustomers.textContent = data.stats.customerCount;
            els.statMenuItems.textContent = `${data.stats.menuCount} menu items`;

            updateActiveBadge(data.stats.activeOrders);
            renderBreakdown(data.stats.statusCounts);
            renderRecentOrders(data.recentOrders || []);
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    function updateActiveBadge(count) {
        if (!els.activeOrderBadge) return;
        els.activeOrderBadge.textContent = String(count);
        els.activeOrderBadge.hidden = !count;
    }

    function renderBreakdown(counts) {
        if (!els.statusBreakdown) return;

        const max = Math.max(1, ...Object.values(counts || {}));

        els.statusBreakdown.innerHTML = STATUSES.map((status) => {
            const count = (counts && counts[status]) || 0;
            const width = Math.round((count / max) * 100);

            return `
                <div class="breakdown-row">
                    <strong>${statusLabel(status)}</strong>
                    <div class="breakdown-bar">
                        <span style="width: ${width}%; background: ${STATUS_COLORS[status]}"></span>
                    </div>
                    <span class="count">${count}</span>
                </div>
            `;
        }).join('');
    }

    function renderRecentOrders(orders) {
        if (!els.recentOrdersBody) return;

        if (orders.length === 0) {
            els.recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No orders yet.</td></tr>';
            return;
        }

        els.recentOrdersBody.innerHTML = orders
            .map(
                (order) => `
                <tr>
                    <td><button type="button" class="order-number" data-open-order="${escapeHtml(order.id)}">${escapeHtml(order.orderNumber)}</button></td>
                    <td>
                        <div class="cell-stack">
                            <span>${escapeHtml(order.customer.name)}</span>
                            <small>${escapeHtml(order.customer.phone)}</small>
                        </div>
                    </td>
                    <td><strong>${money(order.total)}</strong></td>
                    <td><span class="status-pill status-${escapeHtml(order.status)}">${statusLabel(order.status)}</span></td>
                </tr>
            `
            )
            .join('');
    }

    /* ---------------------------------------------------------
       Orders
       --------------------------------------------------------- */
    async function loadOrders() {
        if (els.ordersBody) {
            els.ordersBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading…</td></tr>';
        }

        const params = new URLSearchParams({
            status: state.orders.status,
            q: state.orders.q,
            page: String(state.orders.page),
            limit: '25'
        });

        try {
            const data = await api(`/api/admin/orders?${params.toString()}`);

            state.orders.list = data.orders || [];
            state.orders.page = data.page;
            state.orders.pages = data.pages;
            state.orders.total = data.total;

            renderOrders();
        } catch (error) {
            toast(error.message, 'error');
            if (els.ordersBody) {
                els.ordersBody.innerHTML =
                    '<tr><td colspan="7" class="empty-cell">Could not load orders.</td></tr>';
            }
        }
    }

    function renderOrders() {
        if (!els.ordersBody) return;

        if (state.orders.list.length === 0) {
            els.ordersBody.innerHTML =
                '<tr><td colspan="7" class="empty-cell">No orders match this filter.</td></tr>';
        } else {
            els.ordersBody.innerHTML = state.orders.list
                .map((order) => {
                    const itemCount = (order.items || []).reduce((sum, item) => sum + item.qty, 0);

                    return `
                    <tr>
                        <td><button type="button" class="order-number" data-open-order="${escapeHtml(order.id)}">${escapeHtml(order.orderNumber)}</button></td>
                        <td>
                            <div class="cell-stack">
                                <span>${escapeHtml(order.customer.name)}</span>
                                <small>${escapeHtml(order.customer.phone)}</small>
                            </div>
                        </td>
                        <td><span class="item-count">${itemCount} item${itemCount === 1 ? '' : 's'}</span></td>
                        <td><strong>${money(order.total)}</strong></td>
                        <td>
                            <select class="status-select status-${escapeHtml(order.status)}" data-status-order="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.orderNumber)}">
                                ${statusOptions(order.status)}
                            </select>
                        </td>
                        <td>
                            <div class="cell-stack">
                                <span>${formatDate(order.createdAt)}</span>
                                <small>${formatTime(order.createdAt)}</small>
                            </div>
                        </td>
                        <td>
                            <div class="row-actions">
                                <button type="button" class="icon-action" data-open-order="${escapeHtml(order.id)}" title="View order" aria-label="View order ${escapeHtml(order.orderNumber)}">
                                    <i class='bx bx-show' aria-hidden="true"></i>
                                </button>
                                <button type="button" class="icon-action danger" data-delete-order="${escapeHtml(order.id)}" data-order-number="${escapeHtml(order.orderNumber)}" title="Delete order" aria-label="Delete order ${escapeHtml(order.orderNumber)}">
                                    <i class='bx bx-trash' aria-hidden="true"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                })
                .join('');
        }

        els.ordersCount.textContent = `${state.orders.total} order${state.orders.total === 1 ? '' : 's'}`;
        els.ordersPage.textContent = `Page ${state.orders.page} of ${state.orders.pages}`;
        els.ordersPrev.disabled = state.orders.page <= 1;
        els.ordersNext.disabled = state.orders.page >= state.orders.pages;
    }

    async function updateOrderStatus(id, status, select) {
        if (!select) return;

        select.disabled = true;

        try {
            const data = await api(`/api/admin/orders/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });

            const local = state.orders.list.find((order) => order.id === id);
            if (local) Object.assign(local, data.order);

            select.className = `status-select status-${status}`;
            select.value = status;

            toast(`Order ${data.order.orderNumber} → ${statusLabel(status)}`);
            refreshActiveBadge();
        } catch (error) {
            const local = state.orders.list.find((order) => order.id === id);
            if (local) {
                select.value = local.status;
                select.className = `status-select status-${local.status}`;
            }
            toast(error.message, 'error');
        } finally {
            select.disabled = false;
        }
    }

    async function refreshActiveBadge() {
        try {
            const data = await api('/api/admin/stats');
            updateActiveBadge(data.stats.activeOrders);
            state.stats = data.stats;
        } catch (_error) {
            /* Non-critical. */
        }
    }

    async function openOrderDetail(id) {
        try {
            const data = await api(`/api/admin/orders/${id}`);
            renderOrderDetail(data.order);
            openModal(els.orderModal);
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    function renderOrderDetail(order) {
        const itemCount = (order.items || []).reduce((sum, item) => sum + item.qty, 0);

        els.orderModalTitle.textContent = `Order ${order.orderNumber}`;
        els.orderModalSubtitle.textContent = `Placed ${formatDate(order.createdAt)} at ${formatTime(
            order.createdAt
        )} · ${itemCount} item${itemCount === 1 ? '' : 's'}`;

        const items = (order.items || [])
            .map(
                (item) => `
                <div class="detail-item">
                    <img src="${escapeHtml(imgSrc(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy">
                    <div>
                        <strong>${escapeHtml(item.name)}</strong><br>
                        <small>${item.qty} × ${money(item.price)}</small>
                    </div>
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
                    <strong>${statusLabel(event.status)}</strong>
                    <span>${escapeHtml(event.note || '')}</span>
                    <span>· ${formatDate(event.at)} ${formatTime(event.at)}</span>
                </li>
            `
            )
            .join('');

        els.orderModalBody.innerHTML = `
            <div class="order-detail-head">
                <div>
                    <h3>${escapeHtml(order.customer.name)}</h3>
                    <p>${escapeHtml(order.customer.phone)}${order.customer.email ? ` · ${escapeHtml(order.customer.email)}` : ''}</p>
                </div>
                <span class="status-pill status-${escapeHtml(order.status)}">${statusLabel(order.status)}</span>
            </div>

            <div class="detail-grid">
                <div>
                    <h4>Delivery address</h4>
                    <p>${escapeHtml(order.customer.address)}</p>
                </div>
                <div>
                    <h4>Payment</h4>
                    <p>Cash on delivery</p>
                </div>
                <div>
                    <h4>Estimated delivery</h4>
                    <p>${order.estimatedDelivery ? `${formatDate(order.estimatedDelivery)} ${formatTime(order.estimatedDelivery)}` : '—'}</p>
                </div>
                <div>
                    <h4>Customer note</h4>
                    <p>${order.note ? escapeHtml(order.note) : 'No note'}</p>
                </div>
            </div>

            <div class="detail-items">${items}</div>

            <div class="detail-totals">
                <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
                <div><span>Delivery</span><span>${order.deliveryFee === 0 ? 'Free' : money(order.deliveryFee)}</span></div>
                <div class="grand"><span>Total</span><strong>${money(order.total)}</strong></div>
            </div>

            <div class="detail-history">
                <h4>Order updates</h4>
                <ul>${history || '<li>No updates yet.</li>'}</ul>
            </div>

            <div class="detail-actions">
                <select class="select" id="detail-status" aria-label="Change order status">
                    ${statusOptions(order.status)}
                </select>
                <button type="button" class="btn-primary" id="detail-save-status" data-id="${escapeHtml(order.id)}">Update status</button>
                <button type="button" class="btn-danger" data-delete-order="${escapeHtml(order.id)}" data-order-number="${escapeHtml(order.orderNumber)}">
                    <i class='bx bx-trash' aria-hidden="true"></i> Delete
                </button>
            </div>
        `;

        const saveButton = $('#detail-save-status');
        if (saveButton) {
            saveButton.addEventListener('click', async () => {
                const select = $('#detail-status');
                const status = select.value;

                saveButton.disabled = true;
                try {
                    const data = await api(`/api/admin/orders/${order.id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status })
                    });

                    renderOrderDetail(data.order);
                    toast(`Order ${data.order.orderNumber} → ${statusLabel(status)}`);
                    if (state.view === 'orders') loadOrders();
                    refreshActiveBadge();
                } catch (error) {
                    toast(error.message, 'error');
                } finally {
                    saveButton.disabled = false;
                }
            });
        }
    }

    async function deleteOrder(id, orderNumber) {
        const confirmed = window.confirm(
            `Delete order ${orderNumber || ''}? This removes it permanently from the database.`
        );
        if (!confirmed) return;

        try {
            await api(`/api/admin/orders/${id}`, { method: 'DELETE' });
            toast('Order deleted.');
            closeModal(els.orderModal);
            if (state.view === 'orders') loadOrders();
            if (state.view === 'dashboard') loadDashboard();
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    /* ---------------------------------------------------------
       Menu
       --------------------------------------------------------- */
    async function loadMenu() {
        if (els.menuBody) {
            els.menuBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading…</td></tr>';
        }

        try {
            const data = await api('/api/admin/menu');
            state.menu = data.items || [];
            renderMenuTable();
        } catch (error) {
            toast(error.message, 'error');
            if (els.menuBody) {
                els.menuBody.innerHTML =
                    '<tr><td colspan="7" class="empty-cell">Could not load the menu.</td></tr>';
            }
        }
    }

    function renderMenuTable() {
        if (!els.menuBody) return;

        const query = state.menuFilter.trim().toLowerCase();
        const items = state.menu.filter((item) => {
            if (!query) return true;
            return `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query);
        });

        if (items.length === 0) {
            els.menuBody.innerHTML =
                '<tr><td colspan="7" class="empty-cell">No menu items found.</td></tr>';
            return;
        }

        els.menuBody.innerHTML = items
            .map(
                (item) => `
                <tr>
                    <td>
                        <div class="menu-cell">
                            <img class="menu-thumb" src="${escapeHtml(imgSrc(item.image))}" alt="" loading="lazy">
                            <div>
                                <strong>${escapeHtml(item.name)}</strong>
                                <small title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="tag ${item.isOffer ? '' : 'tag-off'}">${escapeHtml(item.category)}</span></td>
                    <td>
                        <strong>${money(item.price)}</strong>
                        ${item.oldPrice ? `<br><small class="muted"><s>${money(item.oldPrice)}</s></small>` : ''}
                    </td>
                    <td>${Number(item.rating).toFixed(1)} ★</td>
                    <td>
                        <label class="toggle" title="Toggle availability">
                            <input type="checkbox" data-menu-available="${escapeHtml(item.id)}" ${item.available ? 'checked' : ''} aria-label="Available: ${escapeHtml(item.name)}">
                            <span></span>
                        </label>
                    </td>
                    <td>${item.isOffer ? '<span class="tag">Offer</span>' : '<span class="tag tag-off">—</span>'}</td>
                    <td>
                        <div class="row-actions">
                            <button type="button" class="icon-action" data-edit-menu="${escapeHtml(item.id)}" title="Edit item" aria-label="Edit ${escapeHtml(item.name)}">
                                <i class='bx bx-edit-alt' aria-hidden="true"></i>
                            </button>
                            <button type="button" class="icon-action danger" data-delete-menu="${escapeHtml(item.id)}" data-item-name="${escapeHtml(item.name)}" title="Delete item" aria-label="Delete ${escapeHtml(item.name)}">
                                <i class='bx bx-trash' aria-hidden="true"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `
            )
            .join('');
    }

    async function toggleAvailability(id, checkbox) {
        const item = state.menu.find((entry) => entry.id === id);
        if (!item) return;

        checkbox.disabled = true;

        try {
            const data = await api(`/api/admin/menu/${id}`, {
                method: 'PUT',
                body: JSON.stringify(foodPayload({ ...item, available: checkbox.checked }))
            });

            Object.assign(item, data.item);
            toast(`${item.name} is now ${item.available ? 'available' : 'hidden'}.`);
        } catch (error) {
            checkbox.checked = !checkbox.checked;
            toast(error.message, 'error');
        } finally {
            checkbox.disabled = false;
        }
    }

    function foodPayload(item) {
        return {
            name: item.name,
            description: item.description,
            price: item.price,
            oldPrice: item.oldPrice || null,
            category: item.category,
            image: item.image,
            rating: item.rating,
            sortOrder: item.sortOrder || 0,
            available: item.available,
            isOffer: item.isOffer
        };
    }

    function openMenuEditor(item) {
        els.menuForm.reset();
        els.menuFormError.textContent = '';
        els.menuId.value = item ? item.id : '';
        els.menuModalTitle.textContent = item ? `Edit ${item.name}` : 'Add menu item';

        if (item) {
            els.menuName.value = item.name;
            els.menuCategory.value = item.category;
            els.menuPrice.value = item.price;
            els.menuOldPrice.value = item.oldPrice || '';
            els.menuRating.value = item.rating;
            els.menuSort.value = item.sortOrder || 0;
            els.menuImage.value = item.image || '';
            els.menuDescription.value = item.description;
            els.menuAvailable.checked = item.available;
            els.menuOffer.checked = item.isOffer;
        } else {
            els.menuRating.value = 4.5;
            els.menuSort.value = 0;
            els.menuAvailable.checked = true;
            els.menuOffer.checked = false;
        }

        openModal(els.menuModal);
        setTimeout(() => els.menuName.focus(), 60);
    }

    async function saveMenuItem(event) {
        event.preventDefault();

        const id = els.menuId.value;
        const payload = {
            name: els.menuName.value.trim(),
            category: els.menuCategory.value.trim(),
            price: els.menuPrice.value,
            oldPrice: els.menuOldPrice.value === '' ? null : els.menuOldPrice.value,
            rating: els.menuRating.value,
            sortOrder: els.menuSort.value,
            image: els.menuImage.value.trim(),
            description: els.menuDescription.value.trim(),
            available: els.menuAvailable.checked,
            isOffer: els.menuOffer.checked
        };

        if (!payload.name || !payload.category || !payload.description || payload.price === '') {
            els.menuFormError.textContent = 'Name, category, price and description are required.';
            return;
        }

        els.menuFormError.textContent = '';
        els.menuSaveBtn.disabled = true;
        const label = els.menuSaveBtn.textContent;
        els.menuSaveBtn.textContent = 'Saving…';

        try {
            await api(id ? `/api/admin/menu/${id}` : '/api/admin/menu', {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(payload)
            });

            closeModal(els.menuModal);
            toast(id ? 'Menu item updated.' : 'Menu item added.');
            loadMenu();
        } catch (error) {
            els.menuFormError.textContent = error.message;
        } finally {
            els.menuSaveBtn.disabled = false;
            els.menuSaveBtn.textContent = label;
        }
    }

    async function deleteMenuItem(id, name) {
        const confirmed = window.confirm(`Delete "${name}" from the menu?`);
        if (!confirmed) return;

        try {
            await api(`/api/admin/menu/${id}`, { method: 'DELETE' });
            toast('Menu item deleted.');
            loadMenu();
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    /* ---------------------------------------------------------
       Events
       --------------------------------------------------------- */
    function bindEvents() {
        els.loginForm.addEventListener('submit', handleLogin);
        els.logoutBtn.addEventListener('click', handleLogout);

        if (els.togglePassword) {
            els.togglePassword.addEventListener('click', () => {
                const isHidden = els.loginPassword.type === 'password';
                els.loginPassword.type = isHidden ? 'text' : 'password';
                els.togglePassword.innerHTML = isHidden
                    ? "<i class='bx bx-hide' aria-hidden='true'></i>"
                    : "<i class='bx bx-show' aria-hidden='true'></i>";
                els.togglePassword.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            });
        }

        $$('.side-link[data-view]').forEach((button) => {
            button.addEventListener('click', () => switchView(button.dataset.view));
        });

        els.sidebarToggle.addEventListener('click', () => {
            if (els.sidebar.classList.contains('open')) closeSidebar();
            else openSidebar();
        });

        els.sidebarBackdrop.addEventListener('click', closeSidebar);

        els.refreshBtn.addEventListener('click', () => {
            if (state.view === 'dashboard') loadDashboard();
            if (state.view === 'orders') loadOrders();
            if (state.view === 'menu') loadMenu();
            toast('Refreshed.');
        });

        /* Orders toolbar */
        els.orderStatusFilter.addEventListener('change', () => {
            state.orders.status = els.orderStatusFilter.value;
            state.orders.page = 1;
            loadOrders();
        });

        els.orderSearch.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.orders.q = els.orderSearch.value.trim();
                state.orders.page = 1;
                loadOrders();
            }, 320);
        });

        els.ordersRefresh.addEventListener('click', () => loadOrders());
        els.ordersPrev.addEventListener('click', () => {
            if (state.orders.page > 1) {
                state.orders.page -= 1;
                loadOrders();
            }
        });
        els.ordersNext.addEventListener('click', () => {
            if (state.orders.page < state.orders.pages) {
                state.orders.page += 1;
                loadOrders();
            }
        });

        els.ordersBody.addEventListener('change', (event) => {
            const select = event.target.closest('[data-status-order]');
            if (!select) return;
            updateOrderStatus(select.dataset.statusOrder, select.value, select);
        });

        /* Menu toolbar */
        els.addMenuItem.addEventListener('click', () => openMenuEditor(null));

        els.menuFilter.addEventListener('input', () => {
            state.menuFilter = els.menuFilter.value;
            renderMenuTable();
        });

        els.menuBody.addEventListener('change', (event) => {
            const checkbox = event.target.closest('[data-menu-available]');
            if (!checkbox) return;
            toggleAvailability(checkbox.dataset.menuAvailable, checkbox);
        });

        els.menuForm.addEventListener('submit', saveMenuItem);

        /* Delegated actions */
        document.addEventListener('click', (event) => {
            const goto = event.target.closest('[data-goto]');
            if (goto) {
                switchView(goto.dataset.goto);
                return;
            }

            const openOrder = event.target.closest('[data-open-order]');
            if (openOrder) {
                event.preventDefault();
                openOrderDetail(openOrder.dataset.openOrder);
                return;
            }

            const deleteOrderButton = event.target.closest('[data-delete-order]');
            if (deleteOrderButton) {
                event.preventDefault();
                deleteOrder(deleteOrderButton.dataset.deleteOrder, deleteOrderButton.dataset.orderNumber);
                return;
            }

            const editMenu = event.target.closest('[data-edit-menu]');
            if (editMenu) {
                const item = state.menu.find((entry) => entry.id === editMenu.dataset.editMenu);
                if (item) openMenuEditor(item);
                return;
            }

            const deleteMenu = event.target.closest('[data-delete-menu]');
            if (deleteMenu) {
                deleteMenuItem(deleteMenu.dataset.deleteMenu, deleteMenu.dataset.itemName || 'this item');
                return;
            }

            const closeTrigger = event.target.closest('[data-close-modal]');
            if (closeTrigger) {
                closeModal(closeTrigger.closest('.modal'));
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;

            const openModals = $$('.modal').filter((modal) => !modal.hidden);
            if (openModals.length > 0) {
                closeModal(openModals[openModals.length - 1]);
            } else {
                closeSidebar();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 980) closeSidebar();
        });
    }

    /* ---------------------------------------------------------
       Boot
       --------------------------------------------------------- */
    async function boot() {
        bindEvents();

        try {
            const data = await api('/api/auth/me');

            if (data.admin) {
                state.admin = data.admin;
                showApp();
            } else {
                showLogin();
            }
        } catch (_error) {
            showLogin();
        }
    }

    boot();
})();
