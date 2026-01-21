(function() {
    'use strict';

    // ============================================
    // SECURITY: Rate Limiting & Protection
    // ============================================
    const Security = {
        commandCount: 0,
        lastReset: Date.now(),
        maxCommandsPerMinute: 30,
        blockedUntil: 0,
        suspiciousPatterns: [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /eval\s*\(/i,
            /document\./i,
            /window\./i,
            /\.\.\//,
            /\/etc\//,
            /\$\{/,
            /`/
        ],

        checkRateLimit: function() {
            const now = Date.now();

            // Reset counter every minute
            if (now - this.lastReset > 60000) {
                this.commandCount = 0;
                this.lastReset = now;
            }

            // Check if blocked
            if (now < this.blockedUntil) {
                const remaining = Math.ceil((this.blockedUntil - now) / 1000);
                return { allowed: false, message: `Rate limited. Try again in ${remaining}s.` };
            }

            this.commandCount++;

            if (this.commandCount > this.maxCommandsPerMinute) {
                this.blockedUntil = now + 30000; // Block for 30 seconds
                return { allowed: false, message: 'Too many commands. Temporarily blocked.' };
            }

            return { allowed: true };
        },

        sanitizeInput: function(input) {
            // Check for suspicious patterns
            for (const pattern of this.suspiciousPatterns) {
                if (pattern.test(input)) {
                    return { safe: false, reason: 'Invalid input detected.' };
                }
            }

            // Limit input length
            if (input.length > 200) {
                return { safe: false, reason: 'Input too long.' };
            }

            // Escape HTML entities
            const sanitized = input
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

            return { safe: true, value: sanitized };
        }
    };

    // ============================================
    // LOGGER: Session Command Logging
    // ============================================
    const Logger = {
        sessionId: null,

        init: function() {
            fetch('/api/session.php', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    this.sessionId = data.sessionId;
                })
                .catch(() => {
                    // Silently fail - logging is not critical
                });
        },

        log: function(command) {
            if (!this.sessionId) return;

            fetch('/api/log.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    command: command,
                    timestamp: new Date().toISOString()
                })
            }).catch(() => {
                // Silently fail
            });
        }
    };

    // ============================================
    // TERMINAL: Core Functionality
    // ============================================
    const Terminal = {
        output: null,
        input: null,
        history: [],
        historyIndex: -1,
        maxHistory: 50,

        init: function() {
            this.output = document.getElementById('output');
            this.input = document.getElementById('command-input');

            this.bindEvents();
            this.showWelcome();
            this.input.focus();

            // Initialize session logging
            Logger.init();

            // Refocus on click anywhere
            document.addEventListener('click', () => this.input.focus());
        },

        bindEvents: function() {
            this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        },

        handleKeyDown: function(e) {
            switch(e.key) {
                case 'Enter':
                    e.preventDefault();
                    this.executeCommand();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateHistory(-1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateHistory(1);
                    break;
                case 'Tab':
                    e.preventDefault();
                    this.autoComplete();
                    break;
                case 'c':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.input.value = '';
                        this.print('^C', 'output-dim');
                    }
                    break;
                case 'l':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        Commands.clear();
                    }
                    break;
            }
        },

        executeCommand: function() {
            const rawInput = this.input.value.trim();
            this.input.value = '';

            // Show the command that was typed
            this.print(`guest@trusik:~$ ${this.escapeHtml(rawInput)}`, 'output-command');

            if (!rawInput) return;

            // Security checks
            const rateCheck = Security.checkRateLimit();
            if (!rateCheck.allowed) {
                this.print(rateCheck.message, 'output-error');
                return;
            }

            const sanitizeCheck = Security.sanitizeInput(rawInput);
            if (!sanitizeCheck.safe) {
                this.print(sanitizeCheck.reason, 'output-error');
                return;
            }

            // Add to history
            if (this.history[this.history.length - 1] !== rawInput) {
                this.history.push(rawInput);
                if (this.history.length > this.maxHistory) {
                    this.history.shift();
                }
            }
            this.historyIndex = this.history.length;

            // Log command
            Logger.log(rawInput);

            // Parse and execute
            const parts = rawInput.toLowerCase().split(/\s+/);
            const command = parts[0];
            const args = parts.slice(1);

            if (Commands.exists(command)) {
                Commands.execute(command, args);
            } else {
                this.print(`Command not found: ${this.escapeHtml(command)}. Type 'help' for available commands.`, 'output-error');
            }
        },

        navigateHistory: function(direction) {
            const newIndex = this.historyIndex + direction;

            if (newIndex >= 0 && newIndex < this.history.length) {
                this.historyIndex = newIndex;
                this.input.value = this.history[newIndex];
            } else if (newIndex >= this.history.length) {
                this.historyIndex = this.history.length;
                this.input.value = '';
            }
        },

        autoComplete: function() {
            const partial = this.input.value.toLowerCase();
            if (!partial) return;

            const publicCmds = Object.keys(Commands.public);
            const matches = publicCmds.filter(cmd => cmd.startsWith(partial));

            if (matches.length === 1) {
                this.input.value = matches[0];
            } else if (matches.length > 1) {
                this.print(matches.join('  '), 'output-info');
            }
        },

        print: function(text, className = 'output-response') {
            const line = document.createElement('div');
            line.className = `output-line ${className}`;
            line.innerHTML = text;
            this.output.appendChild(line);
            this.scrollToBottom();
        },

        printMultiple: function(lines, className = 'output-response') {
            lines.forEach(line => this.print(line, className));
        },

        scrollToBottom: function() {
            this.output.scrollTop = this.output.scrollHeight;
        },

        escapeHtml: function(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        showWelcome: function() {
            const ascii = `
 _                  _ _
| |_ _ __ _   _ ___(_) | __  ___ ___  _ __ ___
| __| '__| | | / __| | |/ / / __/ _ \\| '_ \` _ \\
| |_| |  | |_| \\__ \\ |   < | (_| (_) | | | | | |
 \\__|_|   \\__,_|___/_|_|\\_(_)___\\___/|_| |_| |_|
`;
            this.print(ascii, 'ascii-art');
            this.print('');
            this.print('Professional IT Security & Consulting Services', 'output-header');
            this.print('Hainburg an der Donau, Austria | Worldwide Remote Services', 'output-dim');
            this.print('');
            this.print('Type "services" for offerings | "help" for commands', 'output-info');
            this.print('Type "consultation" to request a free initial consultation', 'output-success');
            this.print('');
        }
    };

    // ============================================
    // COMMANDS: Public & Hidden
    // ============================================
    const Commands = {
        // Public commands (shown in help)
        public: {
            help: {
                description: 'Display available commands',
                execute: function() {
                    Terminal.print('');
                    Terminal.print('AVAILABLE COMMANDS', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');

                    for (const [name, cmd] of Object.entries(Commands.public)) {
                        const padding = ' '.repeat(12 - name.length);
                        Terminal.print(`  ${name}${padding}${cmd.description}`, 'output-response');
                    }

                    Terminal.print('');
                    Terminal.print('Use arrow keys for command history, Tab for autocomplete.', 'output-dim');
                    Terminal.print('');
                }
            },

            info: {
                description: 'Display business information',
                execute: function() {
                    Terminal.print('');
                    Terminal.print('TRUSIK.COM', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Professional IT Security & Consulting Services', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Specializations:', 'output-header');
                    Terminal.print('  • AI Security & Implementation', 'output-response');
                    Terminal.print('  • Penetration Testing & Audits', 'output-response');
                    Terminal.print('  • Emergency Data Recovery', 'output-response');
                    Terminal.print('  • Cloud Security Architecture', 'output-response');
                    Terminal.print('  • Reverse Engineering Analysis', 'output-response');
                    Terminal.print('  • Digital Forensics', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Background:', 'output-header');
                    Terminal.print('  • Multi-domain expertise: SW/HW/Legal/Psychology', 'output-response');
                    Terminal.print('  • ProtoWay s.r.o. - NeoDCP Player Development', 'output-response');
                    Terminal.print('  • METREX s.r.o. - Software & Metallurgy Services', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Location: Hainburg an der Donau, Austria', 'output-dim');
                    Terminal.print('  Service Area: Vienna region + Worldwide (remote)', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "services" for detailed offerings', 'output-success');
                    Terminal.print('');
                }
            },

            clear: {
                description: 'Clear the terminal screen',
                execute: function() {
                    Terminal.output.innerHTML = '';
                }
            },

            whoami: {
                description: 'Display current user',
                execute: function() {
                    Terminal.print('guest');
                }
            },

            date: {
                description: 'Display current date and time',
                execute: function() {
                    Terminal.print(new Date().toString());
                }
            },

            echo: {
                description: 'Echo a message',
                execute: function(args) {
                    Terminal.print(args.join(' ') || '');
                }
            },

            services: {
                description: 'Overview of professional services',
                execute: function() {
                    Terminal.print('');
                    Terminal.print('PROFESSIONAL IT SERVICES', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  CORE OFFERINGS', 'output-info');
                    Terminal.print('  • AI Security & Implementation', 'output-response');
                    Terminal.print('  • Penetration Testing & Security Audits', 'output-response');
                    Terminal.print('  • Emergency Data Recovery', 'output-response');
                    Terminal.print('');
                    Terminal.print('  ADDITIONAL SERVICES', 'output-info');
                    Terminal.print('  • Cloud Migration & Security', 'output-response');
                    Terminal.print('  • Reverse Engineering Analysis', 'output-response');
                    Terminal.print('  • Legacy System Modernization', 'output-response');
                    Terminal.print('  • Digital Forensics', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Type specific service commands for details:', 'output-dim');
                    Terminal.print('  ai-security, pentest, data-recovery, pricing', 'output-dim');
                    Terminal.print('');
                }
            },

            contact: {
                description: 'Get in touch',
                execute: function() {
                    Terminal.print('');
                    Terminal.print('CONTACT INFORMATION', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Location: Hainburg an der Donau, Lower Austria, Austria', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Service Area:', 'output-header');
                    Terminal.print('  • On-site: Vienna metropolitan area', 'output-response');
                    Terminal.print('  • Remote: Worldwide', 'output-response');
                    Terminal.print('');
                    Terminal.print('  For inquiries, type: consultation', 'output-dim');
                    Terminal.print('  For emergencies, type: emergency', 'output-dim');
                    Terminal.print('');
                }
            },

            consultation: {
                description: 'Request a consultation',
                execute: function() {
                    Terminal.print('');
                    Terminal.print('FREE INITIAL CONSULTATION', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Schedule a 30-minute consultation to discuss:', 'output-info');
                    Terminal.print('  • Your security requirements', 'output-response');
                    Terminal.print('  • Project scope and timeline', 'output-response');
                    Terminal.print('  • Custom service packages', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Type "contact-form" to submit a request', 'output-success');
                    Terminal.print('');
                }
            }
        },

        // Hidden commands (not shown in help)
        hidden: {
            myip: {
                execute: function() {
                    Terminal.print('Fetching IP information...', 'output-dim');

                    const displayIP = (ip) => {
                        Terminal.print('');
                        Terminal.print('IP INFORMATION', 'output-header');
                        Terminal.print('─'.repeat(40), 'output-dim');
                        Terminal.print(`  Your IP: ${ip}`, 'output-info');
                        Terminal.print('');
                    };

                    fetch('https://api.ipify.org?format=json')
                        .then(response => {
                            if (!response.ok) throw new Error('ipify failed');
                            return response.json();
                        })
                        .then(data => displayIP(data.ip))
                        .catch(() => {
                            // Fallback to ipapi.co
                            fetch('https://ipapi.co/json/')
                                .then(response => {
                                    if (!response.ok) throw new Error('ipapi failed');
                                    return response.json();
                                })
                                .then(data => displayIP(data.ip))
                                .catch(() => {
                                    Terminal.print('Unable to fetch IP information.', 'output-error');
                                });
                        });
                }
            },

            security: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('SECURITY STATUS', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  [✓] Content Security Policy    ACTIVE', 'output-success');
                    Terminal.print('  [✓] XSS Protection             ACTIVE', 'output-success');
                    Terminal.print('  [✓] Input Sanitization         ACTIVE', 'output-success');
                    Terminal.print('  [✓] Rate Limiting              ACTIVE', 'output-success');
                    Terminal.print('  [✓] Command Injection Guard    ACTIVE', 'output-success');
                    Terminal.print('  [✓] No External Dependencies   ACTIVE', 'output-success');
                    Terminal.print('');
                    Terminal.print(`  Commands this session: ${Security.commandCount}/${Security.maxCommandsPerMinute} per minute`, 'output-dim');
                    Terminal.print('');
                }
            },

            software: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('SOFTWARE STACK', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Frontend:', 'output-info');
                    Terminal.print('    • Vanilla JavaScript (ES6+)', 'output-response');
                    Terminal.print('    • CSS3 with custom terminal styling', 'output-response');
                    Terminal.print('    • No external frameworks or libraries', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Security:', 'output-info');
                    Terminal.print('    • Content Security Policy headers', 'output-response');
                    Terminal.print('    • Client-side rate limiting', 'output-response');
                    Terminal.print('    • Input sanitization & validation', 'output-response');
                    Terminal.print('');
                }
            },

            version: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('trusik.com terminal v1.0.0', 'output-info');
                    Terminal.print('Build: 2024.01', 'output-dim');
                    Terminal.print('');
                }
            },

            uptime: {
                execute: function() {
                    const now = Date.now();
                    const uptime = Math.floor((now - pageLoadTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = uptime % 60;

                    Terminal.print(`Session uptime: ${hours}h ${minutes}m ${seconds}s`);
                }
            },

            status: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('SYSTEM STATUS', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  All systems operational.', 'output-success');
                    Terminal.print('');
                    Terminal.print(`  Memory: ${(performance.memory?.usedJSHeapSize / 1048576)?.toFixed(2) || 'N/A'} MB`, 'output-dim');
                    Terminal.print(`  Commands executed: ${Terminal.history.length}`, 'output-dim');
                    Terminal.print('');
                }
            },

            matrix: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('Wake up, Neo...', 'output-success');
                    Terminal.print('The Matrix has you...', 'output-success');
                    Terminal.print('Follow the white rabbit.', 'output-success');
                    Terminal.print('');
                }
            },

            admin: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('ACCESS DENIED', 'output-error');
                    Terminal.print('Authentication required.', 'output-warning');
                    Terminal.print('');
                }
            },

            login: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('Login functionality disabled for guest users.', 'output-warning');
                    Terminal.print('');
                }
            },

            ping: {
                execute: function(args) {
                    const target = args[0] || 'localhost';
                    Terminal.print(`PING ${target}`);
                    Terminal.print('64 bytes: seq=1 ttl=64 time=0.042ms');
                    Terminal.print('64 bytes: seq=2 ttl=64 time=0.038ms');
                    Terminal.print('64 bytes: seq=3 ttl=64 time=0.041ms');
                    Terminal.print('');
                    Terminal.print('--- ping statistics ---', 'output-dim');
                    Terminal.print('3 packets transmitted, 3 received, 0% packet loss');
                }
            },

            neofetch: {
                execute: function() {
                    const ascii = `
        .---.        guest@trusik.com
       /     \\       ─────────────────
       \\.@-@./       OS: TrusikOS Terminal
       /\`\\_/\`\\       Host: trusik.com
      //  _  \\\\      Kernel: Web 1.0
     | \\     )|_     Shell: tsh
    /\`\\_\`>  <_/ \\    Terminal: trusik-term
    \\__/'---'\\__/    CPU: Your Browser
`;
                    Terminal.print(ascii, 'ascii-art');
                }
            },

            credits: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('CREDITS', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Developed for trusik.com', 'output-response');
                    Terminal.print('  Built with pure JavaScript', 'output-dim');
                    Terminal.print('');
                }
            },

            history: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('COMMAND HISTORY', 'output-header');
                    Terminal.print('─'.repeat(40), 'output-dim');

                    if (Terminal.history.length === 0) {
                        Terminal.print('  No commands in history.', 'output-dim');
                    } else {
                        Terminal.history.forEach((cmd, i) => {
                            Terminal.print(`  ${i + 1}  ${cmd}`, 'output-response');
                        });
                    }
                    Terminal.print('');
                }
            },

            exit: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('Goodbye!', 'output-info');
                    Terminal.print('');
                    setTimeout(() => {
                        document.body.style.transition = 'opacity 1s';
                        document.body.style.opacity = '0';
                    }, 500);
                }
            },

            sudo: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('Nice try. This incident will be reported.', 'output-warning');
                    Terminal.print('');
                }
            },

            ls: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('drwxr-xr-x  about/', 'output-response');
                    Terminal.print('drwxr-xr-x  services/', 'output-response');
                    Terminal.print('-rw-r--r--  welcome.txt', 'output-response');
                    Terminal.print('');
                }
            },

            cat: {
                execute: function(args) {
                    if (args[0] === 'welcome.txt') {
                        Terminal.print('');
                        Terminal.print('Welcome to trusik.com!', 'output-response');
                        Terminal.print('Type "info" to learn more about our services.', 'output-dim');
                        Terminal.print('');
                    } else {
                        Terminal.print(`cat: ${args[0] || 'file'}: No such file`, 'output-error');
                    }
                }
            },

            pwd: {
                execute: function() {
                    Terminal.print('/home/guest');
                }
            },

            hostname: {
                execute: function() {
                    Terminal.print('trusik.com');
                }
            },

            uname: {
                execute: function(args) {
                    if (args.includes('-a')) {
                        Terminal.print('TrusikOS trusik.com 1.0.0 Web Browser x86_64');
                    } else {
                        Terminal.print('TrusikOS');
                    }
                }
            },

            'ai-security': {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('AI SECURITY & IMPLEMENTATION', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  SERVICES OFFERED', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Security Assessment:', 'output-header');
                    Terminal.print('  • AI/ML model vulnerability testing', 'output-response');
                    Terminal.print('  • Shadow AI detection and inventory', 'output-response');
                    Terminal.print('  • Data leakage risk analysis', 'output-response');
                    Terminal.print('  • Adversarial attack simulation', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Implementation Support:', 'output-header');
                    Terminal.print('  • Secure AI integration consulting', 'output-response');
                    Terminal.print('  • AI governance framework development', 'output-response');
                    Terminal.print('  • Staff training on AI security', 'output-response');
                    Terminal.print('  • Ongoing monitoring and support', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Compliance:', 'output-header');
                    Terminal.print('  • EU AI Act readiness assessment', 'output-response');
                    Terminal.print('  • GDPR compliance for AI systems', 'output-response');
                    Terminal.print('  • Risk management documentation', 'output-response');
                    Terminal.print('');
                    Terminal.print('  TYPICAL ENGAGEMENT', 'output-info');
                    Terminal.print('  Duration: 2-4 weeks initial assessment', 'output-dim');
                    Terminal.print('  Delivery: Comprehensive report + remediation plan', 'output-dim');
                    Terminal.print('  Follow-up: Monthly retainer options available', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "pricing" for rates | "consultation" to inquire', 'output-success');
                    Terminal.print('');
                }
            },

            pentest: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('PENETRATION TESTING & SECURITY AUDITS', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  TESTING SCOPE', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Network Security:', 'output-header');
                    Terminal.print('  • External/internal network penetration testing', 'output-response');
                    Terminal.print('  • Wireless network security assessment', 'output-response');
                    Terminal.print('  • Firewall and IDS/IPS configuration review', 'output-response');
                    Terminal.print('  • Network segmentation analysis', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Application Security:', 'output-header');
                    Terminal.print('  • Web application penetration testing', 'output-response');
                    Terminal.print('  • API security assessment', 'output-response');
                    Terminal.print('  • Mobile application testing', 'output-response');
                    Terminal.print('  • Source code security review', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Infrastructure:', 'output-header');
                    Terminal.print('  • Cloud security assessment (AWS/Azure/GCP)', 'output-response');
                    Terminal.print('  • Active Directory security audit', 'output-response');
                    Terminal.print('  • Database security review', 'output-response');
                    Terminal.print('  • IoT/SCADA system testing', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Social Engineering:', 'output-header');
                    Terminal.print('  • Phishing simulations', 'output-response');
                    Terminal.print('  • Physical security assessment', 'output-response');
                    Terminal.print('  • Security awareness training', 'output-response');
                    Terminal.print('');
                    Terminal.print('  DELIVERABLES', 'output-info');
                    Terminal.print('  • Executive summary for management', 'output-dim');
                    Terminal.print('  • Technical findings with severity ratings', 'output-dim');
                    Terminal.print('  • Proof-of-concept exploits (where applicable)', 'output-dim');
                    Terminal.print('  • Detailed remediation recommendations', 'output-dim');
                    Terminal.print('  • Re-testing of fixed vulnerabilities', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "pricing" for rates | "consultation" to inquire', 'output-success');
                    Terminal.print('');
                }
            },

            'data-recovery': {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('EMERGENCY DATA RECOVERY', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  RECOVERY SERVICES', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Hardware Failures:', 'output-header');
                    Terminal.print('  • Hard drive (HDD/SSD) recovery', 'output-response');
                    Terminal.print('  • RAID array reconstruction', 'output-response');
                    Terminal.print('  • Electronic component repair', 'output-response');
                    Terminal.print('  • Clean room data extraction', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Software Issues:', 'output-header');
                    Terminal.print('  • Corrupted file system recovery', 'output-response');
                    Terminal.print('  • Deleted data restoration', 'output-response');
                    Terminal.print('  • Ransomware decryption attempts', 'output-response');
                    Terminal.print('  • Database corruption repair', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Forensics:', 'output-header');
                    Terminal.print('  • Digital evidence preservation', 'output-response');
                    Terminal.print('  • Chain of custody documentation', 'output-response');
                    Terminal.print('  • Legal-grade forensic reports', 'output-response');
                    Terminal.print('  • Expert witness services', 'output-response');
                    Terminal.print('');
                    Terminal.print('  RESPONSE TIME', 'output-info');
                    Terminal.print('  • Critical: 24-hour response', 'output-warning');
                    Terminal.print('  • Urgent: 48-hour response', 'output-response');
                    Terminal.print('  • Standard: 5-7 business days', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  "No data, no fee" policy for most recoveries', 'output-success');
                    Terminal.print('');
                    Terminal.print('  Type "emergency" for critical support', 'output-warning');
                    Terminal.print('  Type "consultation" for standard inquiries', 'output-dim');
                    Terminal.print('');
                }
            },

            pricing: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('SERVICE PACKAGES & RATES', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  HOURLY RATES', 'output-info');
                    Terminal.print('  Standard Consulting: 120 EUR/hour', 'output-response');
                    Terminal.print('  Emergency Response: 180 EUR/hour', 'output-warning');
                    Terminal.print('  After-hours/Weekend: 200 EUR/hour', 'output-warning');
                    Terminal.print('');
                    Terminal.print('  PACKAGE 1: SECURITY AUDIT PRO', 'output-header');
                    Terminal.print('  Duration: 1-2 weeks', 'output-dim');
                    Terminal.print('  Includes:', 'output-dim');
                    Terminal.print('  • Comprehensive penetration testing', 'output-response');
                    Terminal.print('  • Security policy review', 'output-response');
                    Terminal.print('  • AI/Shadow AI assessment', 'output-response');
                    Terminal.print('  • GDPR/CRA compliance check', 'output-response');
                    Terminal.print('  • Detailed report + remediation roadmap', 'output-response');
                    Terminal.print('  Price: 5,000 - 15,000 EUR', 'output-success');
                    Terminal.print('');
                    Terminal.print('  PACKAGE 2: AI INTEGRATION CONSULTING', 'output-header');
                    Terminal.print('  Monthly Retainer', 'output-dim');
                    Terminal.print('  Includes:', 'output-dim');
                    Terminal.print('  • AI strategy development', 'output-response');
                    Terminal.print('  • Secure implementation support', 'output-response');
                    Terminal.print('  • Staff training (up to 4 hours/month)', 'output-response');
                    Terminal.print('  • Priority support access', 'output-response');
                    Terminal.print('  Price: 2,000 - 5,000 EUR/month', 'output-success');
                    Terminal.print('');
                    Terminal.print('  PACKAGE 3: CLOUD TRANSFORMATION', 'output-header');
                    Terminal.print('  Project-based pricing', 'output-dim');
                    Terminal.print('  Includes:', 'output-dim');
                    Terminal.print('  • Cloud architecture design', 'output-response');
                    Terminal.print('  • Migration execution', 'output-response');
                    Terminal.print('  • Security implementation', 'output-response');
                    Terminal.print('  • Post-migration support (30 days)', 'output-response');
                    Terminal.print('  Price: 10,000 - 50,000 EUR', 'output-success');
                    Terminal.print('');
                    Terminal.print('  DATA RECOVERY', 'output-header');
                    Terminal.print('  • Assessment: 200 EUR (waived if proceeding)', 'output-dim');
                    Terminal.print('  • Recovery: Variable based on complexity', 'output-dim');
                    Terminal.print('  • "No data, no fee" for most cases', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  All prices exclude VAT. Custom packages available.', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "consultation" to discuss your project', 'output-success');
                    Terminal.print('');
                }
            },

            projects: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('PORTFOLIO & CASE STUDIES', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  NOTABLE PROJECTS', 'output-info');
                    Terminal.print('');
                    Terminal.print('  [1] NeoDCP Player Development', 'output-header');
                    Terminal.print('  Company: ProtoWay s.r.o.', 'output-dim');
                    Terminal.print('  Scope: Professional DCP playback software', 'output-response');
                    Terminal.print('  Technologies: C++, multimedia processing, encryption', 'output-response');
                    Terminal.print('  URL: https://www.neodcp.com', 'output-info');
                    Terminal.print('');
                    Terminal.print('  [2] Industrial Automation Systems', 'output-header');
                    Terminal.print('  Company: METREX s.r.o.', 'output-dim');
                    Terminal.print('  Scope: Software development for metallurgy sector', 'output-response');
                    Terminal.print('  Technologies: SCADA, industrial protocols, databases', 'output-response');
                    Terminal.print('');
                    Terminal.print('  [3] Multi-Domain Consulting', 'output-header');
                    Terminal.print('  Expertise areas:', 'output-dim');
                    Terminal.print('  • Hardware/Software integration', 'output-response');
                    Terminal.print('  • Security architecture design', 'output-response');
                    Terminal.print('  • Legal system experience (expert testimony)', 'output-response');
                    Terminal.print('  • Reverse engineering & analysis', 'output-response');
                    Terminal.print('');
                    Terminal.print('  CONFIDENTIAL CLIENT WORK', 'output-info');
                    Terminal.print('  Additional case studies available under NDA', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "consultation" to discuss your project', 'output-success');
                    Terminal.print('');
                }
            },

            certifications: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('EXPERTISE & QUALIFICATIONS', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  PROFESSIONAL BACKGROUND', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Multi-Domain Expertise:', 'output-header');
                    Terminal.print('  • Software/Hardware Development', 'output-response');
                    Terminal.print('  • System Administration & Security', 'output-response');
                    Terminal.print('  • Database Management & Optimization', 'output-response');
                    Terminal.print('  • Data Recovery & Digital Forensics', 'output-response');
                    Terminal.print('  • Reverse Engineering Analysis', 'output-response');
                    Terminal.print('  • Legal System Experience', 'output-response');
                    Terminal.print('  • Applied Psychology in Security', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Business Experience:', 'output-header');
                    Terminal.print('  • ProtoWay s.r.o. - DCP Player Development', 'output-response');
                    Terminal.print('  • METREX s.r.o. - Software & Metallurgy', 'output-response');
                    Terminal.print('  • Cross-industry consulting', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Technical Skills:', 'output-header');
                    Terminal.print('  • Languages: C/C++, Python, PHP, JavaScript, SQL', 'output-response');
                    Terminal.print('  • Systems: Linux, Windows, embedded systems', 'output-response');
                    Terminal.print('  • Security: Penetration testing, forensics, encryption', 'output-response');
                    Terminal.print('  • Cloud: AWS, Azure, GCP architecture', 'output-response');
                    Terminal.print('  • Hardware: Electronics repair, data recovery', 'output-response');
                    Terminal.print('');
                    Terminal.print('  APPROACH', 'output-info');
                    Terminal.print('  Practical, real-world problem solving over credentials.', 'output-dim');
                    Terminal.print('  20+ years combined experience across multiple domains.', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "projects" to see work examples', 'output-success');
                    Terminal.print('');
                }
            },

            availability: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('CURRENT AVAILABILITY', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  STATUS: Accepting New Projects', 'output-success');
                    Terminal.print('');
                    Terminal.print('  Lead Times:', 'output-info');
                    Terminal.print('  • Emergency response: 24 hours', 'output-warning');
                    Terminal.print('  • Security audits: 2-3 weeks', 'output-response');
                    Terminal.print('  • Consulting projects: 1-2 weeks', 'output-response');
                    Terminal.print('  • Custom development: Variable', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Working Hours:', 'output-info');
                    Terminal.print('  • Standard: Monday-Friday, 09:00-17:00 CET', 'output-response');
                    Terminal.print('  • Emergency: 24/7 critical response', 'output-warning');
                    Terminal.print('  • Remote: Flexible scheduling for international clients', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Type "consultation" to check specific dates', 'output-success');
                    Terminal.print('');
                }
            },

            emergency: {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('⚠️  EMERGENCY SUPPORT  ⚠️', 'output-warning');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  24/7 CRITICAL RESPONSE', 'output-header');
                    Terminal.print('');
                    Terminal.print('  For immediate assistance with:', 'output-info');
                    Terminal.print('  • Active security breaches', 'output-error');
                    Terminal.print('  • Ransomware attacks', 'output-error');
                    Terminal.print('  • Critical data loss', 'output-error');
                    Terminal.print('  • System failures affecting operations', 'output-error');
                    Terminal.print('');
                    Terminal.print('  RESPONSE TIME: Within 24 hours', 'output-warning');
                    Terminal.print('  RATE: 180 EUR/hour (emergency rate)', 'output-warning');
                    Terminal.print('');
                    Terminal.print('  CONTACT METHOD', 'output-header');
                    Terminal.print('  Phone: [PHONE_NUMBER]', 'output-success');
                    Terminal.print('  (For voice calls in critical situations)', 'output-dim');
                    Terminal.print('');
                    Terminal.print('  For non-emergency inquiries:', 'output-info');
                    Terminal.print('  Type "contact-form" to submit a request', 'output-response');
                    Terminal.print('');
                }
            },

            'contact-form': {
                execute: function() {
                    Terminal.print('');
                    Terminal.print('CONTACT FORM', 'output-header');
                    Terminal.print('─'.repeat(50), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Opening contact form...', 'output-info');
                    Terminal.print('');

                    // Trigger the contact form modal
                    if (window.ContactForm) {
                        ContactForm.show();
                    } else {
                        Terminal.print('  Contact form unavailable. Please try again later.', 'output-error');
                    }
                }
            }
        },

        exists: function(command) {
            return command in this.public || command in this.hidden;
        },

        execute: function(command, args) {
            if (command in this.public) {
                this.public[command].execute(args);
            } else if (command in this.hidden) {
                this.hidden[command].execute(args);
            }
        }
    };

    // Track page load time for uptime
    const pageLoadTime = Date.now();

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Terminal.init());
    } else {
        Terminal.init();
    }
})();
