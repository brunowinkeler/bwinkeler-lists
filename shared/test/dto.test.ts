import { describe, expect, it } from 'vitest';
import {
  createItemInputSchema,
  deleteCompletedItemsInputSchema,
  loginInputSchema,
} from '../src/dto';
import { LIST_KINDS, MEMBER_ROLES } from '../src/enums';

describe('shared DTOs', () => {
  it('normalizes the login email to lowercase', () => {
    const parsed = loginInputSchema.parse({ email: 'ADMIN@Example.Test', password: 'secret' });
    expect(parsed.email).toBe('admin@example.test');
  });

  it('rejects an invalid login email', () => {
    expect(loginInputSchema.safeParse({ email: 'not-an-email', password: 'secret' }).success).toBe(
      false,
    );
  });

  it('rejects an item with an empty title', () => {
    expect(createItemInputSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('accepts an item title and optional task fields', () => {
    const parsed = createItemInputSchema.parse({ title: 'Buy milk', dueDate: '2026-08-01' });
    expect(parsed.title).toBe('Buy milk');
    expect(parsed.dueDate).toBe('2026-08-01');
  });

  it('supports list, category, and Uncategorized completed-item scopes', () => {
    expect(deleteCompletedItemsInputSchema.parse({})).toEqual({});
    expect(deleteCompletedItemsInputSchema.parse({ categoryId: null })).toEqual({
      categoryId: null,
    });
    expect(deleteCompletedItemsInputSchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});

describe('shared enums', () => {
  it('defines the two list kinds and two roles', () => {
    expect(LIST_KINDS).toEqual(['simple', 'task']);
    expect(MEMBER_ROLES).toEqual(['owner', 'editor']);
  });
});
