// RN → ActivityKit köprüsü: Günlük Fırsat Live Activity'sini başlat/bitir.
// iOS 16.2 altı ve Live Activities kapalıysa sessiz no-op (isSupported=false).
// DİKKAT: CofOfferAttributes, widget hedefindeki (targets/offer-activity)
// kopyayla BİREBİR aynı olmalı — ActivityKit tip adı + alanlarla eşleştirir.
import ActivityKit
import ExpoModulesCore

struct CofOfferAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
    var title: String
    var priceText: String
  }
  var offerId: String
}

public class CofLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CofLiveActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Aynı anda tek fırsat aktivitesi: öncekiler kapatılır, yenisi açılır.
    // endsAtMs geçmişteyse hiç açılmaz (bayat fırsat adaya düşmesin).
    AsyncFunction("startOffer") { (offerId: String, title: String, priceText: String, endsAtMs: Double) -> Bool in
      if #available(iOS 16.2, *) {
        let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000.0)
        guard endsAt.timeIntervalSinceNow > 60 else { return false }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        for activity in Activity<CofOfferAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        let attributes = CofOfferAttributes(offerId: offerId)
        let state = CofOfferAttributes.ContentState(endsAt: endsAt, title: title, priceText: priceText)
        do {
          _ = try Activity.request(
            attributes: attributes,
            content: .init(state: state, staleDate: endsAt)
          )
          return true
        } catch {
          return false
        }
      }
      return false
    }

    AsyncFunction("endAll") { () in
      if #available(iOS 16.2, *) {
        for activity in Activity<CofOfferAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }
  }
}
