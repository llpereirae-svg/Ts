---
name: TributaSoft Core
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444651'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#9d4300'
  on-secondary: '#ffffff'
  secondary-container: '#fd761a'
  on-secondary-container: '#5c2400'
  tertiary: '#00312b'
  on-tertiary: '#ffffff'
  tertiary-container: '#004941'
  on-tertiary-container: '#00c1ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb690'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#783200'
  tertiary-fixed: '#62fae3'
  tertiary-fixed-dim: '#3cddc7'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005047'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: DM Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: DM Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: '0'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
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
  container-max: 1280px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is engineered to project unwavering financial reliability while maintaining the agility of a modern fintech platform. The brand personality balances institutional trust with a streamlined, frictionless user experience. 

The aesthetic follows a **Modern Corporate** style—heavily influenced by minimalism and functional clarity. It prioritizes heavy whitespace, high-contrast typography, and a "content-first" interface. By stripping away unnecessary ornamentation, the design system focuses the user's attention on data accuracy and transactional clarity, evoking an emotional response of confidence, precision, and ease.

## Colors

The palette is anchored by **Deep Navy Blue**, used for primary branding, headers, and navigational elements to establish a foundation of stability. The **Vibrant Orange** is reserved strictly for primary calls-to-action and critical interactive states, ensuring high discoverability of key tasks. 

**Teal** serves as a functional accent for data visualization, icons, and progress indicators. Backgrounds utilize a clean **Off-White** to reduce eye strain and provide a soft canvas for high-elevation components. Success states use a subtle mint tint for a modern, non-aggressive positive reinforcement, while error states remain clear and neutral to maintain professionalism during friction points.

## Typography

This design system employs a dual-font strategy to optimize for both character and legibility. **DM Sans** is utilized for headlines and display text, providing a geometric, modern geometric touch that feels contemporary and "fintech." **Inter** is the workhorse for all body copy, inputs, and labels, selected for its exceptional readability at small sizes and its systematic, neutral tone.

Generous tracking is applied to labels to improve scanability in data-heavy environments. On mobile devices, headline sizes scale down significantly to ensure primary content remains "above the fold" without sacrificing the bold weight that defines the brand's authoritative voice.

## Layout & Spacing

The layout is built on a **12-column fluid grid** for desktop, transitioning to a 4-column grid for mobile. We utilize a strict 8px spacing scale to maintain mathematical harmony across the UI. 

Layouts should favor high-density information centers (like dashboards) surrounded by generous outer margins. This "island" approach ensures that while the data is comprehensive, the interface never feels cluttered. 
- **Desktop:** 40px outer margins with 24px gutters.
- **Tablet:** 24px outer margins with 16px gutters.
- **Mobile:** 16px outer margins with 12px gutters.
Internal component spacing should follow the `stack` variables to create a clear vertical rhythm.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. We avoid heavy black shadows in favor of extra-diffused, low-opacity shadows tinted with the primary navy color (`rgba(30, 58, 138, 0.08)`).

- **Level 0 (Base):** Off-white background.
- **Level 1 (Cards/Surface):** Pure white background with a 1px subtle border (#E2E8F0) and no shadow.
- **Level 2 (Interactive/Hover):** Pure white with a medium ambient shadow, used for active cards or dropdowns.
- **Level 3 (Modals):** High-diffusion shadow to create a clear "float" effect above the dimmed base layer.

This approach creates a soft, tactile feel that mimics physical paper layered on a desk, reinforcing the "approachable" aspect of the brand.

## Shapes

The shape language is defined by "generous softness." A standard **0.5rem (8px)** radius is the baseline for smaller elements like tags and checkboxes. However, in alignment with the brand's approachable nature, primary components such as buttons and input fields utilize **12px - 16px**, while main content containers and dashboard cards utilize a larger **24px** radius.

This high degree of roundedness serves to differentiate the product from traditional, "stiff" banking software, signaling a modern and user-friendly experience.

## Components

### Buttons & Inputs
- **Primary Button:** Vibrant Orange background, white text, 12px border-radius. High-contrast, bold weight.
- **Secondary Button:** Deep Navy outline or transparent background with Navy text.
- **Input Fields:** 16px border-radius with a 1px soft-grey border. On focus, the border transitions to Deep Navy with a 2px outer glow in light teal.

### Cards
- **Main Cards:** 24px border-radius, white background, subtle 1px border. Used for account overviews and primary data blocks.
- **Action Cards:** Slightly smaller radius (16px), used for secondary features or "quick links."

### Feedback & Navigation
- **Chips/Badges:** Pill-shaped (fully rounded) with low-saturation background tints and high-saturation text for status indicators (e.g., "Paid," "Pending").
- **Lists:** Clean, borderless rows with 16px vertical padding, separated by subtle 1px dividers to maintain a lightweight feel.
- **Data Tables:** High-density text (Inter, label-sm) with sticky headers and subtle row-hover highlights in #FAFAFA.