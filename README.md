# DiBooks editor dropdown portal fix v5

Vervang:
- components/AppNav.tsx

Fix:
- Dropdown menus worden nu via een portal direct op `document.body` gerenderd.
- Daardoor liggen ze boven React Flow / de editor grid.
- Opties in het menu zijn weer klikbaar in de editor.
