"use strict";

/* --------------------------------------------------------------------------
   1. Scroll reveal
   Elements marked with [data-reveal] fade in the first time they enter the
   viewport. The .js class is added by the inline script in <head>, so the
   content stays visible when JavaScript is unavailable.
   -------------------------------------------------------------------------- */
const revealItems = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
} else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
}

/* --------------------------------------------------------------------------
   2. Scroll progress and header state
   The bar is created here so it does not exist when JavaScript is off.
   -------------------------------------------------------------------------- */
const progress = document.createElement("div");
progress.className = "scroll-progress";
progress.setAttribute("aria-hidden", "true");
document.body.append(progress);

const header = document.querySelector(".site-header");
let ticking = false;

function updateScrollUI() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const ratio = max > 0 ? doc.scrollTop / max : 0;

    progress.style.transform = `scaleX(${ratio})`;

    if (header) {
        header.classList.toggle("is-scrolled", doc.scrollTop > 8);
    }

    ticking = false;
}

window.addEventListener(
    "scroll",
    () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateScrollUI);
    },
    { passive: true }
);

updateScrollUI();

/* --------------------------------------------------------------------------
   3. Language switch  (pending)
   4. Twin scene       (pending)
   -------------------------------------------------------------------------- */
