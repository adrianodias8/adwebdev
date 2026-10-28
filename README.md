# adwebdev

My site: [adrianodias8.github.io/adwebdev](https://adrianodias8.github.io/adwebdev/)

It is a small operating system. It boots, then opens on a desktop with the
logo as its wallpaper, a Projects, a Posts and a Tools folder, and a dock of apps:
windows open, drag, stack, minimise to the dock, zoom and close; posts open
as web pages in a built-in browser; the terminal works; and Tinker and Drush
run real (if small) PHP in the browser. Without
JavaScript it is one ordinary readable page, and reduced motion skips the
boot.

Built with [Statico](https://github.com/adrianodias8/statico), the static site
generator I wrote. No Node, no build tools: plain HTML, CSS and one script.

## Running it

```bash
statico dev       # http://localhost:3000, reloads on save
statico check     # links, alt text, front matter
statico build https://adrianodias8.github.io/adwebdev
```

Pushing to `main` checks, builds and deploys it. See
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Where things are

| What | Where |
|---|---|
| Name, email, booking link | `statico.json` |
| Services | `collections/services.json` |
| Career | `collections/experience.json` |
| Projects (what opens in the browser, what opens an info window) | `collections/projects.json` |
| The dock's apps | `collections/dock.json` |
| Icons | `includes/icons.html` |
| The Tools folder and its apps (ports of tools.adwebdev.xyz) | `collections/tools.json`, `includes/tools.html`, `assets/js/tools.js` |
| HTTP status codes | `collections/http_status.json` |
| Tinker and Drush: a small PHP interpreter, with pretend Laravel and Drupal on top | `assets/js/php.js`, `php-laravel.js`, `php-drupal.js` |
| Posts | `content/writing/*.md` |
| The boot log and window contents | `pages/index.html` |
| Bio | `pages/about.html` |
| The terminal's commands, the browser, the dock | `assets/js/os.js` |
| Colours and type | the tokens at the top of `assets/css/main.css` |
| Logo | `includes/logo.html`, `includes/logo-mark.html` |
| Analytics (Umami) | `includes/analytics.html`, `assets/js/analytics.js`, and `track(…)` calls in `assets/js/os.js` |

## Analytics

Umami, cookieless, at umami.adwebdev.xyz. The tracker only counts on the live
hosts listed in `includes/analytics.html` (`data-domains`), so local builds send
nothing. To leave your own visits out, run `localStorage.setItem("umami.disabled", 1)`
in the browser's console on the live site.

Windows opening don't count as page views (`data-exclude-hash`); they are events.
No event carries anything a visitor types.

| Event | Properties | When |
|---|---|---|
| `open-app` | `app` (window id), `via` (dock, menubar, desktop, a window id, terminal, url) | A window opens |
| `close-app` | `app`, `seconds` | A window closes |
| `open-project` | `project` | A project opens from the Projects folder |
| `open-post` | `post` | A post opens from the Posts folder |
| `browser-page` | `page` (a path, or another site's host) | A page loads in the desktop's browser |
| `book-call` | `from` | Any booking link, or the terminal's `book` |
| `email-click` | `from` | An email link |
| `send-mail` | | The Mail window's Send |
| `outbound` | `host`, `from` | A link to another site |
| `use-tool` | `tool` | The first use of a tool in a visit |
| `tool-action` | `tool`, `action` (the button's label) | A button in a tool |
| `console-command` | `console` (tinker, drush, drush-php), `command`, `result` | A line run in Tinker or Drush |
| `terminal-command` | `command`, `target` (for `open`) | A command in the terminal |
| `toggle` | `setting` (crt, sound), `on` | The menu bar switches |
| `boot` | `action` (entered, skipped) | Leaving the boot screen |
| `screensaver`, `screensaver-corner` | `how` (idle, command) | The screensaver starts; the logo hits a corner |
| `not-found` | `path` | The 404 page |

Fonts: VT323 and Schibsted Grotesk, both under the SIL Open Font License
(see `assets/fonts/`).
