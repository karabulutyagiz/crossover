// Günlük Fırsat Live Activity — kilit ekranı + Dynamic Island.
// Geri sayım Text(timerInterval:)'la SİSTEM tarafından akar: push/güncelleme
// gerekmez; süre dolunca staleDate ile aktivite bayatlar ve kapatılır.
// DİKKAT: CofOfferAttributes, uygulama hedefindeki (modules/cof-live-activity)
// kopyayla BİREBİR aynı olmalı — ActivityKit tip adı + alanlarla eşleştirir.
import ActivityKit
import SwiftUI
import WidgetKit

struct CofOfferAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
    var title: String
    var priceText: String
  }
  var offerId: String
}

@main
struct CofOfferActivityBundle: WidgetBundle {
  var body: some Widget {
    CofOfferLiveActivity()
  }
}

// Marka renkleri (theme.ts ile uyumlu — koyu lacivert zemin + altın vurgu).
private let cofNavy = Color(red: 0.043, green: 0.094, blue: 0.22)     // #0B1838
private let cofGold = Color(red: 1.0, green: 0.808, blue: 0.227)      // #FFCE3A
private let cofGem = Color(red: 0.659, green: 0.333, blue: 0.969)     // #A855F7

private func timerText(_ state: CofOfferAttributes.ContentState) -> some View {
  Text(timerInterval: Date.now...max(Date.now, state.endsAt), countsDown: true)
    .monospacedDigit()
    .multilineTextAlignment(.trailing)
}

struct CofOfferLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CofOfferAttributes.self) { context in
      // ── Kilit ekranı / banner ──
      HStack(spacing: 12) {
        Text("💎")
          .font(.system(size: 28))
        VStack(alignment: .leading, spacing: 2) {
          Text("SANA ÖZEL FIRSAT")
            .font(.system(size: 11, weight: .heavy))
            .foregroundColor(cofGold)
          Text(context.state.title)
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
          Text(context.state.priceText)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(cofGem)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text("KALAN")
            .font(.system(size: 10, weight: .heavy))
            .foregroundColor(.white.opacity(0.55))
          timerText(context.state)
            .font(.system(size: 20, weight: .heavy))
            .foregroundColor(.white)
            .frame(maxWidth: 84)
        }
      }
      .padding(14)
      .activityBackgroundTint(cofNavy)
      .activitySystemActionForegroundColor(cofGold)
    } dynamicIsland: { context in
      DynamicIsland {
        // ── Genişletilmiş ada ──
        DynamicIslandExpandedRegion(.leading) {
          Text("💎")
            .font(.system(size: 26))
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text(context.state.title)
              .font(.system(size: 14, weight: .bold))
              .foregroundColor(.white)
              .lineLimit(1)
            Text(context.state.priceText)
              .font(.system(size: 12, weight: .semibold))
              .foregroundColor(cofGem)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          timerText(context.state)
            .font(.system(size: 17, weight: .heavy))
            .foregroundColor(cofGold)
            .frame(maxWidth: 70)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Fırsat süresi dolmadan mağazaya göz at")
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.white.opacity(0.6))
        }
      } compactLeading: {
        Text("💎")
      } compactTrailing: {
        timerText(context.state)
          .font(.system(size: 12, weight: .heavy))
          .foregroundColor(cofGold)
          .frame(maxWidth: 52)
      } minimal: {
        Text("💎")
      }
      .keylineTint(cofGold)
    }
  }
}
