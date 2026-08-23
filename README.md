# DiBooks auth modal portal fix v4

Vervang:
- components/AuthModal.tsx
- components/AppNav.tsx

Fix:
- AuthModal wordt via React portal direct aan document.body gehangen
- Login/register staat altijd midden in viewport
- Niet meer verstopt achter Library/header
- Klik op donkere achtergrond sluit modal
- Dropdown layering blijft behouden
