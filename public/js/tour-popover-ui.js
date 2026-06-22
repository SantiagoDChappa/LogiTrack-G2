(function () {
    'use strict';

    function enhanceFooter(popover, opts) {
        opts = opts || {};
        var footer = popover && popover.footer;
        if (!footer) return;

        function layout() {
            var progress = popover.progress || footer.querySelector('.driver-popover-progress-text');
            var navWrap = popover.footerButtons || footer.querySelector('.driver-popover-navigation-btns');

            var skipBtn = footer.querySelector('.lgt-tour-skip');
            if (!skipBtn) {
                skipBtn = document.createElement('button');
                skipBtn.type = 'button';
                skipBtn.textContent = opts.skipLabel || 'Saltar';
                skipBtn.className = 'lgt-tour-skip';
                if (typeof opts.onSkip === 'function') {
                    skipBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        e.preventDefault();
                        opts.onSkip();
                    });
                }
            }

            var manualLink = footer.querySelector('.lgt-tour-manual-link');
            if (!manualLink && opts.helpSlug) {
                manualLink = document.createElement('a');
                manualLink.href = '/help/' + opts.helpSlug;
                manualLink.className = 'lgt-tour-manual-link';
                manualLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">menu_book</span><span>Ver manual</span>';
            }

            var topRow = document.createElement('div');
            topRow.className = 'lgt-tour-footer-top';

            var navRow = document.createElement('div');
            navRow.className = 'lgt-tour-footer-nav';

            if (manualLink) topRow.appendChild(manualLink);
            if (progress) topRow.appendChild(progress);

            navRow.appendChild(skipBtn);
            if (navWrap) navRow.appendChild(navWrap);

            footer.replaceChildren(topRow, navRow);

            footer.style.setProperty('display', 'flex', 'important');
            footer.style.setProperty('flex-direction', 'column', 'important');
            footer.style.setProperty('align-items', 'stretch', 'important');
            footer.style.setProperty('justify-content', 'flex-start', 'important');
            footer.style.setProperty('gap', '12px', 'important');
        }

        layout();
        requestAnimationFrame(layout);
    }

    window.lgtTourPopover = { enhanceFooter: enhanceFooter };
})();
