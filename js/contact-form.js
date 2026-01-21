(function() {
    'use strict';

    const ContactForm = {
        modal: null,
        overlay: null,

        init: function() {
            this.createModal();
            this.bindEvents();
        },

        createModal: function() {
            // Create overlay
            this.overlay = document.createElement('div');
            this.overlay.id = 'contact-overlay';
            this.overlay.style.cssText = `
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 9999;
            `;

            // Create modal
            this.modal = document.createElement('div');
            this.modal.id = 'contact-modal';
            this.modal.style.cssText = `
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #0a0a0a;
                border: 2px solid #00ff00;
                padding: 30px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                z-index: 10000;
                font-family: 'Courier New', monospace;
                color: #00ff00;
            `;

            this.modal.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <h2 style="color: #00ff00; margin-bottom: 10px; font-size: 18px;">CONTACT REQUEST</h2>
                    <div style="height: 2px; background: #00ff00; margin-bottom: 20px;"></div>
                </div>

                <form id="contact-form-element">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Name *</label>
                        <input type="text" name="name" required style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Email *</label>
                        <input type="email" name="email" required style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Phone (optional)</label>
                        <input type="tel" name="phone" style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Service Interest *</label>
                        <select name="service" required style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; box-sizing: border-box;">
                            <option value="">-- Select Service --</option>
                            <option value="ai-security">AI Security & Implementation</option>
                            <option value="pentest">Penetration Testing</option>
                            <option value="data-recovery">Data Recovery</option>
                            <option value="cloud">Cloud Migration & Security</option>
                            <option value="forensics">Digital Forensics</option>
                            <option value="reverse-eng">Reverse Engineering</option>
                            <option value="consulting">General Consulting</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Urgency *</label>
                        <select name="urgency" required style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; box-sizing: border-box;">
                            <option value="standard">Standard (5-7 days)</option>
                            <option value="urgent">Urgent (2-3 days)</option>
                            <option value="emergency">Emergency (24 hours)</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Message *</label>
                        <textarea name="message" required rows="5" style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #333; color: #00ff00; font-family: inherit; resize: vertical; box-sizing: border-box;"></textarea>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Preferred Contact Method *</label>
                        <div style="display: flex; gap: 15px;">
                            <label style="color: #888;">
                                <input type="radio" name="contact_method" value="email" checked style="margin-right: 5px;">
                                Email
                            </label>
                            <label style="color: #888;">
                                <input type="radio" name="contact_method" value="signal" style="margin-right: 5px;">
                                Signal
                            </label>
                            <label style="color: #888;">
                                <input type="radio" name="contact_method" value="phone" style="margin-right: 5px;">
                                Phone
                            </label>
                        </div>
                    </div>

                    <div id="form-message" style="margin-bottom: 15px; padding: 10px; display: none;"></div>

                    <div style="display: flex; gap: 10px;">
                        <button type="submit" style="flex: 1; padding: 10px; background: #00ff00; color: #0a0a0a; border: none; cursor: pointer; font-family: inherit; font-weight: bold;">
                            SUBMIT
                        </button>
                        <button type="button" id="close-modal" style="flex: 1; padding: 10px; background: #333; color: #00ff00; border: 1px solid #00ff00; cursor: pointer; font-family: inherit;">
                            CLOSE
                        </button>
                    </div>
                </form>
            `;

            document.body.appendChild(this.overlay);
            document.body.appendChild(this.modal);
        },

        bindEvents: function() {
            const form = document.getElementById('contact-form-element');
            const closeBtn = document.getElementById('close-modal');

            form.addEventListener('submit', (e) => this.handleSubmit(e));
            closeBtn.addEventListener('click', () => this.hide());
            this.overlay.addEventListener('click', () => this.hide());

            // Prevent overlay click from closing when clicking modal
            this.modal.addEventListener('click', (e) => e.stopPropagation());

            // ESC key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal.style.display === 'block') {
                    this.hide();
                }
            });
        },

        show: function() {
            this.overlay.style.display = 'block';
            this.modal.style.display = 'block';
            document.getElementById('form-message').style.display = 'none';
            // Focus first input
            const firstInput = this.modal.querySelector('input[name="name"]');
            if (firstInput) firstInput.focus();
        },

        hide: function() {
            this.overlay.style.display = 'none';
            this.modal.style.display = 'none';
            document.getElementById('contact-form-element').reset();
            // Refocus terminal input
            const terminalInput = document.getElementById('command-input');
            if (terminalInput) terminalInput.focus();
        },

        handleSubmit: function(e) {
            e.preventDefault();

            const form = e.target;
            const formData = new FormData(form);
            const messageDiv = document.getElementById('form-message');

            // Convert FormData to object
            const data = {};
            formData.forEach((value, key) => {
                data[key] = value;
            });

            // Add timestamp
            data.timestamp = new Date().toISOString();

            // Show loading state
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#333';
            messageDiv.style.color = '#00ff00';
            messageDiv.textContent = 'Sending...';

            // Submit to API
            fetch('/api/contact.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    messageDiv.style.background = '#00ff00';
                    messageDiv.style.color = '#0a0a0a';
                    messageDiv.textContent = 'Message sent successfully! We will contact you soon.';

                    setTimeout(() => {
                        this.hide();
                    }, 3000);
                } else {
                    throw new Error(result.error || 'Submission failed');
                }
            })
            .catch(error => {
                messageDiv.style.background = '#ff4444';
                messageDiv.style.color = '#0a0a0a';
                messageDiv.textContent = 'Error sending message. Please try again or contact directly.';
                console.error('Contact form error:', error);
            });
        }
    };

    // Make ContactForm globally available
    window.ContactForm = ContactForm;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ContactForm.init());
    } else {
        ContactForm.init();
    }
})();
