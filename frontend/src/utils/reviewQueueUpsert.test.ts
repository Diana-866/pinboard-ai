import { describe, expect, it } from 'vitest';
import { mergeReviewQueuePin, upsertReviewQueuePin } from './reviewQueueUpsert';
import type { PendingReviewPin } from '../components/review/ManualApprovalDesk';

const pin = (overrides: Partial<PendingReviewPin> = {}): PendingReviewPin => ({
  id: 'review-pin-1',
  pinId: 'pin-1',
  title: 'Old title',
  description: 'Old description',
  boardName: 'Board',
  boardId: 'board-1',
  imageUrl: 'https://cdn.example/old.png',
  aspectRatio: '2:3',
  reason: '',
  trendMetric: '',
  scheduledTime: '20:15',
  scheduledDate: '2026-11-13',
  destinationUrl: 'https://example.com',
  ...overrides,
});

describe('review queue upsert', () => {
  it('refreshes creative data while preserving the existing queue ID', () => {
    const existing = pin();
    const incoming = pin({
      id: 'review-pin-1-new',
      title: 'New title',
      description: 'Latest description',
      imageUrl: 'https://cdn.example/new.png',
    });

    const merged = mergeReviewQueuePin(existing, incoming);

    expect(merged.id).toBe(existing.id);
    expect(merged.title).toBe('New title');
    expect(merged.description).toBe('Latest description');
    expect(merged.imageUrl).toBe('https://cdn.example/new.png');
  });

  it('replaces the matching pin without duplicating the queue row', () => {
    const existing = pin();
    const refreshed = mergeReviewQueuePin(existing, pin({ title: 'Refreshed' }));

    const result = upsertReviewQueuePin([existing], refreshed);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Refreshed');
  });

  it('appends a different pin', () => {
    const result = upsertReviewQueuePin([pin()], pin({
      id: 'review-pin-2',
      pinId: 'pin-2',
    }));

    expect(result).toHaveLength(2);
    expect(result[1].pinId).toBe('pin-2');
  });
});
