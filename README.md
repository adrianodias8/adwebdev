# adwebdev

My site: [adrianodias8.github.io/adwebdev](https://adrianodias8.github.io/adwebdev/)

It is a small operating system. It boots, then opens on a desktop of volumes
you can open, drag, stack and close, with a terminal that works. Without
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
| Projects | `collections/projects.json` |
| The desktop's volumes | `collections/volumes.json` |
| Posts | `content/writing/*.md` |
| The boot log and window contents | `pages/index.html` |
| Bio | `pages/about.html` |
| The terminal's commands | `assets/js/os.js` |
| Colours and type | the tokens at the top of `assets/css/main.css` |
| Logo | `includes/logo.html`, `includes/logo-mark.html` |

Fonts: VT323 and Schibsted Grotesk, both under the SIL Open Font License
(see `assets/fonts/`).
