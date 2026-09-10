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
    /// Sosyal Paket vurgusu. Bos string = gosterme (paket zaten aktifse).
    var packPitch: String = ""
  }
  var offerId: String
}

/// Adada geri sayimin durabilecegi en uzun sure (30 dk).
private let MAX_WINDOW: TimeInterval = 30 * 60

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
    AsyncFunction("startOffer") { (offerId: String, title: String, priceText: String, endsAtMs: Double, packPitch: String) -> Bool in
      if #available(iOS 16.2, *) {
        // SURE TAVANI (kullanici karari 2026-09-11): "cok uzun kaliyor".
        // Gunluk firsat saatlerce surebiliyor; adada geri sayim en fazla
        // MAX_WINDOW kadar durur. Tavan gecince widget "oyuna don" haline
        // gecer, uygulama bir sonraki acilista endAll() ile temizler.
        let rawEndsAt = Date(timeIntervalSince1970: endsAtMs / 1000.0)
        let endsAt = min(rawEndsAt, Date().addingTimeInterval(MAX_WINDOW))
        guard endsAt.timeIntervalSinceNow > 60 else { return false }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        for activity in Activity<CofOfferAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        let attributes = CofOfferAttributes(offerId: offerId)
        let state = CofOfferAttributes.ContentState(endsAt: endsAt, title: title, priceText: priceText, packPitch: packPitch)
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
