import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

@main
private struct LiveAudioLevelNormalizerTests {
    static func main() {
        silentInputStaysZero()
        activeInputProducesBoundedVisibleLevel()
        resetDropsDisplayState()
        silenceDecaysWithoutHistory()

        print("LiveAudioLevelNormalizerTests passed")
    }

    private static func silentInputStaysZero() {
        var normalizer = LiveAudioLevelNormalizer()

        let levels = (0..<12).map { _ in normalizer.normalizedLevel(forRMS: 0) }

        expect(levels.allSatisfy { $0 == 0 }, "silent synthetic input should remain visually inactive")
    }

    private static func activeInputProducesBoundedVisibleLevel() {
        var normalizer = LiveAudioLevelNormalizer()

        let levels = [0, 0.000001, 0.0001, 0.01, 0.05, 0.2, 1.0, 2.0]
            .map { normalizer.normalizedLevel(forRMS: Float($0)) }

        expect(levels.allSatisfy { $0 >= 0 && $0 <= 1 }, "normalized levels should stay within display bounds")
        expect((levels.last ?? 0) > 0.12, "active synthetic input should produce a visible level")
    }

    private static func resetDropsDisplayState() {
        var normalizer = LiveAudioLevelNormalizer()

        _ = (0..<6).map { _ in normalizer.normalizedLevel(forRMS: 0.08) }
        normalizer.reset()

        expect(normalizer.normalizedLevel(forRMS: 0) == 0, "reset should clear displayed meter state")
    }

    private static func silenceDecaysWithoutHistory() {
        var normalizer = LiveAudioLevelNormalizer()

        let active = (0..<8).reduce(Float(0)) { _, _ in
            normalizer.normalizedLevel(forRMS: 0.1)
        }
        let decayed = (0..<20).reduce(active) { _, _ in
            normalizer.normalizedLevel(forRMS: 0)
        }

        expect(active > 0.12, "active synthetic input should become visible before decay")
        expect(decayed < active / 2, "silence should decay the visible level without stored meter history")
    }
}
