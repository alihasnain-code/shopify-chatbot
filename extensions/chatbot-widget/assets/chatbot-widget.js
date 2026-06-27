// Chat Widget — handles open/close toggling.
// The header no longer has a close button; the floating toggle is the only control.

document.addEventListener('DOMContentLoaded', function () {
    var widgets = document.querySelectorAll('[data-chatbot-widget]');

    widgets.forEach(function (widget) {
        var toggleBtn = widget.querySelector('[data-chatbot-toggle]');
        var chatWindow = widget.querySelector('[data-chatbot-window]');

        function openChat() {
            widget.classList.add('is-open');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
            if (chatWindow) chatWindow.setAttribute('aria-hidden', 'false');
        }

        function closeChat() {
            widget.classList.remove('is-open');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
            if (chatWindow) chatWindow.setAttribute('aria-hidden', 'true');
        }

        function toggleChat() {
            if (widget.classList.contains('is-open')) {
                closeChat();
            } else {
                openChat();
            }
        }

        // Toggle button (floating circle)
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleChat);
        }

        // Close on Escape key for accessibility
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && widget.classList.contains('is-open')) {
                closeChat();
                if (toggleBtn) toggleBtn.focus();
            }
        });

        // Auto-open if configured
        if (widget.dataset.startOpen === 'true') {
            openChat();
        }
    });
});