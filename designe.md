---
name: DocuMind Enterprise
colors:
  surface: '#f7f9fc'
  surface-dim: '#d8dadd'
  surface-bright: '#f7f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f7'
  surface-container: '#eceef1'
  surface-container-high: '#e6e8eb'
  surface-container-highest: '#e0e3e6'
  on-surface: '#191c1e'
  on-surface-variant: '#43474c'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f4'
  outline: '#73777d'
  outline-variant: '#c3c7cd'
  surface-tint: '#486176'
  primary: '#001524'
  on-primary: '#ffffff'
  primary-container: '#0f2a3d'
  on-primary-container: '#7992a9'
  inverse-primary: '#b0c9e2'
  secondary: '#3f627b'
  on-secondary: '#ffffff'
  secondary-container: '#bde1fe'
  on-secondary-container: '#41657d'
  tertiary: '#001617'
  on-tertiary: '#ffffff'
  tertiary-container: '#002d2e'
  on-tertiary-container: '#0a9fa1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce6ff'
  primary-fixed-dim: '#b0c9e2'
  on-primary-fixed: '#011e30'
  on-primary-fixed-variant: '#30495e'
  secondary-fixed: '#c8e6ff'
  secondary-fixed-dim: '#a7cbe7'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#264a62'
  tertiary-fixed: '#81f4f6'
  tertiary-fixed-dim: '#63d8da'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#004f51'
  background: '#f7f9fc'
  on-background: '#191c1e'
  surface-variant: '#e0e3e6'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  container-padding-mobile: 16px
  container-padding-desktop: 32px
  gutter: 24px
---

## Brand & Style

The design system is engineered for a high-trust, high-intelligence environment. It targets enterprise administrators and knowledge workers who require a secure, focused, and efficient workspace. The brand personality is "The Reliable Intellectual"—authoritative yet accessible, sophisticated yet functional.

The visual style follows a **Corporate / Modern** aesthetic with subtle **Glassmorphism** cues for secondary navigation. The interface prioritizes clarity and information density without sacrificing breathing room. By utilizing a refined cool-toned palette and generous whitespace, the system evokes a sense of calm under the pressure of data-heavy workflows. Every interaction must feel intentional, secure, and technologically advanced, bridging the gap between raw AI power and human-centric utility.

## Colors

The palette is anchored by "Deep Navy" and "Oxford Blue," establishing immediate institutional trust. 

- **Primary & Secondary:** Used for top-level navigation, primary buttons, and structural headers to ground the interface in authority.
- **Accent Teal:** Reserved for "Intelligence" markers—AI response icons, primary call-to-actions, and active states. It represents the "spark" of the AI assistant.
- **Light Teal:** Used for "Success" backgrounds and AI-generated content containers to distinguish them from standard system messages.
- **Background & Neutrals:** The UI uses a soft off-white (#F6F8FB) to reduce eye strain during long sessions, with high-contrast text for WCAG 2.1 compliance.

## Typography

This design system utilizes **Inter** exclusively to leverage its exceptional legibility in data-heavy SaaS environments. 

- **Hierarchy:** Use `display-lg` for dashboard welcomes and `headline-lg` for page titles. `title-lg` is optimized for card headers and modal titles.
- **Body Text:** Standardize on `body-md` for most content. `body-sm` is strictly for sidebars, metadata, and secondary descriptions.
- **Labels:** `label-sm` uses uppercase styling for metadata tags and table headers to provide clear visual distinction from interactive content.
- **Responsiveness:** On mobile devices, headline sizes scale down significantly to ensure text remains within the viewport without excessive wrapping.

## Layout & Spacing

The system is built on a **8px linear scale**, ensuring consistent vertical rhythm across all components.

- **Grid:** A 12-column fluid grid is used for the main content area, while the primary sidebar remains fixed at 280px. 
- **Dashboards:** Use `md` (16px) spacing for internal card padding and `lg` (24px) for the gap between dashboard widgets.
- **Responsive Behavior:** 
  - **Desktop (1440px+):** Full 12-column grid, sidebar expanded.
  - **Tablet (768px - 1024px):** 8-column grid, sidebar collapses to icon-only rail or hidden drawer.
  - **Mobile (<768px):** 4-column grid, container padding reduced to 16px, all cards stack vertically.

## Elevation & Depth

To maintain a professional enterprise feel, the design system avoids heavy, "muddy" shadows in favor of **Tonal Layers** and **Ambient Shadows**.

- **Level 0 (Base):** Background color (#F6F8FB). All page-level content lives here.
- **Level 1 (Cards):** White surfaces (#FFFFFF) with a very soft, diffused shadow: `0px 4px 12px rgba(15, 42, 61, 0.04)`.
- **Level 2 (Dropdowns/Popovers):** White surfaces with a more defined shadow to separate from cards: `0px 8px 24px rgba(15, 42, 61, 0.08)`.
- **Level 3 (Modals/Drawers):** Highest elevation. Uses a semi-transparent backdrop blur (12px) behind the modal to maintain context while focusing the user.

Sidebars use a subtle 1px border (`#E5E7EB`) on the right side rather than a shadow to maintain a flat, architectural feel.

## Shapes

The design system utilizes **Rounded** geometry to balance professional rigor with modern accessibility.

- **Base Radius:** 8px for standard components like buttons and input fields.
- **Card Radius:** 12px for standard dashboard cards and containers.
- **Large Component Radius:** 16px for main content areas and large modal containers.
- **AI Chat Bubbles:** The AI's bubbles use the `rounded-lg` (16px) setting with a bottom-left sharp corner to indicate "origin," while user bubbles are fully rounded and right-aligned.

## Components

### Buttons & Controls
- **Primary:** Navy background, white text. No gradients. High-contrast and solid.
- **Secondary:** Accent Teal background with white text—used for AI-specific actions like "Ask DocuMind."
- **Ghost:** Transparent background with Navy text, used for secondary header actions.

### Chat Interface
- **User Message:** Dark Grey background (#F3F4F6) with Dark Text (#1F2937).
- **AI Message:** Light Teal background (#E8F7F7) with Primary Navy text (#0F2A3D). Must include an "AI Source" citation chip at the bottom.
- **Input:** A floating persistent bar with a "Drag and Drop" icon for immediate file context attachment.

### Tables & Data
- **Header:** `label-sm` typography with a light grey background tint.
- **Rows:** 1px subtle bottom border. Hover state uses Background (#F6F8FB).
- **Status Badges:** Use "Pill" shapes (rounded-xl) with low-saturation backgrounds (e.g., Light Teal for "Processed").

### Sidebar & Navigation
- **Active State:** A vertical Teal bar (4px wide) on the left edge of the menu item, with a light opacity Navy tint for the background.
- **Icons:** Use 20px stroke-based icons for high clarity at small sizes.

### Drawers (Metadata)
- Sliding in from the right, drawers should use Level 3 elevation. They are the primary tool for viewing document metadata, OCR status, and permission logs without leaving the central search or chat view.
