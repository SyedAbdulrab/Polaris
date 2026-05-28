export interface ComputedMetrics {
  asOf: string; // ISO date
  monthlyIncome: number;
  monthlyExpenses: number;
  projectedMRR: number; // monthlyIncome - monthlyExpenses
  netCashFlow: number; // alias of projectedMRR for the snapshot row, kept for clarity
  savingsRate: number; // (income - expenses) / income, in [-1, 1]
  totalIncome: number; // sum over the *current calendar month* (period total)
  totalExpenses: number; // ditto
}

export interface ProjectionPoint {
  month: number; // 1..N from now
  income: number;
  expenses: number;
  net: number; // cumulative net to that month
}

export interface ProjectionScenario {
  label: 'baseline' | 'upside' | 'downside';
  horizonMonths: number;
  points: ProjectionPoint[];
  endingNet: number;
}

export interface MetricsBundle {
  metrics: ComputedMetrics;
  scenarios: {
    baseline: ProjectionScenario;
    upside: ProjectionScenario;
    downside: ProjectionScenario;
  };
}
