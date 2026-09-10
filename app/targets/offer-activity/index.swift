// Keep the ActivityKit attributes identical to the app module.
import ActivityKit
import SwiftUI
import WidgetKit

struct CofOfferAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
    var title: String
    var priceText: String
    /// Sosyal Paket vurgusu. Bos string = gosterme (paket zaten aktifse).
    var packPitch: String = ""
  }
  var offerId: String
}

@main
struct CofOfferActivityBundle: WidgetBundle {
  var body: some Widget { CofOfferLiveActivity() }
}

private let cofNavy = Color(red: 0.025, green: 0.065, blue: 0.16)
private let cofBlue = Color(red: 0.06, green: 0.30, blue: 0.69)
private let cofCyan = Color(red: 0.40, green: 0.84, blue: 1)
private let cofGold = Color(red: 1, green: 0.83, blue: 0.33)
private let cofLilac = Color(red: 0.83, green: 0.69, blue: 1)

private struct ActivityCopy {
  let turkish = Locale.preferredLanguages.first?.hasPrefix("tr") ?? true
  var offer: String { turkish ? "OYUNA DÖN" : "BACK TO THE GAME" }
  var remaining: String { turkish ? "KALAN SÜRE" : "TIME LEFT" }
  var expired: String { turkish ? "SENİ BEKLİYORUZ" : "WE'RE WAITING" }
  var open: String { turkish ? "Oyuna dön" : "Back to the game" }
  var ended: String { turkish ? "Oyuna dön" : "Back to the game" }
}

private struct CrestShape: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.width * 0.08, y: 0))
    p.addLine(to: CGPoint(x: r.width * 0.92, y: 0))
    p.addLine(to: CGPoint(x: r.width, y: r.height * 0.16))
    p.addLine(to: CGPoint(x: r.width * 0.92, y: r.height * 0.73))
    p.addQuadCurve(to: CGPoint(x: r.midX, y: r.maxY), control: CGPoint(x: r.width * 0.75, y: r.height * 0.92))
    p.addQuadCurve(to: CGPoint(x: r.width * 0.08, y: r.height * 0.73), control: CGPoint(x: r.width * 0.25, y: r.height * 0.92))
    p.addLine(to: CGPoint(x: 0, y: r.height * 0.16))
    p.closeSubpath()
    return p
  }
}

private struct CofCrest: View {
  var size: CGFloat = 48
  var body: some View {
    ZStack {
      CrestShape().fill(LinearGradient(colors: [cofCyan, cofBlue, cofNavy], startPoint: .topLeading, endPoint: .bottomTrailing))
      CrestShape().stroke(cofGold, style: StrokeStyle(lineWidth: 1.5, lineJoin: .round))
      VStack(spacing: 0) {
        Image(systemName: "soccerball").font(.system(size: size * 0.20, weight: .bold)).foregroundColor(.white)
        Text("COF").font(.system(size: size * 0.32, weight: .black, design: .rounded))
          .tracking(-size * 0.02).foregroundColor(.white)
          .shadow(color: cofNavy, radius: 0, y: 1)
      }.offset(y: -size * 0.035)
    }
    .frame(width: size, height: size * 1.10)
    .accessibilityLabel("Crossover")
  }
}

// Pitch markings are decorative, not a fake progress indicator.
private struct PitchBackdrop: View {
  var body: some View {
    GeometryReader { g in
      Path { p in
        let r = CGRect(x: g.size.width * 0.54, y: -20, width: g.size.width * 0.42, height: g.size.height + 40)
        p.addRoundedRect(in: r, cornerSize: CGSize(width: 8, height: 8))
        p.move(to: CGPoint(x: r.minX, y: r.midY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        p.addEllipse(in: CGRect(x: r.midX - 29, y: r.midY - 29, width: 58, height: 58))
      }.stroke(cofCyan.opacity(0.10), lineWidth: 1)
    }.clipped().accessibilityHidden(true)
  }
}

private struct OfferClock: View {
  let state: CofOfferAttributes.ContentState
  var expired: Bool = false
  var compact: Bool = false
  var body: some View {
    Group {
      if expired {
        Text(compact ? "—" : ActivityCopy().expired)
      } else {
        Text(timerInterval: Date.now...max(Date.now, state.endsAt), countsDown: true).monospacedDigit()
      }
    }
    .font(.system(size: compact ? 12 : 21, weight: .heavy, design: .rounded))
    .foregroundColor(expired ? .white.opacity(0.65) : cofGold)
    .lineLimit(1).minimumScaleFactor(0.75).multilineTextAlignment(.trailing)
  }
}

private struct OfferDetails: View {
  let state: CofOfferAttributes.ContentState
  var expired = false
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(state.title).font(.system(size: 16, weight: .bold, design: .rounded))
        .foregroundColor(.white).lineLimit(2).minimumScaleFactor(0.85)
        .fixedSize(horizontal: false, vertical: true)
      if !expired {
        HStack(spacing: 5) {
          Image(systemName: "diamond.fill").font(.system(size: 10, weight: .bold)).accessibilityHidden(true)
          Text(state.priceText).font(.system(size: 13, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.8)
        }.foregroundColor(cofLilac)
      }
      // Sosyal Paket vurgusu — yalniz paketi olmayanlara gonderilir.
      if !state.packPitch.isEmpty {
        HStack(spacing: 4) {
          Image(systemName: "lock.open.fill").font(.system(size: 9, weight: .bold)).accessibilityHidden(true)
          Text(state.packPitch).font(.system(size: 11, weight: .heavy, design: .rounded))
            .lineLimit(1).minimumScaleFactor(0.75)
        }
        .foregroundColor(cofNavy)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Capsule().fill(cofGold))
      }
    }
  }
}


