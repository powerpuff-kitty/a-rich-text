// Measure the body rather than document.scrollHeight, which cannot shrink below
// the iframe viewport. Observe content changes and wrapping after width changes.
for (const frame of document.querySelectorAll('iframe')) {
  let cleanup = () => {};
  const connect = () => {
    cleanup();
    const doc = frame.contentDocument;
    if (!doc?.body || doc.URL === 'about:blank') return;
    const style = doc.createElement('style');
    style.textContent = 'html { overflow-y:hidden; } body { display:flow-root; margin:0 auto!important; padding:16px 12px!important; } body > header, main > h1 { display:none!important; }';
    doc.head.append(style);
    let pending;
    const measure = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        // Focus mode moves content into a fixed dialog. Keep the existing frame
        // viewport while a dialog is open so it does not collapse underneath it.
        const roots = [doc, ...Array.from(doc.querySelectorAll('*')).map(node => node.shadowRoot).filter(Boolean)];
        if (roots.some(root => root.querySelector('dialog[open]'))) return;
        const height = Math.ceil(doc.body.getBoundingClientRect().height) + 2;
        if (frame.style.height !== `${height}px`) frame.style.height = `${height}px`;
      });
    };
    const observer = new doc.defaultView.ResizeObserver(measure);
    observer.observe(doc.body);
    measure();
    cleanup = () => { observer.disconnect(); clearTimeout(pending); style.remove(); };
  };
  frame.addEventListener('load', connect);
  if (frame.contentDocument?.readyState === 'complete') connect();
}

const navigation = document.querySelector('nav[aria-label="Component examples"]');
const sections = Array.from(document.querySelectorAll('.gallery > div > section[id]'));
const links = Array.from(navigation.querySelectorAll('a[href^="#"]'));
let navigationFrame;
const updateNavigation = () => {
  cancelAnimationFrame(navigationFrame);
  navigationFrame = requestAnimationFrame(() => {
    const active = sections.find(section => {
      const box = section.getBoundingClientRect();
      return box.top <= 80 && box.bottom > 80;
    }) ?? sections.find(section => section.getBoundingClientRect().top > 80) ?? sections.at(-1);
    for (const link of links) {
      if (link.hash === `#${active?.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  });
};
window.addEventListener('scroll', updateNavigation, { passive: true });
window.addEventListener('resize', updateNavigation);
window.addEventListener('hashchange', updateNavigation);
// A lazy frame changing height can move section boundaries without scrolling.
const sectionObserver = new ResizeObserver(updateNavigation);
for (const section of sections) sectionObserver.observe(section);
updateNavigation();
