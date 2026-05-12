export interface GroceryItem {
  id?: number;
  shortId?: string;
  name: string;
  amount: number;
  unit: string;
  checked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ItemHistory {
  name: string;
  count: number;
}
