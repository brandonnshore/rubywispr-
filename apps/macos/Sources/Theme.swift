import SwiftUI

/// Single source of truth for visual tokens shared with the web app's
/// globals.css `--rw-*` custom properties. When adjusting a token here, mirror
/// the change in `apps/web/src/app/globals.css` so both surfaces stay in sync.
enum Theme {
    enum Color {
        // Brand
        static let accent = SwiftUI.Color(red: 0xA7 / 255, green: 0x3E / 255, blue: 0x4C / 255)
        static let accentHover = SwiftUI.Color(red: 0x87 / 255, green: 0x30 / 255, blue: 0x3D / 255)
        static let accentSoft = SwiftUI.Color(red: 0xFF / 255, green: 0xF1 / 255, blue: 0xF3 / 255)

        // Recording island palette (Wispr Flow inspired)
        static let islandIdleFill = SwiftUI.Color(red: 0x3A / 255, green: 0x33 / 255, blue: 0x40 / 255).opacity(0.70)
        static let islandActiveFill = SwiftUI.Color(red: 0x01 / 255, green: 0x01 / 255, blue: 0x01 / 255)
        static let islandActiveFillTop = SwiftUI.Color(red: 0x08 / 255, green: 0x08 / 255, blue: 0x08 / 255)
        static let islandStrokeInner = SwiftUI.Color.white.opacity(0.16)
        static let islandShadow = SwiftUI.Color.black.opacity(0.08)

        // Waveform
        static let waveformBar = SwiftUI.Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF0 / 255)
        static let waveformBarAccent = SwiftUI.Color(red: 0xD8 / 255, green: 0x6B / 255, blue: 0x7A / 255)

        // Controls
        static let cancelButtonFill = SwiftUI.Color.white.opacity(0.18)
        static let cancelButtonGlyph = SwiftUI.Color.white.opacity(0.92)
        static let stopButtonFill = SwiftUI.Color.white.opacity(0.18)
        static let stopButtonGlyph = SwiftUI.Color.white
        static let confirmButtonFill = SwiftUI.Color.white
        static let confirmButtonGlyph = SwiftUI.Color(red: 0x0E / 255, green: 0x0E / 255, blue: 0x10 / 255)
        static let errorRim = SwiftUI.Color(red: 0xFF / 255, green: 0x45 / 255, blue: 0x3A / 255)

        // Surface (web mirror — for any Mac-side surfaces we want to keep close to web)
        static let textPrimary = SwiftUI.Color(red: 0x17 / 255, green: 0x20 / 255, blue: 0x33 / 255)
        static let textOnDark = SwiftUI.Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF0 / 255)
        static let textSecondary = SwiftUI.Color(red: 0x53 / 255, green: 0x60 / 255, blue: 0x71 / 255)
    }

    enum Radius {
        static let small: CGFloat = 4
        static let medium: CGFloat = 8
        static let pillIdle: CGFloat = 10
        static let pillActive: CGFloat = 20
    }

    enum Space {
        static let s1: CGFloat = 4
        static let s2: CGFloat = 8
        static let s3: CGFloat = 12
        static let s4: CGFloat = 16
        static let s6: CGFloat = 24
        static let s8: CGFloat = 32
    }

    enum Pill {
        /// Idle bulb sitting above the Dock.
        static let idleWidth: CGFloat = 64
        static let idleHeight: CGFloat = 20
        /// Active expanded pill containing controls + waveform.
        static let activeWidth: CGFloat = 94
        static let activeHeight: CGFloat = 24
        /// Distance above the Dock chrome.
        static let dockOffset: CGFloat = 6
    }

    enum Motion {
        /// Fast HUD reveal without bounce; the island should feel native and stay out of the way.
        static let pillExpand = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.16)
        /// Slow confident reveals — matches SuperWhisper's marketing site.
        static let standard = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.4)
        /// Fast feedback for hover / state changes.
        static let fast = Animation.timingCurve(0.2, 0, 0, 1, duration: 0.12)
    }
}
