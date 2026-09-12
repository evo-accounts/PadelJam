/** Where a back control should go: pop when there is history, else land on Home (deep links and pushes open screens cold). */
export function backTarget(canGoBack: boolean): { kind: 'back' } | { kind: 'replace'; href: '/' } {
  return canGoBack ? { kind: 'back' } : { kind: 'replace', href: '/' };
}
