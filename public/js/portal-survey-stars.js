(function () {
    document.querySelectorAll('.portal-survey-stars').forEach(function (group) {
        var input = group.querySelector('input[type="hidden"]');
        var stars = group.querySelectorAll('.portal-star--input');

        function paint(upTo) {
            stars.forEach(function (s, idx) {
                s.classList.toggle('portal-star--filled', idx < upTo);
            });
        }

        stars.forEach(function (star) {
            star.addEventListener('mouseenter', function () {
                paint(Number(star.dataset.value));
            });

            star.addEventListener('click', function () {
                input.value = star.dataset.value;
                paint(Number(star.dataset.value));
            });
        });

        group.addEventListener('mouseleave', function () {
            paint(Number(input.value) || 0);
        });
    });
})();
