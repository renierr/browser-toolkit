export type Drop = {
  id: string;
  filename: string;
  size: number;
  type: string;
  source: string;
  uploaded_at: number;
  expires_at: number | null;
};
