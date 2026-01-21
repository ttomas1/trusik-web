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
            fetch('/api/session/start', { method: 'POST' })
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

            fetch('/api/log', {
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
            this.print('Welcome to trusik.com terminal interface', 'output-header');
            this.print('Type "help" for available commands or "info" for business information.', 'output-dim');
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
                    Terminal.print('─'.repeat(40), 'output-dim');
                    Terminal.print('');
                    Terminal.print('  Professional IT Solutions & Consulting', 'output-info');
                    Terminal.print('');
                    Terminal.print('  Services:', 'output-header');
                    Terminal.print('  • Software Development', 'output-response');
                    Terminal.print('  • Security Consulting', 'output-response');
                    Terminal.print('  • System Administration', 'output-response');
                    Terminal.print('  • Cloud Infrastructure', 'output-response');
                    Terminal.print('');
                    Terminal.print('  Contact: [Business information to be provided]', 'output-dim');
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
