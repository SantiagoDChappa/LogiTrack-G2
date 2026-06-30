function toggleNavGroup(id) {
    const group = document.getElementById(id);
    if (group) group.classList.toggle('open');
}

// Auto-abrir el nav group que contiene la página actual
(function () {
    const path = window.location.pathname;
    if (path.startsWith('/dashboard/')) {
        const g = document.getElementById('nav-group-dashboard');
        if (g) g.classList.add('open');
    } else if (path.startsWith('/report/')) {
        const g = document.getElementById('nav-group-reportes');
        if (g) g.classList.add('open');
    } else if (path.startsWith('/auditoria')) {
        const g = document.getElementById('nav-group-auditoria');
        if (g) g.classList.add('open');
    } else if (path.startsWith('/setting/')) {
        const g = document.getElementById('nav-group-ajustes');
        if (g) g.classList.add('open');
    } else if (path.startsWith('/notification/')) {
        const g = document.getElementById('nav-group-notificaciones');
        if (g) g.classList.add('open');
    }
})();

const userSection  = document.querySelector('.top-header .user');
const userDropdown = document.getElementById('user-dropdown');

// LGT-217 (Esc.3) — el menú de usuario es operable por teclado (Enter/Espacio para
// abrir/cerrar, Escape para cerrar) y refleja su estado con aria-expanded.
// Guard de null (de upstream): si la página no tiene el menú, no rompe.
if (userSection && userDropdown) {
    const setUserMenu = (open) => {
        userDropdown.classList.toggle('open', open);
        userSection.classList.toggle('open', open);
        userSection.setAttribute('aria-expanded', String(open));
    };

    userSection.addEventListener('click', () => {
        setUserMenu(!userDropdown.classList.contains('open'));
    });

    userSection.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            setUserMenu(!userDropdown.classList.contains('open'));
        } else if (e.key === 'Escape' && userDropdown.classList.contains('open')) {
            setUserMenu(false);
            userSection.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!userSection.contains(e.target) && !userDropdown.contains(e.target)) {
            setUserMenu(false);
        }
    });
}

const hamburgerBtn = document.getElementById('btn-hamburger');
const leftHeader   = document.querySelector('.left-header');
const navOverlay   = document.getElementById('nav-overlay');

if (hamburgerBtn && leftHeader && navOverlay) {
    const openNav = () => {
        leftHeader.classList.add('open');
        navOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    const closeNav = () => {
        leftHeader.classList.remove('open');
        navOverlay.classList.remove('open');
        document.body.style.overflow = '';
    };

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        leftHeader.classList.contains('open') ? closeNav() : openNav();
    });

    navOverlay.addEventListener('click', closeNav);

    leftHeader.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeNav);
    });

    const navCloseBtn = document.getElementById('btn-nav-close');
    if (navCloseBtn) {
        navCloseBtn.addEventListener('click', closeNav);
    }
}
