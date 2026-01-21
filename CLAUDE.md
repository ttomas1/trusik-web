# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Terminal-style web interface for trusik.com - a browser-based CLI emulator built with vanilla JavaScript, CSS, and PHP backend for logging. Zero external dependencies.

**Tech Stack:** Vanilla JS (ES6+), CSS3, PHP 5.3+

## Development

**No build system.** Files are served directly - just open `index.html` in a browser or deploy to any PHP-enabled web server.

**Local testing:** Use any local PHP server (e.g., `php -S localhost:8000`) or XAMPP/WAMP for full functionality including logging.

## Architecture

The application consists of two JS modules and PHP backend:

### js/terminal.js (IIFE with four internal modules)
1. **Security** - Rate limiting (30 cmd/min), input sanitization (200 char limit), XSS protection via HTML escaping
2. **Logger** - Session-based command logging via PHP endpoints (`/api/session.php`, `/api/log.php`)
3. **Terminal** - Core UI: DOM manipulation, keyboard handling (Enter, Arrow keys, Tab, Ctrl+C/L), command history (50 max)
4. **Commands** - Command registry with `public` (shown in help) and `hidden` (service details, Easter eggs) objects

### js/contact-form.js
- Modal-based contact form triggered by `contact-form` command
- Submits to `/api/contact.php`, saves to `contacts/` directory
- Exposes `window.ContactForm` for terminal integration

**Data flow:**
```
User input → Terminal.handleKeyDown() → Terminal.executeCommand()
    → Security checks → Logger.log() → Commands.execute() → Terminal.print()
```

## Adding Commands

Add to `Commands.public` or `Commands.hidden` in `js/terminal.js`:

```javascript
commandname: {
    description: 'Shown in help',  // only for public commands
    execute: function(args) {
        Terminal.print('output text', 'output-response');
    }
}
```

CSS classes for output: `output-response`, `output-error`, `output-warning`, `output-success`, `output-info`, `output-header`, `output-dim`, `ascii-art`

## API Endpoints

- `/api/session.php` - Creates logging session, returns sessionId
- `/api/log.php` - Logs commands to `logs/session_*.txt`
- `/api/contact.php` - Handles contact form submissions, saves to `contacts/contact_*.txt`

## Security Model

- Content Security Policy in `index.html` restricts scripts/connections
- Client-side rate limiting with 30-second lockout
- Suspicious pattern detection (XSS, path traversal, backticks, etc.)
- PHP endpoints sanitize sessionId to alphanumeric only
- `logs/` and `contacts/` directories protected by `.htaccess`

## Post-Implementation Notes

The `emergency` command contains placeholder `[PHONE_NUMBER]` - update with actual contact number.
Email notifications in `api/contact.php` are commented out - configure when ready.
