export interface GroceryItem {
  id?: number;
  name: string;
  amount: number;
  unit: string;
  checked: boolean;
  createdAt: number;
}

export interface ItemHistory {
  name: string;
  count: number;
}
