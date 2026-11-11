/**
 * Shared pin-generation types.
 *
 * Generation runs on the backend (POST /boards/:id/pins/generate) so credits,
 * journaling and provider keys stay server-side. The UI only needs the shape of
 * a generated variation and the aspect ratios the API accepts.
 */
export type SupportedAspectRatio = '2:3' | '3:4' | '9:16' | '1:1' | '4:5';

export interface GeneratedPinVariation {
  /** Server-side pin id; required to persist edits, approve, schedule or publish. */
  id: string;
  titles: string[];
  selectedTitle: string;
  description: string;
  altText: string;
  suggestedBoard: string;
  keywords: string[];
  headlineOverlay: string;
  subheadlineOverlay: string;
  ctaText: string;
  imageUrl: string;
  tone: string;
  aspectRatio: SupportedAspectRatio;
}
