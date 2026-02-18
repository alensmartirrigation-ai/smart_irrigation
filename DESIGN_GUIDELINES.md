# IrrigationSoftPro Design Guidelines

These guidelines define the design system for the **IrrigationSoftPro** theme (Light Mode, Minimal Soft Gradient).

---

## 1. Colors

### Primary
| Token | Value | Preview |
|---|---|---|
| Base | `#5B6CFF` | ![#5B6CFF](https://via.placeholder.com/15/5B6CFF/000000?text=+) |
| Gradient Start | `#6C63FF` | ![#6C63FF](https://via.placeholder.com/15/6C63FF/000000?text=+) |
| Gradient End | `#4D9BFF` | ![#4D9BFF](https://via.placeholder.com/15/4D9BFF/000000?text=+) |
| Dark | `#4A55E2` | ![#4A55E2](https://via.placeholder.com/15/4A55E2/000000?text=+) |
| Light | `#E9ECFF` | ![#E9ECFF](https://via.placeholder.com/15/E9ECFF/000000?text=+) |

### Background
| Token | Value | Preview |
|---|---|---|
| Main | `#F4F6FA` | ![#F4F6FA](https://via.placeholder.com/15/F4F6FA/000000?text=+) |
| Card | `#FFFFFF` | ![#FFFFFF](https://via.placeholder.com/15/FFFFFF/000000?text=+) |
| Muted | `#F0F2F7` | ![#F0F2F7](https://via.placeholder.com/15/F0F2F7/000000?text=+) |

### Text
| Token | Value | Preview |
|---|---|---|
| Primary | `#1F2937` | ![#1F2937](https://via.placeholder.com/15/1F2937/000000?text=+) |
| Secondary | `#6B7280` | ![#6B7280](https://via.placeholder.com/15/6B7280/000000?text=+) |
| Muted | `#9CA3AF` | ![#9CA3AF](https://via.placeholder.com/15/9CA3AF/000000?text=+) |
| Inverse | `#FFFFFF` | ![#FFFFFF](https://via.placeholder.com/15/FFFFFF/000000?text=+) |

### Status
| Token | Value | Preview |
|---|---|---|
| Success | `#34D399` | ![#34D399](https://via.placeholder.com/15/34D399/000000?text=+) |
| Warning | `#FBBF24` | ![#FBBF24](https://via.placeholder.com/15/FBBF24/000000?text=+) |
| Danger | `#F87171` | ![#F87171](https://via.placeholder.com/15/F87171/000000?text=+) |
| Info | `#60A5FA` | ![#60A5FA](https://via.placeholder.com/15/60A5FA/000000?text=+) |

### Chart
| Token | Value | Preview |
|---|---|---|
| Primary | `#6C63FF` | ![#6C63FF](https://via.placeholder.com/15/6C63FF/000000?text=+) |
| Secondary | `#8B5CF6` | ![#8B5CF6](https://via.placeholder.com/15/8B5CF6/000000?text=+) |
| Accent | `#4D9BFF` | ![#4D9BFF](https://via.placeholder.com/15/4D9BFF/000000?text=+) |
| Background Track | `#E5E7EB` | ![#E5E7EB](https://via.placeholder.com/15/E5E7EB/000000?text=+) |

---

## 2. Typography

### Font Family
- **Primary**: `Inter`
- **Numeric**: `Roboto Mono`

### Sizes (px)
| xs | sm | md | lg | xl | xxl | display |
|---|---|---|---|---|---|---|
| 12 | 14 | 16 | 18 | 22 | 28 | 36 |

### Weights
| Regular | Medium | Semibold | Bold |
|---|---|---|---|
| 400 | 500 | 600 | 700 |

### Letter Spacing
- **Tight**: -0.5px
- **Normal**: 0px
- **Wide**: 0.5px

---

## 3. Spacing (px)

| xs | sm | md | lg | xl | xxl |
|---|---|---|---|---|---|
| 4 | 8 | 12 | 16 | 24 | 32 |

---

## 4. Radius (px)

| sm | md | lg | xl | pill |
|---|---|---|---|---|
| 8 | 14 | 20 | 28 | 999 |

---

## 5. Shadows

### Card
- **Color**: `rgba(0,0,0,0.06)`
- **Offset**: 0px 6px
- **Blur**: 20px
- **Spread**: 0px

### Soft
- **Color**: `rgba(108,99,255,0.15)`
- **Offset**: 0px 8px
- **Blur**: 24px
- **Spread**: 0px

---

## 6. Components

### Card
- **Background**: `#FFFFFF`
- **Radius**: 20px
- **Padding**: 16px
- **Shadow**: Card

### Gradient Card
- **Background**: Linear Gradient (135deg, `#6C63FF` to `#4D9BFF`)
- **Text Color**: `#FFFFFF`
- **Radius**: 20px
- **Padding**: 20px

### Button
#### Primary
- **Background**: `#5B6CFF`
- **Text Color**: `#FFFFFF`
- **Radius**: 28px
- **Height**: 56px

#### Icon Only
- **Background**: `#FFFFFF`
- **Radius**: 50px (Circle)
- **Shadow**: Soft
- **Size**: 64px

### Progress Ring
- **Stroke Width**: 8px
- **Track Color**: `#E5E7EB`
- **Progress Gradient**: `#6C63FF` to `#4D9BFF`
- **Line Cap**: Round

### List Item
- **Height**: 72px
- **Divider Color**: `#E5E7EB`
- **Icon Size**: 40px
- **Horizontal Padding**: 16px

### Bottom Navigation
- **Height**: 72px
- **Background**: `#FFFFFF`
- **Active Color**: `#5B6CFF`
- **Inactive Color**: `#9CA3AF`

---

## 7. Layout Details

- **Grid Columns**: 4
- **Safe Area Padding**: 16px
- **Card Gap**: 16px

---

## 8. Animation

- **Fast**: 150ms
- **Normal**: 250ms
- **Slow**: 400ms
- **Easing**: `easeInOut`

---

## 9. Icon Style

- **Stroke Width**: 1.5px
- **Style**: Outline
- **Corner Radius**: 8px
