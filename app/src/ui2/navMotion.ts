/** One extra unit belongs to the selected tab, shared continuously during a swipe. */
export function navFrameAt(page: number, index: number, width: number, count = 5) {
  const unit = width / (count + 1);
  const progress = Math.max(0, Math.min(count - 1, page));
  const activity = Math.max(0, 1 - Math.abs(progress - index));
  const preceding = Math.max(0, Math.min(1, index - progress));
  return {
    left: unit * (index + preceding),
    width: unit * (1 + activity),
    // RN scales around the center: compensate by half the extra width.
    translateX: unit * (preceding + activity / 2),
  };
}

/** Reject partial pages and late end events from a superseded tab tap. */
export function settledPageAt(offset: number, width: number, requested: number | null, count = 5): number | null {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return null;
  const index = Math.round(offset / width);
  if (index < 0 || index >= count || Math.abs(offset - index * width) > 1) return null;
  return requested !== null && requested !== index ? null : index;
}
