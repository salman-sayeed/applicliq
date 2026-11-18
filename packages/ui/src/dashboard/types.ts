export type ToastMessage = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'info' | 'error';
};

export type DashboardView = 'list' | 'board';
