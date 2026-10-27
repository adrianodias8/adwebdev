# adwebdev

My site: [adrianodias8.github.io/adwebdev](https://adrianodias8.github.io/adwebdev/)

It is a small operating system. It boots, then opens on a desktop with the
logo as its wallpaper, a Projects and a Posts folder, and a dock of apps:
windows open, drag, stack, minimise to the dock, zoom and close; posts open
as web pages in a built-in browser; and the terminal works. Without
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
| Posts | `content/writing/*.md` |
| The boot log and window contents | `pages/index.html` |
| Bio | `pages/about.html` |
| The terminal's commands, the browser, the dock | `assets/js/os.js` |
| Colours and type | the tokens at the top of `assets/css/main.css` |
| Logo | `includes/logo.html`, `includes/logo-mark.html` |

Fonts: VT323 and Schibsted Grotesk, both under the SIL Open Font License
(see `assets/fonts/`).
