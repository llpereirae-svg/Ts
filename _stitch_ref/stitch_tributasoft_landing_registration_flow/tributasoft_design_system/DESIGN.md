---
name: TributaSoft Design System
colors:
  surface: '#faf8ff'
  surface-dim: '#dad9e1'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3fa'
  surface-container: '#eeedf4'
  surface-container-high: '#e9e7ef'
  surface-container-highest: '#e3e1e9'
  on-surface: '#1a1b21'
  on-surface-variant: '#444651'
  inverse-surface: '#2f3036'
  inverse-on-surface: '#f1f0f7'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#003120'
  on-tertiary: '#ffffff'
  tertiary-container: '#004a32'
  on-tertiary-container: '#13c38b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#68fcbf'
  tertiary-fixed-dim: '#45dfa4'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#1a1b21'
  surface-variant: '#e3e1e9'
typography:
  headline-xl:
    fontFamily: DM Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: DM Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
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
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for the Ecuadorian fintech landscape, balancing the institutional trust required for tax compliance with the modern efficiency of a high-growth startup. The aesthetic is **Corporate Modern** with a heavy emphasis on **Minimalism**, prioritizing clarity and speed for accountants and business owners.

The target audience ranges from independent professionals to enterprise-level accountants who require a tool that feels reliable and "official," yet avoids the clunky, bureaucratic friction of legacy government software. The UI should evoke a sense of calm under pressure, utilizing expansive whitespace, a disciplined color palette, and high-quality typography to reduce cognitive load during complex financial tasks.

## Colors

This design system utilizes a high-trust palette rooted in deep navy and vibrant functional greens.

- **Primary (#1E3A8A):** Used for navigation, headers, and secondary actions to establish authority and permanence.
- **Success/Action (#10B981):** Reserved for primary call-to-actions (CTAs) and "Create Invoice" workflows to signal progress and positive outcomes.
- **Soft Success (#34D399):** Applied to status indicators, badges, and background tints for completed transactions.
- **Error (#EF4444):** A neutral red used sparingly for validation errors and critical alerts.
- **Backgrounds:** The interface relies on pure white (#FFFFFF) for cards and interactive surfaces, set against a near-white (#FAFAFA) base to create subtle contrast without visual noise.

## Typography

The system uses a pairing of **DM Sans** for headlines and **Inter** for body text and UI elements. DM Sans provides a friendly, geometric character for page titles, while Inter offers maximum legibility for data-heavy tables and invoice details.

Typography follows a strict hierarchy. Large titles use a tighter letter-spacing to appear more modern and grounded. Body text maintains generous line heights to ensure long lists of transactions remain readable during extended use. Data labels use a semi-bold weight to distinguish them from user-generated content.

## Layout & Spacing

The design system employs a **Fixed Grid** philosophy for desktop dashboards to ensure data columns remain predictable and scannable. A 12-column grid is used with 24px gutters.

- **Desktop:** 1280px max-width container, centered with 48px margins.
- **Tablet:** Fluid layout with 32px margins.
- **Mobile:** 16px margins with a focus on vertical stacking. 

The spacing rhythm is based on a 4px baseline, with most component-level spacing occurring in increments of 8px (8, 16, 24, 32). High whitespace is used between major sections to prevent the "tax form" feel and maintain a premium, fintech atmosphere.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Ambient Shadows**. This design system avoids heavy borders in favor of soft shadows that suggest elevation without clutter.

- **Level 0 (Base):** #FAFAFA background.
- **Level 1 (Cards/Surface):** Pure #FFFFFF with a 1px border (#E5E7EB) or a very soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.03)).
- **Level 2 (Dropdowns/Modals):** High-diffusion shadows (0px 12px 32px rgba(0, 0, 0, 0.08)) to indicate temporary interaction layers.

Interactive elements like buttons use a subtle scale-down effect on press (98%) rather than dramatic shadow changes to maintain the minimalist aesthetic.

## Shapes

The shape language is defined by **Generous Roundedness**. This softens the "industrial" nature of accounting software and makes the platform feel approachable and modern.

- **Inputs and Buttons:** Utilize a 12px radius (`rounded-lg` in context).
- **Cards and Containers:** Utilize a 24px radius (`rounded-xl`) to create distinct, pillowy sections for different data groups.
- **Selection Indicators:** Small checkboxes and radio buttons use a 4px radius, maintaining the overall soft theme while remaining functional.

## Components

### Buttons
Primary buttons use the Vibrant Green (#10B981) with white text. Secondary buttons use a ghost style with the Deep Blue (#1E3A8A) for the label and a subtle #F3F4F6 background on hover. Border-radius is fixed at 12px.

### Input Fields
Inputs feature a 12px radius, 16px horizontal padding, and a 1px border (#D1D5DB). When focused, the border shifts to the Deep Blue (#1E3A8A) with a soft blue outer glow.

### Cards
Cards are the primary structural element. They must have a 24px padding and a 24px border-radius. Use cards to group logical sections of an invoice (e.g., Issuer Info, Recipient Info, Line Items).

### Status Chips
Status indicators for invoice states (Sent, Paid, Overdue) use a "tinted" style: a light background color with a dark text color of the same hue.
- **Paid:** Soft Green (#34D399) background with Dark Green text.
- **Pending:** Soft Blue (#DBEAFE) background with Deep Blue text.

### Data Tables
Tables should avoid vertical borders. Use horizontal dividers (1px, #F3F4F6) and generous cell padding (16px vertical). The header row should use a subtle gray background (#F9FAFB) and Semi-bold Inter labels.