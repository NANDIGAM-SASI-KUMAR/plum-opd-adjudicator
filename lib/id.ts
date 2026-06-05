// lib/id.ts
export function newClaimId(): string {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `CLM_${n}`;
}
