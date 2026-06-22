(function () {
    'use strict';

    var input = document.getElementById('help-search-input');
    if (!input) return;

    var cards = Array.prototype.slice.call(document.querySelectorAll('.help-card'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('.help-section'));
    var emptyMsg = document.getElementById('help-search-empty');

    function normalize(str) {
        return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function filterArticles() {
        var q = normalize(input.value.trim());
        var visible = 0;

        cards.forEach(function (card) {
            var haystack = normalize(
                (card.getAttribute('data-title') || '') + ' ' +
                (card.getAttribute('data-summary') || '') + ' ' +
                (card.getAttribute('data-keywords') || '')
            );
            var match = !q || haystack.indexOf(q) >= 0;
            card.hidden = !match;
            if (match) visible++;
        });

        sections.forEach(function (section) {
            var anyVisible = section.querySelector('.help-card:not([hidden])');
            section.hidden = !anyVisible;
        });

        if (emptyMsg) emptyMsg.hidden = visible > 0 || !q;
    }

    input.addEventListener('input', filterArticles);

    var replayBtn = document.getElementById('btn-replay-tour-help');
    if (replayBtn && window.__LGT) {
        replayBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var roleId = Number(window.__LGT.roleId);
            fetch('/api/onboarding/replay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
                .then(function () {
                    try { sessionStorage.removeItem('lgt_tour_redirected'); } catch (_) {}
                    try { sessionStorage.removeItem('lgt_tour_dismissed'); } catch (_) {}
                    window.location.href = roleId === 3 ? '/delivery' : '/home';
                })
                .catch(function () {});
        });
    }
})();
