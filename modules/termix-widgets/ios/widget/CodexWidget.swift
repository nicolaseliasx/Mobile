import Foundation
import SwiftUI
import WidgetKit

struct CodexEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
  let status: WidgetCodexSummary?
}

struct CodexProvider: TimelineProvider {
  private static let statusURL = URL(string: "https://ios.ncls.cc/status.json")!
  private static let refreshInterval: TimeInterval = 3 * 60

  func placeholder(in context: Context) -> CodexEntry {
    CodexEntry(date: Date(), snapshot: .placeholder, status: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (CodexEntry) -> Void) {
    let snapshot = context.isPreview ? WidgetSnapshot.placeholder : SharedStore.loadSnapshot()
    completion(CodexEntry(date: Date(), snapshot: snapshot, status: snapshot.codex))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CodexEntry>) -> Void) {
    let snapshot = SharedStore.loadSnapshot()
    var request = URLRequest(url: Self.statusURL)
    request.timeoutInterval = 10
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let validResponse = (response as? HTTPURLResponse)?.statusCode == 200
      let remote = validResponse ? data.flatMap {
        try? JSONDecoder().decode(WidgetCodexSummary.self, from: $0)
      } : nil
      let now = Date()
      let entry = CodexEntry(date: now, snapshot: snapshot, status: remote ?? snapshot.codex)
      completion(Timeline(entries: [entry], policy: .after(now.addingTimeInterval(Self.refreshInterval))))
    }.resume()
  }
}

/** Redacted quotas from the most recent authenticated app refresh. */
struct CodexWidget: Widget {
  static let kind = "TermixCodexWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: CodexProvider()) { entry in
      CodexWidgetView(entry: entry)
    }
    .configurationDisplayName("Codex NCLS")
    .description("Status and remaining quota for Codex and Codex2.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

private struct CodexProfileView: View {
  let name: String
  let profile: WidgetCodexProfile
  let compact: Bool
  let accent: Color

  private var statusColor: Color {
    switch profile.state {
    case "available": return Theme.online
    case "limited": return Theme.offline
    default: return Theme.unknown
    }
  }

  private var stateLabel: String {
    switch profile.state {
    case "available": return "OK"
    case "limited": return "LIMIT"
    default: return "UNKNOWN"
    }
  }

  private func percent(_ value: Double?) -> String {
    guard let value else { return "--" }
    return "\(Int(value.rounded()))%"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 3 : 5) {
      HStack(spacing: 5) {
        Circle().fill(statusColor).frame(width: 6, height: 6)
        Text(name)
          .font(Theme.mono(compact ? 10 : 12, weight: .bold))
          .foregroundColor(Theme.textPrimary)
        Spacer(minLength: 2)
        Text(stateLabel)
          .font(Theme.label(8))
          .foregroundColor(statusColor)
      }

      if compact {
        HStack(spacing: 5) {
          Text(percent(profile.remainingPercent))
            .font(Theme.mono(15, weight: .bold))
            .foregroundColor(Theme.textPrimary)
          Spacer(minLength: 0)
          Text("S \(percent(profile.shortRemainingPercent)) · L \(percent(profile.longRemainingPercent))")
            .font(Theme.mono(7))
            .foregroundColor(Theme.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      } else {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
          Text(percent(profile.remainingPercent))
            .font(Theme.mono(25, weight: .bold))
            .foregroundColor(Theme.textPrimary)
          Text("left")
            .font(Theme.label(8))
            .foregroundColor(Theme.textTertiary)
        }
        HStack(spacing: 8) {
          Text("SHORT \(percent(profile.shortRemainingPercent))")
          Text("LONG \(percent(profile.longRemainingPercent))")
        }
        .font(Theme.mono(8))
        .foregroundColor(Theme.textSecondary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        Text("\(profile.activeSessionCount) active")
          .font(Theme.mono(8))
          .foregroundColor(accent)
      }
    }
    .padding(compact ? 6 : 9)
    .frame(maxWidth: .infinity, alignment: .leading)
    .termixCard()
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(name), \(stateLabel), \(percent(profile.remainingPercent)) remaining, \(profile.activeSessionCount) active sessions")
  }
}

struct CodexWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: CodexEntry

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }
  private var isStale: Bool {
    guard let status = entry.status else { return false }
    return Date().timeIntervalSince1970 * 1000 - status.checkedAt > 30 * 60 * 1000
  }

  var body: some View {
    VStack(alignment: .leading, spacing: family == .systemSmall ? 5 : 8) {
      HStack(spacing: 5) {
        Rectangle().fill(accent).frame(width: 3, height: 11)
        Text("DEVHUB · CODEX")
          .font(Theme.label(9))
          .foregroundColor(Theme.textPrimary)
        Spacer(minLength: 2)
        Circle().fill(entry.status == nil || isStale ? Theme.offline : Theme.online)
          .frame(width: 5, height: 5)
      }
      if let status = entry.status {
        if family == .systemSmall {
          VStack(spacing: 5) {
            CodexProfileView(name: "Codex", profile: status.codex, compact: true, accent: accent)
            CodexProfileView(name: "Codex2", profile: status.codex2, compact: true, accent: accent)
          }
        } else {
          HStack(alignment: .top, spacing: 8) {
            CodexProfileView(name: "Codex", profile: status.codex, compact: false, accent: accent)
            CodexProfileView(name: "Codex2", profile: status.codex2, compact: false, accent: accent)
          }
        }
        Spacer(minLength: 0)
        HStack {
          if isStale {
            Text("STALE DATA")
              .foregroundColor(Theme.offline)
          } else {
            Text("CHECKED \(relativeAge(from: Date(timeIntervalSince1970: status.checkedAt / 1000))) AGO")
              .foregroundColor(Theme.textTertiary)
          }
          Spacer(minLength: 0)
        }
        .font(Theme.mono(8))
      } else {
        Spacer(minLength: 0)
        Text("Status unavailable")
          .font(Theme.mono(11, weight: .semibold))
          .foregroundColor(Theme.textSecondary)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetBackground()
    .widgetURL(WidgetSnapshot.sessionsLink)
    .unredacted()
  }
}
