import type {
  CreateItemInput,
  CreateListInput,
  ItemDto,
  ListDetailDto,
  ListSummaryDto,
  ReorderItemInput,
  UpdateItemInput,
} from '@bwinkeler-lists/shared';
import { apiGet, apiSend } from '../../lib/api';

export const listsKey = ['lists'] as const;
export const listKey = (id: string): readonly ['list', string] => ['list', id];

export function fetchLists(): Promise<{ lists: ListSummaryDto[] }> {
  return apiGet('/lists');
}

export function fetchListDetail(id: string): Promise<ListDetailDto> {
  return apiGet(`/lists/${id}`);
}

export function createList(input: CreateListInput): Promise<{ list: ListSummaryDto }> {
  return apiSend('POST', '/lists', input);
}

export function renameList(id: string, name: string): Promise<{ list: ListSummaryDto }> {
  return apiSend('PATCH', `/lists/${id}`, { name });
}

export function deleteList(id: string): Promise<void> {
  return apiSend('DELETE', `/lists/${id}`);
}

export function createItem(listId: string, input: CreateItemInput): Promise<{ item: ItemDto }> {
  return apiSend('POST', `/lists/${listId}/items`, input);
}

export function updateItem(id: string, input: UpdateItemInput): Promise<{ item: ItemDto }> {
  return apiSend('PATCH', `/items/${id}`, input);
}

export function reorderItem(id: string, input: ReorderItemInput): Promise<{ item: ItemDto }> {
  return apiSend('PATCH', `/items/${id}/position`, input);
}

export function deleteItem(id: string): Promise<void> {
  return apiSend('DELETE', `/items/${id}`);
}
