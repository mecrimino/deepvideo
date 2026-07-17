/** Client for the stock-footage endpoints (Pexels/Pixabay search + import). */

import type {
  StockImportRequest,
  StockImportResponse,
  StockSearchRequest,
  StockSearchResponse,
} from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function searchStock(req: StockSearchRequest): Promise<StockSearchResponse> {
  return fetchJson<StockSearchResponse, StockSearchRequest>('/api/stock/search', { body: req });
}

export function importStock(req: StockImportRequest): Promise<StockImportResponse> {
  return fetchJson<StockImportResponse, StockImportRequest>('/api/stock/import', { body: req });
}
