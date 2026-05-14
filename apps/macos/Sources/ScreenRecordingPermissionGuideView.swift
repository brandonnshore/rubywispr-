import AppKit
import SwiftUI

struct ScreenRecordingPermissionGuideView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                DraggablePermissionAppTile()

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(AppName.displayName) not listed?")
                        .font(.headline)
                    Text("Drag the app tile into Screen & System Audio Recording, or reveal the app and add it with the plus button. Then turn it on and reopen if macOS asks.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 8) {
                Button {
                    appState.requestScreenCapturePermission()
                } label: {
                    Label("Open Screen Recording", systemImage: "camera.viewfinder")
                }

                Button {
                    appState.revealAppInFinderForPermission()
                } label: {
                    Label("Reveal App", systemImage: "folder")
                }

                Button {
                    appState.hasScreenRecordingPermission = appState.hasScreenCapturePermission()
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.82))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
    }
}

private struct DraggablePermissionAppTile: View {
    private var appURL: URL {
        Bundle.main.bundleURL
    }

    private var appIcon: NSImage {
        NSWorkspace.shared.icon(forFile: appURL.path)
    }

    var body: some View {
        VStack(spacing: 6) {
            Image(nsImage: appIcon)
                .resizable()
                .frame(width: 42, height: 42)
                .shadow(color: .black.opacity(0.18), radius: 8, y: 4)

            Text(appURL.lastPathComponent)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .truncationMode(.middle)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(width: 132)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .windowBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.10), lineWidth: 1)
        )
        .onDrag {
            NSItemProvider(object: appURL as NSURL)
        }
        .help("Drag \(appURL.lastPathComponent) into Screen & System Audio Recording if it is not listed.")
    }
}
