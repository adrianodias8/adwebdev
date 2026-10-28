---
title: Not Invented Here (Yet) 🦀
description: I rewrote my static site generator. Then I didn't stop. A field report from somewhere inside the vibe-coding trenches.
date: 2026-10-27
---

![A terminal listing tools being rewritten](/assets/images/posts/not-invented-here.png)

So. Funny thing happened on the way to having a simple blog.

You may remember [my first post](/writing/hello-world/), where I explained that I'd chosen static sites because I'm lazy—sorry, *efficient*—and didn't want to maintain anything. A reasonable position. A position I held for roughly as long as it took for the Tailwind build to break in a way the error message declined to explain.

Reader, I did not debug it. I rewrote the whole generator in Rust.

## 🧱 The Current Inventory

Here's the honest state of my "I just want a simple blog" project:

- **[Statico](https://github.com/adrianodias8/statico)** — a static site generator. Replaces Static by DevDojo. It builds this very page. ✅ Done, actually works, I'm using it right now.
- **berth** — a free, open-source take on OrbStack. Docker and Linux on Apple Silicon, straight onto Virtualization.framework. Because I looked at my container tooling and thought "how hard can it be." 🚧
- **rustyphp** — a PHP engine. In Rust. We'll come back to this one. 💀
- **This website** — I needed a portfolio. A portfolio is one page. Instead it boots like an operating system on an old CRT: windows, a dock, a pretend browser, a terminal, a screensaver, a folder of sixteen little tools, and a fake Tinker and Drush backed by a small PHP interpreter I wrote in JavaScript. (Yes, another PHP engine. Given what happened with the last one, which we'll get to, this was brave.) There's even an AI agent window that pretends to rewrite the site while you read it, which is either satire or a cry for help. ✅ You're inside it right now.

That's the part I'm willing to put in a list with a straight face.

## ⚰️ The Graveyard

Here's the part nobody puts in the list.

For every project above there's a folder of repos where the README is comfortably the most finished artefact in it. Things I started at 11pm with total conviction and abandoned by Thursday, not because they didn't work, but because the interesting problem had already been solved in my head and the remaining 80% was just *typing*.

This is, I think, the actual occupational hazard of vibe coding. Not bad code — bad *follow-through*. When starting something costs an evening instead of a quarter, you start everything. The bottleneck was never the idea. It was the three weeks of grind that used to filter out the ideas that weren't worth it, and that filter is gone now.

So you end up with a graveyard. Every vibe coder has one. Mine has a view.

I've made peace with it, mostly. Some of those repos were genuinely just me learning something with extra steps, and there are worse ways to spend a Tuesday. But I do notice that the three projects I listed above are the three I actually *use*, and I don't think that's coincidence. Dogfooding is the only honest filter I've found: if you don't reach for it on a normal day, it's already in the graveyard, it just hasn't been told yet.

## 💀 rustyphp, or: Signs and Portents

Which brings me to rustyphp.

I write Drupal and Laravel for a living. PHP has paid for every meal I have eaten in a decade. So naturally I decided to implement its engine. In Rust. Voluntarily, in my own time, for fun.

Shortly after I started, my MacBook's screen did this:

![A MacBook screen with two vertical black bands of dead pixels running down it](/assets/images/posts/cursed-screen.jpg)

Two vertical black bars. Straight down the display. Permanently.

Now. I want to be clear that I am a professional and I understand that display failures have physical causes — a flex cable, a panel defect, thermal cycling, the ordinary cruelty of hardware. There is no mechanism by which writing a PHP parser damages a laptop screen.

I understand this.

I am simply observing that I have written PHP for ten years without incident, and that within weeks of attempting to *reimplement* it, my machine developed a permanent visual impairment in the exact region where I had been reading the parser code.

I'm not saying it's related. I'm saying I haven't opened that repo since, and my screen hasn't gotten any worse. Draw your own conclusions. Some things aren't meant to be rewritten, and PHP's engine may well be load-bearing for reality in ways the spec doesn't document.

rustyphp stays where it is. Respectfully. 🙏

## 🎤 In My Defence, DHH Started It

Here's where I'd like to shift some blame.

At Rails World 2026, DHH gave a keynote about how 37signals is building software now — there's a good [write-up over at Rustify](https://rustify.rs/articles/rails-world-2026-keynote-dhh-hey-rust-ai-agents). The short version, as I understood it through the haze of my own enthusiasm:

They've gone **"pencils down"** — meaning the normal workflow is no longer a human typing the implementation. A human decides what should exist, an agent writes it, the human reviews what came back.

He reckons Rust is unpleasant to read and write by hand, but that this matters a great deal less when a human isn't the one doing the typing. Meanwhile it's fast, which you get to keep forever.

They rewrote the HEY mail server core in Rust and reported something like 99% less CPU and 95% less memory. He was upfront that these are their own numbers from their own workload, so season to taste — but even if you halve it twice, that's still an absurd result.

And the number that really got me: around 150,000 lines of code in a single month, against a historical average of roughly 30,000 lines of production Ruby *per year*. The Rustify write-up is careful to point out that counting lines is a famously terrible way to measure productivity, which is true, and which I ignored instantly because it was telling me what I wanted to hear.

So. A man with considerably more credibility than me says the constraint has moved. Rewriting your tools is no longer obviously insane.

I took this as a personal licence. I don't think it was issued as one.

## 🫠 The Part Where I Admit I Might Be Losing It

Let me be honest about the other side of this, because the post would be a lie otherwise.

There's a specific feeling when an agent hands you 2,000 lines of working Rust in a language whose borrow checker you've argued with maybe twice. It passes. The tests are green. The benchmarks are genuinely good.

And a small voice asks: *do you understand this?*

Sometimes yes. Sometimes I understand it the way you understand a city you've only seen from a train. I know the shape. I could not give directions.

I keep catching myself in a loop that goes:

1. Notice minor annoyance in existing tool.
2. Think "I could rewrite this."
3. **Actually rewrite it**, because now that's a Tuesday evening rather than a six-month project.
4. Now maintain it. Forever. Alone.

Step four is doing a tremendous amount of silent work there. Statico is lovely right now because I wrote it last week. Ask me about maintaining it in two years when someone files a genuinely good bug report about a Tailwind v5 edge case I've never heard of.

The honest summary: I cannot currently tell whether I'm being unusually productive or unusually unhinged. The outputs look identical from inside.

## 🏄 Until Then: Vibe Code Everything

So here's where I've landed, and I accept it is not a rigorous position:

I'm going to keep going. Full send. Vibe code everything.

Partly because it's the most fun I've had programming in years, and I think that counts for more than people admit. Partly because the tools I've ended up with are genuinely better *for me* — Statico does exactly what I want, has no Node in it, and builds this site in under a second, because it was built by someone with a sample size of one user and strong opinions about that user.

And partly because if the constraint really has moved, the people who find out first will be the ones who went and poked it.

I'll reassess when something catches fire. Something already did catch fire, technically, but it was only the screen. 🦀

## 🔮 Next: Local Models, and a Very Expensive Laptop

Which brings me to the next thing I'm going to be insufferable about.

I've been dabbling with running models locally, and so far it's been equal parts "oh, that's genuinely useful" and "why is this eating my entire machine." Both of these problems may be solved by throwing money at them, which is my favourite kind of problem.

A MacBook Pro M5 Max with 128GB of unified memory arrives later this week. 🎉

That is an amount of RAM that would have run a small hosting company, and I intend to spend it asking local models to write Rust I will then nod at knowingly. It also, and I cannot stress this enough, has a **screen that works**.

I'm planning to write up what I actually find, honestly — which models are genuinely usable at that memory, what the speeds really look like rather than what the benchmarks claim, and whether local models are good enough yet to do the sort of work I've been handing to the cloud. Including the bits that don't work, because those posts are more useful and nobody writes them.

Assuming the laptop arrives, and assuming I haven't started rewriting macOS by then.

Stay tuned for more rambling!