private struct ExpandedOfferCard: View {
  let state: CofOfferAttributes.ContentState
  let expired: Bool
  var body: some View {
    HStack(spacing: 12) {
      CofCrest(size: 48)
      VStack(alignment: .leading, spacing: 8) {
        OfferDetails(state: state, expired: expired)
        HStack(spacing: 5) {
          Text(expired ? ActivityCopy().ended : ActivityCopy().open)
          Image(systemName: "chevron.right")
        }.font(.system(size: 10, weight: .semibold)).foregroundColor(cofCyan)
      }.frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(12)
    .background {
      RoundedRectangle(cornerRadius: 18).fill(LinearGradient(colors: [cofBlue, cofNavy], startPoint: .topLeading, endPoint: .bottomTrailing))
      PitchBackdrop().clipShape(RoundedRectangle(cornerRadius: 18))
    }
    .overlay(RoundedRectangle(cornerRadius: 18).stroke(cofCyan.opacity(0.35), lineWidth: 1))
  }
}

private struct OfferLockScreen: View {
  let state: CofOfferAttributes.ContentState
  let expired: Bool
  private let copy = ActivityCopy()
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 10) {
        CofCrest(size: 30)
        VStack(alignment: .leading, spacing: 3) {
          Text("CROSSOVER").font(.system(size: 13, weight: .black, design: .rounded)).tracking(1.4).foregroundColor(.white)
          Text(expired ? copy.expired : copy.offer).font(.system(size: 9, weight: .heavy)).tracking(1).foregroundColor(cofCyan)
        }
        Spacer(minLength: 6)
        Image(systemName: "soccerball").font(.system(size: 30, weight: .light)).foregroundColor(cofCyan.opacity(0.45)).accessibilityHidden(true)
      }
      Rectangle().fill(.white.opacity(0.12)).frame(height: 1).accessibilityHidden(true)
      HStack(alignment: .center, spacing: 12) {
        OfferDetails(state: state, expired: expired).frame(maxWidth: .infinity, alignment: .leading)
        VStack(alignment: .trailing, spacing: 5) {
          Text(expired ? copy.expired : copy.remaining).font(.system(size: 8, weight: .heavy)).tracking(1).foregroundColor(.white.opacity(0.75))
          OfferClock(state: state, expired: expired).frame(width: 100)
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12).fill(cofNavy.opacity(0.60)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(cofCyan.opacity(0.22), lineWidth: 1))
      }
      HStack(spacing: 5) {
        Text(expired ? copy.ended : copy.open).font(.system(size: 10, weight: .semibold))
        Image(systemName: "chevron.right").font(.system(size: 8, weight: .bold))
      }.foregroundColor(.white.opacity(0.75))
    }
    .padding(12)
    .background {
      LinearGradient(colors: [cofBlue, cofNavy], startPoint: .topLeading, endPoint: .bottomTrailing)
      PitchBackdrop()
    }
    .activityBackgroundTint(cofNavy)
    .activitySystemActionForegroundColor(cofGold)
  }
}

struct CofOfferLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CofOfferAttributes.self) { context in
      OfferLockScreen(state: context.state, expired: context.isStale || context.state.endsAt <= Date.now)
    } dynamicIsland: { context in
      let expired = context.isStale || context.state.endsAt <= Date.now
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 4) {
            Text("CROSSOVER").font(.system(size: 12, weight: .black, design: .rounded)).foregroundColor(.white)
            Text(ActivityCopy().offer).font(.system(size: 8, weight: .bold)).foregroundColor(cofCyan).lineLimit(1)
          }.padding(.leading, 4).padding(.top, 5)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 4) {
            Text(expired ? ActivityCopy().expired : ActivityCopy().remaining)
              .font(.system(size: 8, weight: .heavy)).foregroundColor(.white.opacity(0.7))
            OfferClock(state: context.state, expired: expired).frame(width: 104)
          }.padding(.top, 5)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ExpandedOfferCard(state: context.state, expired: expired).padding(.top, 8)
        }
      } compactLeading: {
        // Centigi kaplamasin (kullanici karari 2026-09-11): marka rozeti yerine
        // kucuk arma, sagda ikonsuz dar saat.
        CofCrest(size: 16)
      } compactTrailing: {
        OfferClock(state: context.state, expired: expired, compact: true).frame(width: 42)
      } minimal: {
        CofCrest(size: 22)
      }
      .keylineTint(cofCyan)
    }
  }
}
