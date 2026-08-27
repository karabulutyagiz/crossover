import type {
  Platform, PublishInput, PublishResult, PostMetrics, ProviderLimits, PublishingCapabilities,
} from '../core/types.ts';

// SocialProvider sözleşmesi (bölüm 3). Her platform bu arayüzü uygular;
// platform kodu birbirine sızmaz. Programatik yayın desteklemeyen platformlar
// publish() yerine createManualTask() ile insan görevine düşer.

export interface ValidationResult {
  valid: boolean;
  problems: string[];
}

export interface AuthStatus {
  configured: boolean;
  detail: string;
}

export interface ManualTaskInput {
  title: string;
  instructions: string;
  payload: Record<string, unknown>;
}

export interface SocialProvider {
  readonly platform: Platform;

  /** İçeriği resmi API ile yayınlar. Yayın desteği yoksa failure: 'not_configured'. */
  publish(input: PublishInput): Promise<PublishResult>;

  /**
   * Platformun KENDİ zamanlama özelliği (varsa). Merkezi zamanlama
   * growth_scheduled_posts'ta yapılır; native destek yoksa null döner.
   */
  schedule(input: PublishInput, at: Date): Promise<PublishResult | null>;

  /** Platform kurallarına göre içerik doğrulama (uzunluk, medya şartı...). */
  validateContent(input: PublishInput): ValidationResult;

  /** Yayınlanmış bir gönderinin metrikleri (yoksa null — asla uydurulmaz). */
  getMetrics(externalId: string): Promise<PostMetrics | null>;

  /** Resmi API limitlerinin ALTINDA kalan güvenli varsayılanlar. */
  getLimits(): ProviderLimits;

  /** Token durumu / yenileme. */
  refreshAuthentication(): Promise<AuthStatus>;

  getPublishingCapabilities(): PublishingCapabilities;
}
