/** Denominaciones guatemaltecas para el arqueo de caja. */
export const DENOM_FIELDS = [
  { field: 'bil_200', label: 'Q200',  centavos: 20000, kind: 'B' as const },
  { field: 'bil_100', label: 'Q100',  centavos: 10000, kind: 'B' as const },
  { field: 'bil_50',  label: 'Q50',   centavos: 5000,  kind: 'B' as const },
  { field: 'bil_20',  label: 'Q20',   centavos: 2000,  kind: 'B' as const },
  { field: 'bil_10',  label: 'Q10',   centavos: 1000,  kind: 'B' as const },
  { field: 'bil_5',   label: 'Q5',    centavos: 500,   kind: 'B' as const },
  { field: 'mon_1',   label: 'Q1',    centavos: 100,   kind: 'M' as const },
  { field: 'mon_050', label: 'Q0.50', centavos: 50,    kind: 'M' as const },
  { field: 'mon_025', label: 'Q0.25', centavos: 25,    kind: 'M' as const },
  { field: 'mon_010', label: 'Q0.10', centavos: 10,    kind: 'M' as const },
  { field: 'mon_005', label: 'Q0.05', centavos: 5,     kind: 'M' as const },
] as const;
