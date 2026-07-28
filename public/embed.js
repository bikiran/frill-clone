(function() {
  // Create widget container
  const container = document.createElement('div');
  container.id = 'yourapp-widget-root';
  container.style.cssText = `
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    --coral: #ff7a6b;
    --coral-hover: #f56354;
    --peach: #fff4f1;
    --ink: #1a1a1a;
    --slate: #6b6b70;
    --border: #f0f0f0;
    --canvas: #fafafa;
  `;

  // Find insertion point
  const script = document.currentScript;
  const target = script?.previousElementSibling || document.body;
  target.parentNode.insertBefore(container, script || undefined);

  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'yourapp-widget-iframe';
  const widgetUrl = new URL('/widget', script?.src ? new URL(script.src).origin : window.location.origin);
  iframe.src = widgetUrl.toString();
  iframe.style.cssText = `
    width: 100%;
    height: 600px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: white;
    font-family: inherit;
  `;
  iframe.allow = 'same-origin';

  container.appendChild(iframe);

  // Listen for resize messages
  window.addEventListener('message', (e) => {
    if (e.origin !== new URL(widgetUrl).origin) return;
    if (e.data.type === 'yourapp-widget-resize') {
      iframe.style.height = e.data.height + 'px';
    }
  });

  console.log('YourApp feedback widget loaded');
})();
