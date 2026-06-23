# YourApp Feedback Widget

Embed your feedback board on any website with a single line of code.

## Installation

Add this `<script>` tag to your website (in the `<head>` or `<body>`):

```html
<script src="https://your-domain.com/embed.js"></script>
```

Or, create a container and the widget will insert itself:

```html
<div id="yourapp-widget-root"></div>
<script src="https://your-domain.com/embed.js"></script>
```

## Features

- **Lightweight** — minimal dependencies, ~5KB gzipped
- **Responsive** — works on mobile and desktop
- **No conflicts** — scoped styles won't break your site
- **Anonymous** — users don't need to sign in to view or vote
- **Branded** — footer links back to your feedback page

## Customization

The widget automatically adapts to your site's viewport. You can style the container:

```html
<div id="yourapp-widget-root" style="max-width: 600px; margin: 0 auto;"></div>
<script src="https://your-domain.com/embed.js"></script>
```

## API Integration

In production, the widget uses your Supabase connection:
- **Database**: Reads `ideas` table for all feedback
- **Auth**: Allows anonymous viewing; sign in to vote
- **Realtime**: Updates live as new ideas arrive

## Support

For issues or questions, contact hello@yourapp.com
